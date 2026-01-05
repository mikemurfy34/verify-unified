import canonicalize from "canonicalize";
import nacl from "tweetnacl";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Content-Type, x-api-key",
  "access-control-allow-methods": "OPTIONS, POST, GET",
};

function b64ToBytesSafe(str) {
  if (!str || typeof str !== "string") {
    return null;
  }
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = normalized.length % 4;
  const padded =
    padLen === 0
      ? normalized
      : padLen === 2
      ? normalized + "=="
      : padLen === 3
      ? normalized + "="
      : normalized + "===";

  try {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function sha256Bytes(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function makePayload(base, debugMode, debugExtra) {
  if (debugMode && debugExtra && Object.keys(debugExtra).length > 0) {
    return { ...base, debug: debugExtra };
  }
  return base;
}

function validateProofShape(proof) {
  const issues = [];

  if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
    issues.push({ path: "/", message: "proof must be an object" });
    return { ok: false, issues };
  }

  const keys = Object.keys(proof);
  const allowedTop = ["meta", "refs", "sig"];
  for (const k of keys) {
    if (!allowedTop.includes(k)) {
      issues.push({
        path: "/",
        message: `unexpected top-level property: ${k}`,
      });
    }
  }

  if (!("meta" in proof)) {
    issues.push({ path: "/meta", message: "missing meta" });
  }
  if (!("refs" in proof)) {
    issues.push({ path: "/refs", message: "missing refs" });
  }
  if (!("sig" in proof)) {
    issues.push({ path: "/sig", message: "missing sig" });
  }

  if (proof.meta === null || typeof proof.meta !== "object" || Array.isArray(proof.meta)) {
    issues.push({ path: "/meta", message: "meta must be an object" });
  }

  if (!Array.isArray(proof.refs)) {
    issues.push({ path: "/refs", message: "refs must be an array" });
  } else if (proof.refs.length === 0) {
    issues.push({ path: "/refs", message: "refs must not be empty" });
  } else {
    proof.refs.forEach((r, idx) => {
      const p = `/refs/${idx}`;
      if (!r || typeof r !== "object" || Array.isArray(r)) {
        issues.push({ path: p, message: "ref must be an object" });
        return;
      }
      if (typeof r.path !== "string" || !r.path) {
        issues.push({ path: `${p}/path`, message: "ref.path must be a non-empty string" });
      }
      if (typeof r.hash !== "string" || !r.hash) {
        issues.push({ path: `${p}/hash`, message: "ref.hash must be a non-empty string" });
      }
    });
  }

  if (!proof.sig || typeof proof.sig !== "object" || Array.isArray(proof.sig)) {
    issues.push({ path: "/sig", message: "sig must be an object" });
  } else {
    const s = proof.sig;
    const requiredSig = ["alg", "publicKey", "sig", "hash"];
    for (const k of requiredSig) {
      if (typeof s[k] !== "string" || !s[k]) {
        issues.push({
          path: `/sig/${k}`,
          message: `sig.${k} must be a non-empty string`,
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

async function handleVerify(request, env) {
  const debugMode = env.DEBUG_VERIFY_UNIFIED === "1";

  const respond = (status, base, debugExtra) => {
    const payload = makePayload(base, debugMode, debugExtra);
    const body = debugMode
      ? JSON.stringify(payload, null, 2)
      : JSON.stringify(payload);

    return new Response(body, {
      status,
      headers: {
        ...CORS_HEADERS,
        "content-type": "application/json; charset=utf-8",
      },
    });
  };

  const apiKey = request.headers.get("x-api-key");
  const envKey = env.VERIFY_API_KEY;

  if (!envKey) {
    return respond(
      500,
      {
        ok: false,
        error: "missing_env_key",
        detail: "VERIFY_API_KEY is not set in the Worker environment",
      },
      {
        sawApiKey: !!apiKey,
        apiKeyLength: apiKey ? apiKey.length : 0,
      },
    );
  }

  if (!apiKey) {
    return respond(
      401,
      {
        ok: false,
        error: "unauthorized",
        detail: "missing_x_api_key",
      },
      {
        envKeyPresent: true,
      },
    );
  }

  if (apiKey !== envKey) {
    return respond(
      401,
      {
        ok: false,
        error: "unauthorized",
        detail: "api_key_mismatch",
      },
      {
        envKeyPresent: true,
        apiKeyLength: apiKey.length,
        envKeyLength: envKey.length,
      },
    );
  }

  let proof;
  try {
    proof = await request.json();
  } catch (err) {
    return respond(
      400,
      {
        ok: false,
        error: "invalid_json",
      },
      {
        message: err instanceof Error ? err.message : String(err),
      },
    );
  }

  const shape = validateProofShape(proof);
  if (!shape.ok) {
    return respond(
      422,
      {
        ok: false,
        error: "invalid_proof_schema",
      },
      {
        issues: shape.issues,
        receivedKeys:
          proof && typeof proof === "object" ? Object.keys(proof) : [],
      },
    );
  }

  const { meta, refs, sig } = proof;

  if (sig.alg !== "Ed25519-SHA256-RFC8785") {
    return respond(
      422,
      {
        ok: false,
        error: "unsupported_alg",
      },
      {
        got: sig.alg,
      },
    );
  }

  if (sig.algorithm && sig.algorithm !== "Ed25519") {
    return respond(
      422,
      {
        ok: false,
        error: "unsupported_signature_algorithm",
      },
      {
        got: sig.algorithm,
      },
    );
  }

  const canonical = canonicalize({ meta, refs });

  if (typeof canonical !== "string") {
    return respond(
      500,
      {
        ok: false,
        error: "canonicalize_failed",
      },
      {
        canonicalType: typeof canonical,
      },
    );
  }

  const digestBytes = await sha256Bytes(canonical);
  const sigHashBytes = b64ToBytesSafe(sig.hash);

  if (!sigHashBytes) {
    return respond(
      422,
      {
        ok: false,
        error: "invalid_sig_hash_encoding",
      },
      {
        hashLength: sig.hash ? sig.hash.length : 0,
      },
    );
  }

  const hashOk = timingSafeEqual(digestBytes, sigHashBytes);

  if (!hashOk) {
    return respond(
      422,
      {
        ok: false,
        error: "hash_mismatch",
        hash_ok: false,
        sig_ok: false,
        refs_ok: false,
      },
      {
        computedHashBase64: bytesToBase64(digestBytes),
        providedHash: sig.hash,
      },
    );
  }

  const pubKeyBytes = b64ToBytesSafe(sig.publicKey);
  if (!pubKeyBytes || pubKeyBytes.length !== 32) {
    return respond(
      422,
      {
        ok: false,
        error: "invalid_public_key",
      },
      {
        publicKeyLength: pubKeyBytes ? pubKeyBytes.length : 0,
      },
    );
  }

  const sigBytes = b64ToBytesSafe(sig.sig);
  if (!sigBytes || sigBytes.length !== 64) {
    return respond(
      422,
      {
        ok: false,
        error: "invalid_signature_bytes",
      },
      {
        signatureLength: sigBytes ? sigBytes.length : 0,
      },
    );
  }

  let sigOk = false;
  let sigMode = "none";

  try {
    // 1) Preferred mode: sign/verify the SHA-256 digest bytes (Ed25519-SHA256-RFC8785)
    if (nacl.sign.detached.verify(digestBytes, sigBytes, pubKeyBytes)) {
      sigOk = true;
      sigMode = "digest";
    } else {
      // 2) Fallback: some proof writers sign the canonical JSON bytes directly
      const canonicalBytes = new TextEncoder().encode(canonical);
      if (nacl.sign.detached.verify(canonicalBytes, sigBytes, pubKeyBytes)) {
        sigOk = true;
        sigMode = "canonical";
      } else {
        sigMode = "none";
      }
    }
  } catch (err) {
    return respond(
      500,
      {
        ok: false,
        error: "verify_exception",
      },
      {
        message: err instanceof Error ? err.message : String(err),
      },
    );
  }

  const base = {
    ok: sigOk,
    hash_ok: true,
    sig_ok: sigOk,
    refs_ok: true,
    alg: sig.alg,
    sig_mode: sigMode,
    meta: {
      system: meta.system,
      domain: meta.domain,
      kind: meta.kind,
      as_of: meta.as_of,
      version: meta.version,
    },
  };

  const debug = {
    digest_base64: bytesToBase64(digestBytes),
    provided_hash: sig.hash,
    sig_mode: sigMode,
    publicKeyLength: pubKeyBytes.length,
    signatureLength: sigBytes.length,
  };

  return respond(sigOk ? 200 : 422, base, debug);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Normalize path so //verify and /verify/ behave like /verify
    url.pathname = ("/" + (url.pathname || "/").replace(/^\/+/, "").replace(/\/+$/, "")).replace(/\/{2,}/g, "/") || "/";
    // Also tolerate callers that accidentally append "/verify" twice (base already ends with /verify)
    if (url.pathname.endsWith("/verify") && url.pathname !== "/verify") url.pathname = "/verify";
    if (url.pathname.endsWith("/health") && url.pathname !== "/health") url.pathname = "/health";
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (path === "/health") {
      const body = JSON.stringify(
        {
          ok: true,
          worker: "verify-unified",
          ts: new Date().toISOString(),
        },
        null,
        env.DEBUG_VERIFY_UNIFIED === "1" ? 2 : 0,
      );

      return new Response(body, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "content-type": "application/json; charset=utf-8",
        },
      });
    }

    if (path === "/verify" && method === "POST") {
      return handleVerify(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};