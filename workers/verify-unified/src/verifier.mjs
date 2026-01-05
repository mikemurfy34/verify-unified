const te = new TextEncoder();

// --- base64url helpers ---
function b64uEncode(buf) {
  let b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64uDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- RFC 8785-ish canonical JSON (deterministic key ordering) ---
export function canonicalize(obj) {
  return _canon(obj);
  function _canon(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(_canon).join(",") + "]";
    const keys = Object.keys(v).sort();
    let first = true, out = "{";
    for (const k of keys) {
      if (!first) out += ",";
      first = false;
      out += JSON.stringify(k) + ":" + _canon(v[k]);
    }
    out += "}";
    return out;
  }
}

// --- SHA-256 helpers ---
export async function sha256Hex(input) {
  const data = typeof input === "string" ? te.encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// --- import keys ---
async function importES256Jwk(jwk) {
  return crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
  );
}
async function importEd25519Raw(rawB64u) {
  const keyBytes = b64uDecode(rawB64u);
  return crypto.subtle.importKey("raw", keyBytes, "Ed25519", false, ["verify"]);
}

// --- signature verify ---
async function verifySig({ alg, publicKey, signature, data }) {
  const bytes = typeof data === "string" ? te.encode(data) : data;
  const sig = b64uDecode(signature);

  if (alg === "ES256") {
    const key = await importES256Jwk(publicKey);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, bytes);
  }
  if (alg === "Ed25519") {
    const key = await importEd25519Raw(publicKey);
    return crypto.subtle.verify("Ed25519", key, sig, bytes);
  }
  throw new Error(`Unsupported alg: ${alg}`);
}

// --- ajv-like shim (only for .errorsText you log) ---
export const ajv = {
  errorsText(errs, { separator = "\n" } = {}) {
    if (!errs) return "";
    try { return (Array.isArray(errs) ? errs : [errs]).map(e => e?.message ?? String(e)).join(separator); }
    catch { return "validation error"; }
  }
};

// --- schema-ish checks ---
export function validateUnified(root) {
  const ok = root && typeof root === "object" && Array.isArray(root.entries);
  validateUnified.errors = ok ? null : [{ message: "root.entries must be an array" }];
  return ok;
}

// Allow plain array or {entries:[...]} shapes
export function getEntriesDeep(obj) {
  if (obj && Array.isArray(obj.entries)) return obj.entries;
  if (Array.isArray(obj)) return obj;
  return [];
}

// --- MAIN: verify one entry ---
// Adjust field names if your proof schema differs.
export async function verifyEntry(entry) {
  try {
    const payload = entry.payload ?? entry.data ?? entry;
    const canon = canonicalize(payload);
    const computedHex = await sha256Hex(canon);

    let hash_ok = true;
    const declaredHash = entry.hash ?? entry.sha256 ?? entry.digest;
    if (declaredHash) hash_ok = (String(declaredHash).toLowerCase() === computedHex);

    let sig_ok = true;
    const sigBlock = entry.signature ?? entry.proof;
    if (sigBlock?.sig) {
      const alg = sigBlock.alg ?? sigBlock.algorithm;
      const publicKey = sigBlock.publicKey ?? sigBlock.jwk ?? sigBlock.key;
      sig_ok = await verifySig({ alg, publicKey, signature: sigBlock.sig, data: canon });
    }

    return { ok: hash_ok && sig_ok, hash_ok, sig_ok };
  } catch (e) {
    return { ok: false, hash_ok: false, sig_ok: false, error: e?.message ?? String(e) };
  }
}





