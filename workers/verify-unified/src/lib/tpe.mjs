import { canonicalizeRFC8785, sha256Bytes, bytesToB64u } from "./proof.mjs";

// ---- Deterministic primitives ----
export function xorshift32(seedU32){
  let x = (seedU32>>>0) || 1;
  return ()=>{ x ^= x<<13; x ^= x>>>17; x ^= x<<5; return (x>>>0)/4294967296; };
}
export function seedFromCanonical(obj){
  // SHA-256 over canonical JSON, take first 4 bytes as u32 (big-endian)
  // Deterministic for identical inputs.
  return sha256Bytes(new TextEncoder().encode(canonicalizeRFC8785(obj))).then(d=>{
    return ((d[0]<<24)|(d[1]<<16)|(d[2]<<8)|d[3])>>>0;
  });
}
export function kahanSum(arr){
  let sum=0.0, c=0.0;
  for (let i=0;i<arr.length;i++){
    const y = Number(arr[i]) - c;
    const t = sum + y;
    c = (t - sum) - y;
    sum = t;
  }
  return sum;
}
export function mean(arr){
  if (arr.length===0) return 0;
  return kahanSum(arr)/arr.length;
}
export function variance(arr){
  if (arr.length<2) return 0;
  const m = mean(arr);
  let acc = 0.0;
  for (let i=0;i<arr.length;i++){ const d = Number(arr[i]) - m; acc += d*d; }
  return acc/arr.length;
}
export function shannonEntropy01(probVec){
  // probs must sum to 1; return normalized entropy in [0,1] using log base = probVec.length
  const n = probVec.length || 1;
  if(n===1) return 0;
  let H=0;
  for (let p of probVec){
    p = Math.max(0, Number(p));
    if (p>0) H -= p * (Math.log(p)/Math.log(n));
  }
  // H in [0,1]
  return Math.min(1, Math.max(0, H));
}
export function normalizePos(arr){
  const min = Math.min(...arr), max = Math.max(...arr);
  if (max<=min) return arr.map(()=>0.5);
  return arr.map(v => (Number(v)-min)/(max-min));
}
// Deterministic OLS linear forecast (x = 0..n-1)
export function olsForecast(series, steps=1){
  const y = series.map(Number);
  const n = y.length;
  if(n===0) return [];
  const xs = Array.from({length:n}, (_,i)=>i);
  const mx = mean(xs), my = mean(y);
  let num=0, den=0;
  for (let i=0;i<n;i++){ const dx=xs[i]-mx; num += dx*(y[i]-my); den += dx*dx; }
  const m = den===0 ? 0 : num/den;
  const b = my - m*mx;
  const last = n-1;
  const out=[];
  for (let k=1;k<=steps;k++){ out.push(m*(last+k)+b); }
  return out;
}

export function roundFixed(x, digits){
  const f = Number(x);
  const p = Math.pow(10, digits>>>0);
  return Math.round(f * p)/p;
}
export function roundVec(v, digits){ return v.map(x=>roundFixed(x,digits)); }

// ---- Composite deterministic measures ----
export function coherenceIndex(values){
  // High coherence when dispersion is low.
  const v = variance(values);
  // Map variance to coherence in [0,1] via 1/(1+v)
  return 1/(1+v);
}
export function scoreTruth(signals, precision=12){
  const vals = signals.map(Number);
  const probs = normalizePos(vals);
  const H = shannonEntropy01(probs);
  const C = coherenceIndex(vals);
  return {
    entropy: roundFixed(H, precision),
    coherence: roundFixed(C, precision),
    signals_lex: [...signals].map(String).sort() // lexicographic snapshot (deterministic)
  };
}
export function planGoals(goals, seedU32){
  // Stable lexical sort, tie-broken by seeded RNG weight.
  const R = xorshift32(seedU32||1);
  const scored = goals.map(g=>({ g:String(g), w:(R()*1e9|0) }));
  scored.sort((a,b)=> a.g.localeCompare(b.g) || (a.w - b.w));
  return scored.map((o,i)=>({ step:i+1, action:o.g, score:o.w }));
}