import { makeProof } from "../../lib/proof.mjs";
import { loadSourcesAsync, pullJsonSource } from "../../lib/osint.mjs";
import { commitCell } from "../../lib/qmem.mjs";
import { olsForecast, roundVec, scoreTruth } from "../../lib/tpe.mjs";
import { clipOutliersIQR } from "../../lib/entropy.mjs";

function json(res, headers={}){ return new Response(JSON.stringify(res), { headers:{ "content-type":"application/json", ...headers }}) }
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
    const sources = await loadSourcesAsync(env);
    const precision = (env?.TPE_PRECISION ? Number(env.TPE_PRECISION) : 12)>>>0;

    if (url.pathname.endsWith("/catalog") && method==="GET"){
      const list = Object.entries(sources).map(([id,def])=>({
        id, url:def.url, host: new URL(def.url).hostname, pluck:def.pluck||null, note:def.note||null
      }));
      const res = { ok:true, count:list.length, list };
      const { proof, headers } = await withProof({ meta:{ svc:"osint/catalog" }, res }, env);
      return json({ ...res, proof }, headers);
    }

    if (url.pathname.endsWith("/pull") && method==="POST"){
      const body = await req.json().catch(()=> ({}));
      const id = String(body.id||"");
      const def = sources[id];
      if(!def) return json({ ok:false, error:"unknown-source", id }, { "x-error":"unknown-source" });
      const pulled = await pullJsonSource(def, env, body.params||{});
      const { proof, headers } = await withProof({ meta:{ svc:"osint/pull", id }, pulled }, env);
      return json({ ok: pulled.ok, id, pulled }, headers);
    }

    if (url.pathname.endsWith("/forecast") && method==="POST"){
      const body = await req.json().catch(()=> ({}));
      const id = String(body.id||"");
      const steps = Math.max(1, Math.min(100, Number(body.steps||3)));
      const def = sources[id];
      if(!def) return json({ ok:false, error:"unknown-source", id }, { "x-error":"unknown-source" });

      const pulled = await pullJsonSource(def, env, body.params||{});
      if(!pulled.ok) return json({ ok:false, error:"pull-failed", detail:pulled.error||"unknown" }, { "x-error":"pull-failed" });

      const raw = Array.isArray(pulled.plucked) ? pulled.plucked : [];
      const series = clipOutliersIQR(raw);
      if(series.length<2) return json({ ok:false, error:"not-enough-data", have:series.length }, { "x-error":"insufficient-series" });

      const next = roundVec(olsForecast(series, steps), precision);
      const metrics = scoreTruth(series, precision);
      const result = { next, metrics, source:{ id, hash:pulled.hash, count_raw: raw.length, count_clean: series.length } };
      const { proof, headers } = await withProof({ meta:{ svc:"osint/forecast" }, result }, env);
      return json({ ok:true, result }, headers);
    }

    if (url.pathname.endsWith("/seal") && method==="POST"){
      const body = await req.json().catch(()=> ({}));
      const id = String(body.id||"");
      const def = sources[id];
      if(!def) return json({ ok:false, error:"unknown-source", id }, { "x-error":"unknown-source" });

      const pulled = await pullJsonSource(def, env, body.params||{});
      if(!pulled.ok) return json({ ok:false, error:"pull-failed", detail:pulled.error||"unknown" }, { "x-error":"pull-failed" });

      const cell = await commitCell({ id, hash:pulled.hash, json:pulled.json }, ["osint","sealed", id]);
      const { proof, headers } = await withProof({ meta:{ svc:"osint/seal" }, cell }, env);
      return json({ ok:true, cell }, headers);
    }

    return json({ ok:true, endpoints:["/svc/osint/catalog","/svc/osint/pull","/svc/osint/forecast","/svc/osint/seal"] });
  }
}