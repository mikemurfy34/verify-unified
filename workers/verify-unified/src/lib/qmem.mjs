import { canonicalizeRFC8785, sha256Bytes, bytesToB64u } from "./proof.mjs";

/** Deterministic address from canonical payload */
export async function addressOf(payload){
  const canon = canonicalizeRFC8785(payload);
  const bytes = new TextEncoder().encode(canon);
  const h = await sha256Bytes(bytes);
  return bytesToB64u(h); // base64url
}

/** Create a sealed "memory cell" (immutable) from payload + optional tags (sorted) */
export async function commitCell(payload, tags=[]){
  const addr = await addressOf(payload);
  const tlex = Array.isArray(tags) ? [...tags].map(String).sort() : [];
  return { addr, tags: tlex, payload }; // caller may proof-sign separately
}

/** Deterministic shallow diff of two plain objects (lexicographic keys) */
export function shallowDiff(a={}, b={}){
  const keys = Array.from(new Set([...Object.keys(a||{}), ...Object.keys(b||{})])).sort();
  const changes = [];
  for (const k of keys){
    const av = (a||{})[k], bv = (b||{})[k];
    if (JSON.stringify(av) !== JSON.stringify(bv)) changes.push({ key:k, from: av, to: bv });
  }
  return { changed: changes.length, changes };
}