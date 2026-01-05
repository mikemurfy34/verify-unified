import { makeProof } from "../../lib/proof.mjs";
import { addressOf, commitCell, shallowDiff } from "../../lib/qmem.mjs";
import { recurseFixedPoint } from "../../lib/recursor.mjs";

function json(res, headers={}){ return new Response(JSON.stringify(res), { headers:{ "content-type":"application/json", ...headers }}) }
async function withProof(body, env){
  const proof = await makeProof(body, env);
  const hdr = { "x-proof-alg": proof.alg, "x-proof-hash": proof.hash };
  if (proof.sig) hdr["x-proof-sig"] = "1";
  return { proof, headers: hdr };
}

function claims(req){
  const h = req.headers;
  return {
    tenant:    h.get("x-tenant")    || "unknown",
    actor:     h.get("x-actor")     || "unknown",
    clearance: h.get("x-clearance") || "none",
    apiKey:    h.get("x-api-key")   || ""
  };
}

function loadPolicies(env){
  // Example shape:
  // C2_POLICIES_JSON = {"allow":[{"svc":"/svc/domain-pack/oceanos/restoration","tenant":"alpha","clearance":"secret"}]}
  try { return JSON.parse(env?.C2_POLICIES_JSON || '{"allow":[]}') } catch { return { allow:[] } }
}
function abacAllow(policies, reqClaims, svc){
  return (policies.allow||[]).some(r =>
    (r.svc===svc) &&
    (r.tenant ? r.tenant===reqClaims.tenant : true) &&
    (r.clearance ? r.clearance===reqClaims.clearance : true)
  );
}

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const pol = loadPolicies(env);

    if (url.pathname.endsWith("/spec") && method==="GET"){
      const res = { ok:true, policies: pol };
      const { proof, headers } = await withProof({ meta:{ svc:"c2/spec" }, res }, env);
      return json({ ...res, proof }, headers);
    }

    // Gate a requested service path using ABAC (no proxying here; demo returns decision)
    if (url.pathname.endsWith("/guard") && method==="POST"){
      const body = await req.json().catch(()=> ({}));
      const svc  = String(body.svc || "");
      const cl   = claims(req);
      const allow = abacAllow(pol, cl, svc);
      const res = { ok:true, svc, claims:cl, decision: allow ? "allow" : "deny" };
      const { proof, headers } = await withProof({ meta:{ svc:"c2/guard" }, res }, env);
      return json({ ...res, proof }, headers);
    }

    // Deterministic "write" to memory (address derived from payload)
    if (url.pathname.endsWith("/qmem/commit") && method==="POST"){
      const body = await req.json().catch(()=> ({}));
      const cell = await commitCell(body.payload ?? {}, body.tags ?? []);
      const { proof, headers } = await withProof({ meta:{ svc:"c2/qmem/commit" }, cell }, env);
      return json({ ok:true, cell, proof }, headers);
    }

    // Deterministic recursion demo: converge via stepFn (example: shrink array by averaging neighbors)
    if (url.pathname.endsWith("/recurse") && method==="POST"){
      const body = await req.json().catch(()=> ({}));
      const seed = body.seed ?? { v:[1,2,3,4] };
      const md   = Math.max(1, Math.min(128, Number(body.maxDepth ?? env?.RECURSE_MAX_DEPTH ?? 32)));
      const stepFn = async (st)=>{
        const v = Array.isArray(st.v)? st.v.map(Number):[];
        if (v.length<=1) return st;
        const u = [];
        for (let i=0;i<v.length-1;i++) u.push((v[i]+v[i+1])/2);
        return { v: u };
      };
      const out = await recurseFixedPoint(seed, stepFn, { maxDepth: md });
      const { proof, headers } = await withProof({ meta:{ svc:"c2/recurse" }, out }, env);
      return json({ ok:true, result: out }, headers);
    }

    return json({ ok:true, endpoints:["/svc/c2/spec","/svc/c2/guard","/svc/c2/qmem/commit","/svc/c2/recurse"] });
  }
}