function hash32(s){ let x=2166136261>>>0; for(let i=0;i<s.length;i++){ x^=s.charCodeAt(i); x=(x*16777619)>>>0 } return x>>>0 }
function rng(seed){ let x=seed>>>0; return ()=>{ x=(x*1664525+1013904223)>>>0; return (x>>>0)/4294967296 } }

export default {
  async fetch(req){
    const url = new URL(req.url);
    if (url.pathname.endsWith("/plan")){
      const body = await req.json().catch(()=>({}));
      const seedIn = (body.seed ?? 0) | 0;
      const seed = seedIn || hash32(JSON.stringify(body)||"");
      const R = rng(seed);
      const goals = Array.isArray(body.goals)? body.goals.map(String) : [];
      const scored = goals.map(g => ({ g, w: (R()*1e6|0), lex: g }))
                          .sort((a,b)=> a.lex.localeCompare(b.lex) || a.w-b.w);
      const plan = scored.map((o,i)=>({ step:i+1, action:o.g, score:o.w, seed }));
      return new Response(JSON.stringify({ ok:true, seed, plan, note:"deterministic decision-simulation stub"}), { headers:{ "content-type":"application/json"}});
    }
    return new Response(JSON.stringify({ ok:true, endpoints:["/svc/decision-simulation/plan"]}), { headers:{ "content-type":"application/json"}});
  }
}