function q(sorted, p){ if(sorted.length===0) return NaN; const i=(sorted.length-1)*p; const lo=Math.floor(i), hi=Math.ceil(i);
  const a=sorted[lo], b=sorted[hi]; return (lo===hi)?a:(a+(b-a)*(i-lo)); }
export function clipOutliersIQR(series){
  const xs = (series||[]).map(Number).filter(Number.isFinite);
  if(xs.length<5) return xs; // not enough to estimate IQR
  const sorted=[...xs].sort((a,b)=>a-b);
  const q1=q(sorted,0.25), q3=q(sorted,0.75), iqr=q3-q1;
  const lo=q1-1.5*iqr, hi=q3+1.5*iqr;
  const out=[]; for(const v of xs){ if(v>=lo && v<=hi) out.push(v); }
  return out.length?out:xs; // never empty
}