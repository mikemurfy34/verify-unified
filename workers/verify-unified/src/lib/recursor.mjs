import { canonicalizeRFC8785, sha256Bytes, bytesToB64u } from "./proof.mjs";

async function hashState(x){
  const canon = canonicalizeRFC8785(x);
  const bytes = new TextEncoder().encode(canon);
  const h = await sha256Bytes(bytes);
  return bytesToB64u(h);
}

/** Deterministic recursion with fixed-point detection */
export async function recurseFixedPoint(seed, stepFn, opts={}){
  const maxDepth = Math.max(1, (opts.maxDepth ?? 32)|0);
  const seen = new Set();
  let state = seed, depth = 0;
  while (true){
    const h = await hashState(state);
    if (seen.has(h)) return { ok:true, reason:"fixed-point", depth, state, hash:h };
    if (depth >= maxDepth) return { ok:true, reason:"max-depth", depth, state, hash:h };
    seen.add(h);
    const next = await stepFn(state, depth);
    state = next;
    depth++;
  }
}