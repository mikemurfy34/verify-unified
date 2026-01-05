import { makeProof } from "../../lib/proof.mjs";
import { parseByContentType, normalizeRecords } from "../../lib/feeds.mjs";

function json(res, headers={}){ return new Response(JSON.stringify(res), { headers: { "content-type":"application/json", ...headers }}); }
async function withProof(body, env){
  const proof = await makeProof(body, env);
  const hdr = { "x-proof-alg": proof.alg, "x-proof-hash": proof.hash };
  if (proof.sig) hdr["x-proof-sig"] = "1";
  return { proof, headers: hdr };
}

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const mode = env?.FEEDS_MODE || "strict";
    const accept = (env?.FEEDS_ACCEPT || "json,ndjson,csv,text").split(",").map(s=>s.trim().toLowerCase());

    if (url.pathname.endsWith("/spec") && method==="GET"){
      const res = { ok:true, mode, accept };
      const { proof, headers } = await withProof({ meta:{ svc:"feeds/spec" }, res }, env);
      return json({ ...res, proof }, headers);
    }

    if (url.pathname.endsWith("/normalize") && method==="POST"){
      let obj = null;
      try { obj = await req.json(); } catch { obj = (mode==="strict" ? null : {}); }
      if (obj==null) return json({ ok:false, error:"bad-json" }, { "x-error":"bad-json" });
      const records = normalizeRecords(obj);
      const res = { ok:true, count: records.length, records };
      const { proof, headers } = await withProof({ meta:{ svc:"feeds/normalize" }, res }, env);
      return json({ ...res, proof }, headers);
    }

    if (url.pathname.endsWith("/ingest") && method==="POST"){
      const fmt = url.searchParams.get("format") || "";
      const parsed = await parseByContentType(req, fmt);
      // Gate by FEEDS_ACCEPT, drop disallowed
      if (!accept.includes(parsed.format)) return json({ ok:false, error:`format '${parsed.format}' not accepted` }, { "x-error":"not-accepted" });
      const res = { ok:true, parsed };
      const { proof, headers } = await withProof({ meta:{ svc:"feeds/ingest" }, res }, env);
      return json({ ...res, proof }, headers);
    }

    return json({ ok:true, endpoints:["/svc/feeds/spec","/svc/feeds/normalize","/svc/feeds/ingest?format="]});
  }
}