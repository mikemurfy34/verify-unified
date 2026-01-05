let MEM = { docs:{} }; // dev fallback

async function ensureStore(env){
  // If a KV binding "RAG_KV" exists, use it; else MEM fallback
  return {
    async put(id, record){ if (env?.RAG_KV){ await env.RAG_KV.put(id, JSON.stringify(record)); } else { MEM.docs[id] = record } },
    async get(id){ if (env?.RAG_KV){ const v = await env.RAG_KV.get(id,"json"); return v } else { return MEM.docs[id] || null } },
    async list(){ if (env?.RAG_KV){ const it = await env.RAG_KV.list(); return it?.keys?.map(k=>k.name)||[] } else { return Object.keys(MEM.docs) } }
  }
}

// deterministic 256-dim embed (same as embeddings svc logic)
function embed256(s){
  const dim=256; const v=new Float32Array(dim); s=(s??"").toLowerCase();
  for(let i=0;i<s.length;i++){ const a=s.charCodeAt(i), b=s.charCodeAt((i+1)%s.length), c=s.charCodeAt((i+2)%s.length); const h=(a*31+b*17+c*13+i*7)>>>0; v[h%dim]+=1 }
  let m=0; for(let i=0;i<dim;i++) m+=v[i]*v[i]; m=Math.sqrt(m)||1; for(let i=0;i<dim;i++) v[i]/=m; return v;
}
function cos(a,b){ let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return s }

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    const store = await ensureStore(env);

    if (url.pathname.endsWith("/ingest")){
      const {id,text,parents=[]} = await req.json().catch(()=>({}));
      if(!id||!text) return new Response(JSON.stringify({ ok:false, error:"need id,text"}),{status:400,headers:{ "content-type":"application/json"}});
      const vec = Array.from(embed256(text));
      const rec = { id, text, vec, parents, ts: new Date().toISOString() };
      await store.put(id, rec);
      return new Response(JSON.stringify({ ok:true, id, len:text.length, parents, ts: rec.ts }),{headers:{ "content-type":"application/json"}});
    }

    if (url.pathname.endsWith("/query")){
      const {text,k=5} = await req.json().catch(()=>({}));
      const q = embed256(text??"");
      const ids = await store.list();
      const docs = await Promise.all(ids.map(async id => await store.get(id)));
      const scored = docs.filter(Boolean).map(d=>({id:d.id,score:cos(q, new Float32Array(d.vec||[]))})).sort((a,b)=>b.score-a.score).slice(0,k);
      return new Response(JSON.stringify({ ok:true, k, hits:scored, ts: new Date().toISOString()}),{headers:{ "content-type":"application/json"}});
    }

    if (url.pathname.endsWith("/get")){
      const id = url.searchParams.get("id");
      const d = id? await store.get(id): null;
      if(!d) return new Response(JSON.stringify({ ok:false, error:"not-found"}),{status:404,headers:{ "content-type":"application/json"}});
      return new Response(JSON.stringify({ ok:true, doc:d }),{headers:{ "content-type":"application/json"}});
    }

    return new Response(JSON.stringify({ ok:true, endpoints:["/svc/rag-store/ingest","/svc/rag-store/query","/svc/rag-store/get"]}),{headers:{ "content-type":"application/json"}});
  }
}