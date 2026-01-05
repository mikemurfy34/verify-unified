import { canonicalizeRFC8785, sha256Bytes, bytesToB64u } from "./proof.mjs";

export async function hashText(txt){
  const bytes = new TextEncoder().encode(txt);
  const h = await sha256Bytes(bytes);
  return bytesToB64u(h);
}

// naive CSV parser (no quotes/escapes) — deterministic, simple
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length>0);
  if(lines.length===0) return [];
  const header = lines[0].split(",").map(s=>s.trim());
  const out = [];
  for(let i=1;i<lines.length;i++){
    const parts = lines[i].split(",");
    const row = {};
    for(let j=0;j<header.length;j++){ row[header[j]] = (parts[j]??"").trim(); }
    out.push(row);
  }
  return out;
}

function parseNDJSON(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim().length>0);
  const out = [];
  for(const l of lines){ try{ out.push(JSON.parse(l)); }catch{ /* skip */ } }
  return out;
}

export function normalizeRecords(any){
  // Accept: {data:[...]}, [...], {...} -> wrap deterministically
  let recs = [];
  if (Array.isArray(any)) recs = any;
  else if (any && Array.isArray(any.data)) recs = any.data;
  else if (any && typeof any === "object") recs = [any];
  else recs = [];

  // Deterministic field ordering (lexicographic); preserve record order
  const canon = recs.map(obj=>{
    if (obj && typeof obj === "object" && !Array.isArray(obj)){
      const keys = Object.keys(obj).sort();
      const out = {}; for (const k of keys) out[k] = obj[k];
      return out;
    }
    return obj;
  });
  return canon;
}

export async function parseByContentType(req, preferFmt){
  const ct = (req.headers.get("content-type")||"").toLowerCase();
  const fmt = (preferFmt||"").toLowerCase();

  // Decide parser deterministically
  const bodyTxt = await req.text();
  if (fmt==="csv" || ct.includes("text/csv")) return { format:"csv",  records: parseCSV(bodyTxt) };
  if (fmt==="ndjson" || ct.includes("ndjson")) return { format:"ndjson", records: parseNDJSON(bodyTxt) };
  if (fmt==="text" || ct.startsWith("text/"))  return { format:"text", lines: bodyTxt.split(/\r?\n/) };

  // Try JSON last (safe)
  try {
    const obj = JSON.parse(bodyTxt);
    return { format:"json", records: normalizeRecords(obj) };
  } catch {
    return { format:"bytes", blobHash: await hashText(bodyTxt) };
  }
}