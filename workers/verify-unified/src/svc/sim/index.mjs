import { makeProof } from "../../lib/proof.mjs";
import { collapseHypotheses } from "../../lib/hypothesis.mjs";
import { projectAll } from "../../lib/physics.mjs";
import { roundVec } from "../../lib/tpe.mjs"; // already present in your repo

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
    const precision = (env?.TPE_PRECISION ? Number(env.TPE_PRECISION) : 12)>>>0;

    if (url.pathname.endsWith("/spec") && method==="GET"){
      const res = {
        ok:true,
        constraints:{
          conserveSum: env?.SIM_CONSERVE_SUM ?? null,
          tol:         env?.SIM_CONSERVE_TOL ?? "1e-9",
          lipschitz:   env?.SIM_LIPSCHITZ_MAX ?? null,
          gamma:       env?.SIM_DAMP_GAMMA ?? "0.2"
        }
      };
      const { proof, headers } = await withProof({ meta:{ svc:"sim/spec" }, res }, env);
      return json({ ...res, proof }, headers);
    }

    if (url.pathname.endsWith("/hypothesis/collapse") && method==="POST"){
      const body = await req.json().catch(()=> ({}));
      const seed = String(body.seed ?? env?.SIM_SEED ?? "codex");
      const out  = await collapseHypotheses(body.hypotheses||[], body.weights||[], seed);
      const { proof, headers } = await withProof({ meta:{ svc:"sim/hypothesis/collapse" }, out }, env);
      return json({ ok:true, result: out }, headers);
    }

    if (url.pathname.endsWith("/project") && method==="POST"){
      const body = await req.json().catch(()=> ({}));
      const xs   = Array.isArray(body.series)? body.series : [];
      const opts = Object.assign({
        conserveSum: (env?.SIM_CONSERVE_SUM!==undefined ? Number(env.SIM_CONSERVE_SUM) : undefined),
        tol: (env?.SIM_CONSERVE_TOL!==undefined ? Number(env.SIM_CONSERVE_TOL) : undefined),
        lipschitz: (env?.SIM_LIPSCHITZ_MAX!==undefined ? Number(env.SIM_LIPSCHITZ_MAX) : undefined),
        gamma: (env?.SIM_DAMP_GAMMA!==undefined ? Number(env.SIM_DAMP_GAMMA) : undefined)
      }, body.constraints||{});
      const projected = projectAll(xs, opts);
      const rounded   = roundVec(projected, precision);
      const res = { inputCount: xs.length, outCount: rounded.length, series: rounded, constraints: opts };
      const { proof, headers } = await withProof({ meta:{ svc:"sim/project" }, res }, env);
      return json({ ok:true, result: res }, headers);
    }

    return json({ ok:true, endpoints:["/svc/sim/spec","/svc/sim/hypothesis/collapse","/svc/sim/project"] });
  }
}