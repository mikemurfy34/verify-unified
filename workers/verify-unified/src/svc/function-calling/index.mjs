import { abacCheck } from "\.\./\.\./lib/abac.mjs";
import { makeProof } from "\.\./\.\./lib/proof.mjs";

const REGISTRY = {
  "echo": {
    desc: "Return payload",
    call: async ({payload}) => ({ echo: payload ?? null })
  },
  "cosine": {
    desc: "Cosine(a,b) for equal-length vectors",
    call: async ({a=[],b=[]})=>{
      if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length) throw new Error("bad-shape");
      let s=0, d1=0, d2=0; for(let i=0;i<a.length;i++){ s+=a[i]*b[i]; d1+=a[i]*a[i]; d2+=b[i]*b[i] }
      const v=(s/((Math.sqrt(d1)||1)*(Math.sqrt(d2)||1)));
      return { value: v }
    }
  }
};

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    if (url.pathname.endsWith("/registry")){
      return new Response(JSON.stringify({ ok:true, tools:Object.keys(REGISTRY)}),{headers:{ "content-type":"application/json"}});
    }
    if (!url.pathname.endsWith("/call")){
      return new Response(JSON.stringify({ ok:true, endpoints:["/svc/function-calling/registry","/svc/function-calling/call"]}),{headers:{ "content-type":"application/json"}});
    }
    const pol = abacCheck(req, env, { resource:"function", action:"call" });
    if (!pol.ok) return new Response(JSON.stringify({ ok:false, error:"abac-deny", reason:pol.reason }), { status:403, headers:{ "content-type":"application/json"}});

    const body = await req.json().catch(()=>({}));
    const name = String(body.name||"").toLowerCase();
    const args = body.args || {};
    const tool = REGISTRY[name];
    if(!tool) return new Response(JSON.stringify({ ok:false, error:"unknown-tool"}),{status:404,headers:{ "content-type":"application/json"}});
    let output=null, error=null;
    try{ output = await tool.call(args) }catch(e){ error=String(e?.message||e) }
    const audit = {
      ok: !error, tool:name, args, output, error, ts: new Date().toISOString(),
      abac: pol.context
    };
    // attach proof block
    const sig = await makeProof({ meta:{route:"/svc/function-calling/call"}, audit }, env);
    return new Response(JSON.stringify({ ok:!error, audit, sig }), { headers:{ "content-type":"application/json"}});
  }
}