export function sanitizeSeries(xs){
  const out=[]; for (const v of (xs||[])){ const n=Number(v); if (Number.isFinite(n)) out.push(n); }
  return out;
}
export function kahanSum(xs){
  let sum=0, c=0;
  for (let x of sanitizeSeries(xs)){ const y=x-c; const t=sum+y; c=(t-sum)-y; sum=t; }
  return sum;
}
export function stableMean(xs){ const arr=sanitizeSeries(xs); return arr.length? kahanSum(arr)/arr.length : NaN; }
export function stableVariance(xs){
  const arr=sanitizeSeries(xs); const n=arr.length; if (n<2) return 0;
  const mean=stableMean(arr); let acc=0, c=0;
  for (const v of arr){ const d=v-mean; const y=d*d - c; const t=acc + y; c=(t-acc)-y; acc=t; }
  return acc/(n-1);
}
export function quantize(xs, precision=12){
  const f = Math.pow(10, precision|0); return (xs||[]).map(v=>Math.round(Number(v)*f)/f);
}