import { sha256Bytes, bytesToB64u } from "./proof.mjs";
import { normalizeRecords } from "./feeds.mjs";
import { pluckPath, toNumericSeries } from "./pluck.mjs";

function hostAllowed(urlStr, allowlistCsv){
  const h = new URL(urlStr).hostname.toLowerCase();
  const allow = String(allowlistCsv||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  return allow.some(a => h===a || h.endsWith("."+a));
}

function applyParams(urlStr, params={}){
  let out = String(urlStr);
  for(const [k,v] of Object.entries(params||{})){ out = out.replaceAll("{"+k+"}", String(v)); }
  return out;
}

async function hashText(txt){
  const bytes = new TextEncoder().encode(txt);
  const h = await sha256Bytes(bytes);
  return bytesToB64u(h);
}

export function loadSources(env){
  try { return JSON.parse(env?.OSINT_SOURCES_JSON || "{}"); } catch { return {}; }
}

export async function loadSourcesAsync(env){
  const fromEnv = loadSources(env);
  const asset = env?.OSINT_SOURCES_ASSET;
  if(!asset) return fromEnv;
  try {
    const r = await fetch(asset, { method:"GET" });
    if(!r.ok) return fromEnv;
    const json = await r.json();
    return (json && typeof json==="object") ? json : fromEnv;
  } catch { return fromEnv; }
}

export async function pullJsonSource(def, env, params={}){
  const url = applyParams(def.url, params);
  if(!hostAllowed(url, env?.OSINT_ALLOWLIST)) return { ok:false, error:"host-not-allowlisted", url };

  const r = await fetch(url, { method: def.method || "GET", headers: def.headers || {} });
  const text = await r.text();
  const ct = r.headers.get("content-type") || "";
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }

  if(!json) return { ok:false, error:"non-json-source", url, contentType: ct, hash: await hashText(text) };

  const hash = await hashText(text);
  const normalized = normalizeRecords(json); // lex-ordered fields
  const plucked = def.pluck ? toNumericSeries(pluckPath(json, def.pluck)) : [];

  return { ok:true, url, contentType: ct, hash, json, normalized, plucked };
}