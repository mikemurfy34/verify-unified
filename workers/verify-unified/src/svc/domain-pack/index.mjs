import { makeProof } from "../../lib/proof.mjs";
import { scoreTruth, olsForecast, roundVec, planGoals } from "../../lib/tpe.mjs";

function json(res, headers={}){ return new Response(JSON.stringify(res), { headers: { "content-type":"application/json", ...headers }}); }
async function withProof(body, env){
  const proof = await makeProof(body, env);
  const hdr = { "x-proof-alg": proof.alg, "x-proof-hash": proof.hash };
  if (proof.sig) hdr["x-proof-sig"] = "1";
  return { proof, headers: hdr };
}

function clamp01(x){ return Math.max(0, Math.min(1, Number(x)||0)); }

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const mode = env?.DOMAINS_MODE || "strict";
    const precision = (env?.TPE_PRECISION ? Number(env.TPE_PRECISION) : 12) >>> 0;

    if (url.pathname.endsWith("/spec") && method==="GET"){
      const res = { ok:true, mode, domains:["oceanos/restoration","govos/ops-plan","codex/strategy"] };
      const { proof, headers } = await withProof({ meta:{ svc:"domain-pack/spec" }, res }, env);
      return json({ ...res, proof }, headers);
    }

    // OceanOS — restoration demo: threshold cells -> actions
    if (url.pathname.endsWith("/oceanos/restoration") && method==="POST"){
      const body = await req.json().catch(()=> (mode==="strict" ? null : { grid:[], threshold:0.5 }));
      if (!body || !Array.isArray(body.grid)) return json({ ok:false, error:"grid[][] required" }, { "x-error":"invalid-input" });
      const thr = clamp01(body.threshold ?? 0.5);
      const plan = [];
      const grid = body.grid;
      for (let i=0;i<grid.length;i++){
        const row = Array.isArray(grid[i]) ? grid[i] : [];
        for (let j=0;j<row.length;j++){
          const v = clamp01(row[j]);
          if (v>=thr){
            plan.push({ i, j, risk: Number(v.toFixed(precision)), action: (v>0.85 ? "protect" : "restore") });
          }
        }
      }
      const metrics = scoreTruth(grid.flat().map(Number), precision);
      const { proof, headers } = await withProof({ meta:{ svc:"domain-pack/oceanos/restoration" }, result:{ plan, metrics } }, env);
      return json({ ok:true, result:{ plan, metrics }}, headers);
    }

    // GovOS — operations plan: deterministic ordering of tasks/resources
    if (url.pathname.endsWith("/govos/ops-plan") && method==="POST"){
      const body = await req.json().catch(()=> (mode==="strict" ? null : { goals:[] }));
      if (!body || !Array.isArray(body.goals)) return json({ ok:false, error:"goals[] required" }, { "x-error":"invalid-input" });
      const plan = planGoals(body.goals, 1);
      const { proof, headers } = await withProof({ meta:{ svc:"domain-pack/govos/ops-plan" }, result:{ plan } }, env);
      return json({ ok:true, result:{ plan }}, headers);
    }

    // Codex — strategy: OLS forecast + coherence
    if (url.pathname.endsWith("/codex/strategy") && method==="POST"){
      const body = await req.json().catch(()=> (mode==="strict" ? null : { series:[] }));
      if (!body || !Array.isArray(body.series)) return json({ ok:false, error:"series[] required" }, { "x-error":"invalid-input" });
      const next = roundVec(olsForecast(body.series, Math.max(1, Math.min(12, Number(body.steps||3)))), precision);
      const metrics = scoreTruth(body.series.map(Number), precision);
      const { proof, headers } = await withProof({ meta:{ svc:"domain-pack/codex/strategy" }, result:{ next, metrics } }, env);
      return json({ ok:true, result:{ next, metrics }}, headers);
    }

    return json({ ok:true, endpoints:[
      "/svc/domain-pack/spec",
      "/svc/domain-pack/oceanos/restoration",
      "/svc/domain-pack/govos/ops-plan",
      "/svc/domain-pack/codex/strategy"
    ]});
  }
}