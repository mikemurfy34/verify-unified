async function handleVerify(req: any, env: any, allow: any) {
  const raw = (env && ((env as any).VERIFY_MODE ?? (env as any).__VERIFY_MODE ?? (env as any).VERIFYMODE)) ?? "verify";
  const mode = String(raw).toLowerCase().trim();
  if (mode !== "verify") {
    return new Response(JSON.stringify({ ok:false, error:"disabled" }), {
      status: 503,
      headers: { "content-type":"application/json; charset=utf-8" }
    });
  }
  return __impl_handleVerify(req, env, allow);
}
function readMode(env: any): "verify" | "off" {
  const raw =
    (env && ( (env as any).VERIFY_MODE ?? (env as any).__VERIFY_MODE ?? (env as any)['VERIFY_MODE'] )) ??
    // @ts-ignore
    ((typeof globalThis !== "undefined") ? (globalThis as any).VERIFY_MODE : undefined) ??
    "verify";
  const v = String(raw).toLowerCase().trim();
  return (v === "off") ? "off" : "verify";
}
/* workers/verify-unified/src/index.ts — API-only (/api/*), strict CORS + security headers */

export interface Env {
  ALLOW_ORIGINS?: string;
  MAX_BODY_BYTES?: string;
  MAX_BODY_DEPTH?: string;
  VERIFY_MODE?: string;
  LOG_LEVEL?: string;
  VERIFY_API_KEY?: string;
  VERIFY_PUBKEY?: string;        // base64url DER/SPKI
  VERIFY_PUBKEYS_JSON?: string;  // {"kid":"base64url(SPKI)", ...}
}

const te = new TextEncoder();

/* === util: base64url and hashing === */
function b64urlToU8(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function u8ToB64url(a: ArrayBuffer | Uint8Array): string {
  const u = a instanceof Uint8Array ? a : new Uint8Array(a);
  let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* === CORS & headers === */
function normalizeOrigin(s: string | null): string { return (s ?? "").replace(/\/+$/, ""); }
function parseAllow(env: Env): Set<string> {
  const raw = env.ALLOW_ORIGINS ?? "";
  return new Set(raw.split(",").map(x => x.trim()).filter(Boolean).map(x => x.replace(/\/+$/, "")));
}
function corsHeaders(req: Request, allow: Set<string>): Record<string,string> {
  const origin = normalizeOrigin(req.headers.get("Origin"));
  if (origin && allow.size && allow.has(origin)) return { "Access-Control-Allow-Origin": origin, "Vary": "Origin" };
  return { "Vary": "Origin" };
}
const SEC_BASE: Record<string,string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
};
function withSec(contentType: string, ch?: Record<string,string>, extra: Record<string,string> = {}): Record<string,string> {
  return { "content-type": contentType, ...SEC_BASE, ...(ch ?? {}), ...extra };
}
function jsonResponse(body: unknown, status = 200, extra: Record<string,string> = {}, ch?: Record<string,string>): Response {
  return new Response(JSON.stringify(body), { status, headers: withSec("application/json; charset=utf-8", ch, extra) });
}
function textResponse(text: string, status = 200, extra: Record<string,string> = {}, ch?: Record<string,string>): Response {
  return new Response(text, { status, headers: withSec("text/plain; charset=utf-8", ch, extra) });
}

/* === input normalization === */
function depthOf(v: any): number {
  if (v === null || typeof v !== "object") return 0;
  if (Array.isArray(v)) return 1 + (v.length ? Math.max(...v.map(depthOf)) : 0);
  const vals = Object.values(v);
  return 1 + (vals.length ? Math.max(...vals.map(depthOf)) : 0);
}
function canonNoSig(v: any): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonNoSig).join(",") + "]";
  const ks = Object.keys(v).filter(k => k !== "sig").sort();
  return "{" + ks.map(k => JSON.stringify(k) + ":" + canonNoSig(v[k])).join(",") + "}";
}

/* === crypto === */
async function verifyEd25519(spkiB64url: string, messageUtf8: string, sigB64url: string): Promise<boolean> {
  const key = await crypto.subtle.importKey("spki", b64urlToU8(spkiB64url), { name: "Ed25519" }, false, ["verify"]);
  return await crypto.subtle.verify("Ed25519", key, b64urlToU8(sigB64url), te.encode(messageUtf8));
}

/* === handlers === */
function handlePreflight(req: Request, allow: Set<string>): Response {
  const origin = normalizeOrigin(req.headers.get("Origin"));
  if (origin && allow.size && !allow.has(origin)) return jsonResponse({ ok:false, error:"cors_forbidden" }, 403, {}, { Vary:"Origin" });
  const ch = corsHeaders(req, allow);
  const reqHdrs = req.headers.get("Access-Control-Request-Headers") ?? "content-type,x-api-key";
  const vary = ch.Vary ? ch.Vary + ", Access-Control-Request-Headers, Access-Control-Request-Method" : "Access-Control-Request-Headers, Access-Control-Request-Method";
  const headers: Record<string,string> = { ...ch, "Access-Control-Allow-Methods":"POST, OPTIONS", "Access-Control-Allow-Headers": reqHdrs, "Access-Control-Max-Age":"86400", "Vary": vary };
  return new Response(null, { status: 204, headers: withSec("text/plain; charset=utf-8", headers) });
}

async function __impl_handleVerify(req: Request, env: Env, allow: Set<string>): Promise<Response> {
  const ch = corsHeaders(req, allow);
  const origin = normalizeOrigin(req.headers.get("Origin"));
  if (origin && allow.size && !allow.has(origin)) return jsonResponse({ ok:false, error:"cors_forbidden" }, 403, {}, { Vary:"Origin" });

  const mode = (env.VERIFY_MODE ?? "verify").toLowerCase();
  if (mode !== "verify") return jsonResponse({ ok:false, error:"disabled" }, 503, {}, ch);

  const apiKey = (env.VERIFY_API_KEY ?? "").trim();
  if (!apiKey) return jsonResponse({ ok:false, error:"server_misconfig" }, 500, {}, ch);
  if ((req.headers.get("X-API-Key") ?? "").trim() !== apiKey) return jsonResponse({ ok:false, error:"unauthorized" }, 401, {}, ch);

  const ct = (req.headers.get("Content-Type") ?? "").toLowerCase();
  if (!ct.startsWith("application/json")) return jsonResponse({ ok:false, error:"content-type" }, 415, {}, ch);

  const maxBytes = Math.max(1, parseInt(env.MAX_BODY_BYTES ?? "131072", 10));
  const maxDepth = Math.max(1, parseInt(env.MAX_BODY_DEPTH ?? "16", 10));

  const raw = await req.text();
  if (te.encode(raw).length > maxBytes) return jsonResponse({ ok:false, error:"too_large" }, 413, {}, ch);

  let doc: any; try { doc = JSON.parse(raw); } catch { return jsonResponse({ ok:false, error:"bad_json" }, 400, {}, ch); }
  if (depthOf(doc) > maxDepth) return jsonResponse({ ok:false, error:"too_deep" }, 413, {}, ch);

  const canon = canonNoSig(doc);
  const digest = await crypto.subtle.digest("SHA-256", te.encode(canon));
  const hash = u8ToB64url(digest);

  if (!doc.sig || typeof doc.sig !== "object") return jsonResponse({ ok:false, error:"missing_signature" }, 400, {}, ch);
  if (doc.sig.hash !== hash) return jsonResponse({ ok:false, error:"hash_mismatch" }, 422, {}, ch);

  const kid = (doc.sig.kid ?? "").toString();
  const sig = (doc.sig.sig ?? "").toString();

  let hasMap = false; let spki = "";
  if (env.VERIFY_PUBKEYS_JSON) {
    try { const map = JSON.parse(env.VERIFY_PUBKEYS_JSON as string) as Record<string,string>;
          if (map && typeof map === "object") { hasMap = true; spki = map[kid] ?? ""; } } catch {}
  }
  if (hasMap && !spki) return jsonResponse({ ok:false, error:"unknown_kid" }, 401, {}, ch);
  if (!hasMap) {
    spki = (env.VERIFY_PUBKEY ?? "").trim();
    if (!spki) return jsonResponse({ ok:false, error:"server_no_pubkey" }, 500, {}, ch);
  }

  let ok = false;
  try { ok = await verifyEd25519(spki, doc.sig.hash as string, sig); } catch { return jsonResponse({ ok:false, error:"bad_signature" }, 422, {}, ch); }
  if (!ok) return jsonResponse({ ok:false, error:"bad_signature" }, 422, {}, ch);

  return textResponse("ok", 200, {}, ch);
}

/* === module worker === */
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
  // PREEMPTIVE_VERIFY_GATE — first instruction after URL parse
  {
    const __raw = (env && ((env as any).VERIFY_MODE ?? (env as any).__VERIFY_MODE ?? (env as any).VERIFYMODE)) ?? "verify";
    const __mode = String(__raw).toLowerCase().trim();
    if (__mode !== "verify" && req.method === "POST" && (url.pathname === "/verify" || url.pathname === "/api/verify")) {
      return new Response(JSON.stringify({ ok:false, error:"disabled" }), {
        status: 503,
        headers: { "content-type":"application/json; charset=utf-8" }
      });
    }
  }
  // Top-of-router disabled gate (pre-emptive)
  {
    const __mode = readMode(env);
    if (__mode !== "verify" && req.method === "POST" && (url.pathname === "/verify" || url.pathname === "/api/verify")) {
      // Minimal CORS echo without parseAllow()
      const origin = req.headers.get("Origin") || "";
      const allowStr = String((env as any)?.ALLOW_ORIGINS ?? (env as any)?.ALLOW_ORIGINS ?? "");
      const allow = allowStr.split(',').map(s => s.trim()).filter(Boolean);
      const allowed = allow.find(a => a.length && origin.startsWith(a));
      const hdr = new Headers({ "content-type":"application/json; charset=utf-8" });
      if (allowed) { hdr.set("Access-Control-Allow-Origin", allowed); hdr.set("Vary","Origin"); }
      return new Response(JSON.stringify({ ok:false, error:"disabled", mode: __mode }), { status: 503, headers: hdr });
    }
  }
    const allow = parseAllow(env);
    // ROUTER_VERIFY_GATE — short-circuit before hitting any handler
    {
      const __raw = (env && ((env as any).VERIFY_MODE ?? (env as any).__VERIFY_MODE ?? (env as any).VERIFYMODE)) ?? "verify";
      const __mode = String(__raw).toLowerCase().trim();
      if (__mode !== "verify" && req.method === "POST" && (url.pathname === "/verify" || url.pathname === "/api/verify")) {
        const hdr = new Headers({ "content-type":"application/json; charset=utf-8" });
        return new Response(JSON.stringify({ ok:false, error:"disabled" }), { status:503, headers: hdr });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/whoami") {
      const ch = corsHeaders(req, allow);
      return jsonResponse({ worker: env?.WORKER_NAME ?? "<unknown>" }, 200, {}, ch);
    }
    // Router-level disabled gate (short-circuit)
    {
      const mode = readMode(env);
      if (mode !== "verify" && req.method === "POST" && (url.pathname === "/verify" || url.pathname === "/api/verify")) {
        const ch = corsHeaders(req, allow);
        return new Response(JSON.stringify({ ok:false, error:"disabled" }), {
          status: 503,
          headers: withSec("application/json; charset=utf-8", ch)
        });
      }
    }
    // Debug: report current mode (respects CORS)
    if (req.method === "GET" && url.pathname === "/api/mode") {
      const ch = corsHeaders(req, allow);
      return jsonResponse({ mode: (env.VERIFY_MODE ?? "verify").toLowerCase() }, 200, {}, ch);
    }

    // API-only: preflight and endpoints strictly under /api/*
    if (req.method === "OPTIONS" && url.pathname === "/api/verify") return handlePreflight(req, allow);

    if (req.method === "GET" && (url.pathname === "/api/health" || url.pathname === "/api/ready")) {
      const ch = corsHeaders(req, allow);
      return jsonResponse({ ready: true }, 200, {}, ch);
    }

    if (req.method === "POST" && (url.pathname === "/api/verify" || url.pathname === "/verify")) {
  // VERIFY_MODE gate (router)
  const ch = corsHeaders(req, allow);
  const mode = (env.VERIFY_MODE ?? "verify").toLowerCase();
  if (mode !== "verify") {
    return new Response(JSON.stringify({ ok:false, error:"disabled" }), {
      status: 503,
      headers: { "content-type":"application/json; charset=utf-8", ...ch }
    });
  }
  return handleVerify(req, env, allow);
}

    // Anything else — 404
    const ch = corsHeaders(req, allow);
    return jsonResponse({ ok:false, error:"not_found" }, 404, {}, ch);
  },
};

