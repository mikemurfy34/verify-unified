import { canonicalizeRFC8785, sha256Bytes } from "./proof.mjs";

function bytesToBig64(b){
  let x=0n; for (let i=0;i<8;i++){ x = (x<<8n) + BigInt(b[i] ?? 0); } return x;
}

export async function tieBreakScore(hypothesis, seed){
  const canon = canonicalizeRFC8785({ hypothesis, seed });
  const bytes = new TextEncoder().encode(canon);
  const hash  = await sha256Bytes(bytes);
  return bytesToBig64(hash);
}

export async function collapseHypotheses(hypotheses=[], weights=[], seed="default"){
  const hs = (hypotheses||[]).map((h,i)=>({ i, h, w:Number(weights?.[i] ?? 1) }));
  if (hs.length===0) return { index:-1, reason:"empty" };
  const scores = await Promise.all(hs.map(x => tieBreakScore(x.h, seed)));
  let best=0; for (let i=1;i<scores.length;i++){ if (scores[i] > scores[best]) best=i; }
  const win = hs[best];
  return { index: best, hypothesis: win.h, weight: win.w, score: scores[best].toString() };
}