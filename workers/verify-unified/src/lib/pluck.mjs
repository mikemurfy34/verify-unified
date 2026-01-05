export function pluckPath(root, path){
  if(!path) return [];
  const toks = String(path).split(".");
  function walk(node, i){
    if(i>=toks.length) return [node];
    const t = toks[i];

    // map over arrays: key[]  or bare [] to map current node if it's an array
    if(t.endsWith("[]")){
      const key = t.slice(0,-2);
      const arr = key ? (node?.[key] ?? []) : (Array.isArray(node) ? node : []);
      if(!Array.isArray(arr)) return [];
      let out = [];
      for(const el of arr){ out = out.concat(walk(el, i+1)); }
      return out;
    }

    // array index access: [0], [1], ...
    const idxMatch = /^\[(\d+)\]$/.exec(t);
    if(idxMatch){
      const idx = Number(idxMatch[1]);
      const next = Array.isArray(node) ? node[idx] : undefined;
      return walk(next, i+1);
    }

    // object property (or numeric string index into array)
    const next = (t==="[]") ? node : (node?.[t]);
    return walk(next, i+1);
  }
  return walk(root, 0);
}

export function toNumericSeries(arr){
  const out = [];
  for(const x of (arr||[])){ const n = Number(x); if(Number.isFinite(n)) out.push(n); }
  return out;
}