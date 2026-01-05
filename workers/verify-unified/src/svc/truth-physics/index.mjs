import { canonicalizeRFC8785, sha256Bytes, bytesToB64u, makeProof } from "../../lib/proof.mjs";
import { seedFromCanonical, scoreTruth, olsForecast, planGoals, roundVec } from "../../lib/tpe.mjs";

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
    const mode = env?.TPE_MODE || "strict";
    const precision = (env?.TPE_PRECISION ? Number(env.TPE_PRECISION) : 12) >>> 0;

    if (url.pathname.endsWith("/spec") && method==="GET"){
      const res = { ok:true, mode, precision, vars: {
        INFINITY_MODE: env?.INFINITY_MODE, INFINITY_SAFETY: env?.INFINITY_SAFETY,
        TPE_MODE: env?.TPE_MODE, TPE_SEED_B64U: env?.TPE_SEED_B64U, TPE_PRECISION: env?.TPE_PRECISION
      }};
      const { proof, headers } = await withProof({ meta:{ svc:"truth-physics/spec" }, res }, env);
      return json({ ...res, proof }, headers);
    }

    if (url.pathname.endsWith("/canonicalize") && method==="POST"){
      const inp = await req.json().catch(()=> (mode==="strict" ? null : {}));
      if (inp==null) return json({ ok:false, error:"missing JSON" }, { "x-error":"bad-json" });
      const canon = canonicalizeRFC8785(inp);
      const hash = bytesToB64u(await sha256Bytes(new TextEncoder().encode(canon)));
      const res = { ok:true, canon, hash };
      const { proof, headers } = await withProof({ meta:{ svc:"truth-physics/canonicalize" }, res }, env);
      return json({ ...res, proof }, headers);
    }

    if (url.pathname.endsWith("/score") && method==="POST"){
      const body = await req.json().catch(()=> (mode==="strict" ? null : { signals:[] }));
      if (!body || !Array.isArray(body.signals)) return json({ ok:false, error:"signals[] required" }, { "x-error":"invalid-input" });
      const result = scoreTruth(body.signals, precision);
      const { proof, headers } = await withProof({ meta:{ svc:"truth-physics/score" }, result }, env);
      return json({ ok:true, result }, headers);
    }

    if (url.pathname.endsWith("/forecast") && method==="POST"){
      const body = await req.json().catch(()=> (mode==="strict" ? null : { series:[] }));
      if (!body || !Array.isArray(body.series)) return json({ ok:false, error:"series[] required" }, { "x-error":"invalid-input" });
      const steps = Math.max(1, Math.min(100, Number(body.steps||1)));
      const next = olsForecast(body.series, steps);
      const rounded = roundVec(next, precision);
      const { proof, headers } = await withProof({ meta:{ svc:"truth-physics/forecast" }, result:{ next: rounded } }, env);
      return json({ ok:true, result:{ next: rounded }}, headers);
    }

    if (url.pathname.endsWith("/plan") && method==="POST"){
      const body = await req.json().catch(()=> (mode==="strict" ? null : { goals:[] }));
      if (!body || !Array.isArray(body.goals)) return json({ ok:false, error:"goals[] required" }, { "x-error":"invalid-input" });
      const seed = await seedFromCanonical(body);
      const plan = planGoals(body.goals, seed);
      const { proof, headers } = await withProof({ meta:{ svc:"truth-physics/plan" }, result:{ plan } }, env);
      return json({ ok:true, result:{ plan }}, headers);
    }

    return json({ ok:true, endpoints:["/svc/truth-physics/spec","/svc/truth-physics/canonicalize","/svc/truth-physics/score","/svc/truth-physics/forecast","/svc/truth-physics/plan"]});
  }
}