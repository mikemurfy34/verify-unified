import { sanitizeSeries } from "./numeric.mjs";

export function projectConservation(xs, targetSum, tol=1e-9){
  const arr=sanitizeSeries(xs); const n=arr.length; if (!n) return [];
  const current=arr.reduce((a,b)=>a+b,0);
  const diff = targetSum - current;
  if (Math.abs(diff) <= tol) return arr;
  const delta = diff / n;
  return arr.map(v => v + delta);
}
export function lipschitzClip(xs, maxDelta){
  const arr=sanitizeSeries(xs); if (arr.length<=1) return arr;
  const out=[arr[0]];
  for (let i=1;i<arr.length;i++){
    const prev=out[i-1], lo=prev-maxDelta, hi=prev+maxDelta;
    let v=arr[i]; if (v<lo) v=lo; else if (v>hi) v=hi;
    out.push(v);
  }
  return out;
}
export function dampen(xs, gamma=0.2){
  const arr=sanitizeSeries(xs); if (arr.length<=1) return arr;
  const out=[arr[0]];
  for (let i=1;i<arr.length;i++){ const prev=out[i-1]; out.push(prev + gamma*(arr[i]-prev)); }
  return out;
}
export function projectAll(xs, opts={}){
  const targetSum = (opts.conserveSum!==undefined) ? Number(opts.conserveSum) : null;
  const tol   = (opts.tol!==undefined) ? Number(opts.tol) : 1e-9;
  const lc    = (opts.lipschitz!==undefined) ? Number(opts.lipschitz) : null;
  const gamma = (opts.gamma!==undefined) ? Number(opts.gamma) : null;
  let out = sanitizeSeries(xs);
  if (targetSum!==null && Number.isFinite(targetSum)) out = projectConservation(out, targetSum, tol);
  if (lc!==null && Number.isFinite(lc) && lc>=0)     out = lipschitzClip(out, lc);
  if (gamma!==null && Number.isFinite(gamma) && gamma>0 && gamma<=1) out = dampen(out, gamma);
  return out;
}