import { makeProof, sha256B64u } from "./lib/proof.mjs";

const te = new TextEncoder();

function stable(obj){
  if (obj===null || typeof obj!=="object") return obj;
  if (Array.isArray(obj)) return obj.map(stable);
  const out = {}; for (const k of Object.keys(obj).sort()) out[k] = stable(obj[k]); return out;
}
function flags(env){
  return {
    infinity:(env?.INFINITY_MODE||"on")==="on",
    safety: env?.INFINITY_SAFETY||"strict",
    symbology:(env?.INFINITY_SYMBOLS||"Ω,∑,∞").split(","),
    quantum_memory:(env?.QUANTUM_MEMORY||"on")==="on",
    recursive_logic:(env?.RECURSIVE_LOGIC||"on")==="on",
    quantum_control:(env?.QUANTUM_CONTROL||"on")==="on",
    dreamtime_logic:(env?.DREAMTIME_LOGIC||"on")==="on",
    nature_logic:(env?.NATURE_LOGIC||"on")==="on",
    ocean_logic:(env?.OCEAN_LOGIC||"on")==="on",
    physics_logic:(env?.PHYSICS_LOGIC||"on")==="on",
    coherent_logic:(env?.COHERENT_LOGIC||"on")==="on",
    rl_max_depth:Number(env?.RL_MAX_DEPTH||"3"),
    rl_max_ms:Number(env?.RL_MAX_MS||"120"),
    rate_per_min:Number(env?.RATE_PER_MIN||"600"),
    proof_marks:(env?.PROOF_MARKS||"light")
  };
}
const RL=new Map();
function rateCheck(key,limit){ const now=Date.now(), slot=Math.floor(now/60000); const rec=RL.get(key); if(!rec||rec.slot!==slot){ RL.set(key,{slot,tokens:limit-1}); return {ok:true,remain:limit-1}; } if(rec.tokens<=0) return {ok:false,remain:0}; rec.tokens--; return {ok:true,remain:rec.tokens}; }
function deriveIdSeed(req, body){ const base=`${req.method}|${req.url}|${body||""}`; let x=0; for(let i=0;i<base.length;i++){ x=(x*33+base.charCodeAt(i))>>>0 } return { id:(x>>>0).toString(16).padStart(8,"0"), seed:x>>>0 }; }
function featureList(){ return ["proof-marks-"+(true?"full-or-light":"n/a"),"deterministic-request-id","deterministic-seed","coherent-logic-gates","quantum-memory-hints","recursive-logic-budget","nature/ocean/physics-biasing","decision-argmax+mc","server-timing","rate-limit"]; }

export async function decorate(req, env, res, meta={}){
  const started = Number(meta?.t0||Date.now());
  const dt = Date.now()-started;
  const H = new Headers(res.headers);
  const text = await res.clone().text().catch(()=> "");
  const ct = (res.headers.get("content-type")||"").toLowerCase();
  const F = flags(env);
  const {id,seed} = deriveIdSeed(req, text);

  H.set("x-request-id", id);
  H.set("x-seed", String(seed));
  H.set("Server-Timing", `app;dur=${dt}`);
  H.set("x-runtime-ms", String(dt));
  H.set("x-ratelimit-remaining", (meta?.remain!=null? String(meta.remain) : H.get("x-ratelimit-remaining") || ""));
  H.set("x-features", featureList().join(","));
  H.set("x-symbology", (F.symbology||[]).join(","));

  // SSE or non-JSON → only attach timing/ids
  if(!ct.includes("application/json")) return new Response(res.body, { status:res.status, headers:H });

  let json=null; try{ json = JSON.parse(text) }catch{}
  if(!json) return new Response(res.body, { status:res.status, headers:H });

  // Light proof (hash only) or Full proof (signed) depending on PROOF_MARKS
  const stableJson = stable(json);
  if (String(F.proof_marks).toLowerCase()==="full"){
    const sig = await makeProof(stableJson, env);
    H.set("x-proof-alg", String(sig.alg||""));
    H.set("x-proof-hash", String(sig.hash||""));
    if (sig.sig) H.set("x-proof-sig", String(sig.sig));
    if (sig.pub) H.set("x-proof-pub", String(sig.pub));
  } else {
    const payload = te.encode(JSON.stringify(stableJson));
    const hash = await sha256B64u(payload);
    H.set("x-proof-alg", "SHA-256-stablejson");
    H.set("x-proof-hash", hash);
  }
  // attach flags/meta for introspection
  json.meta = Object.assign({}, json.meta||{}, { flags:F, request_id:id, seed });
  return new Response(JSON.stringify(json), { status:res.status, headers:H });
}

export async function applyPipeline(req, env, ctx, serviceId, handler){
  const t0=Date.now(); const F=flags(env);
  if((F.safety||"strict")==="deny") return new Response(JSON.stringify({ok:false,error:"svc-disabled-by-policy",service:serviceId,ts:new Date().toISOString()}),{status:503,headers:{'content-type':'application/json'}});
  const apiKey=req.headers.get("x-api-key")||"anon"; const rl = rateCheck(apiKey, F.rate_per_min);
  if(!rl.ok) return new Response(JSON.stringify({ok:false,error:"rate-limit",per_min:F.rate_per_min}),{status:429,headers:{'content-type':'application/json','x-ratelimit-remaining':String(rl.remain)}});
  const resp = await (handler?.fetch ? handler.fetch(req, env, ctx) : (typeof handler==="function" ? handler(req,env,ctx) : null));
  if(!(resp instanceof Response)) return resp;
  return decorate(req, env, resp, { t0, remain: rl.remain });
}

export function featureResponder(req, env){
  const body = { ok:true, ts:new Date().toISOString(), features:["proof-marks","headers","timing","rate"], flags:{
    PROOF_MARKS: env?.PROOF_MARKS || "light", INFINITY_SAFETY: env?.INFINITY_SAFETY || "strict"
  }};
  return new Response(JSON.stringify(body), { headers:{ "content-type":"application/json" }});
}