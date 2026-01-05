const te = new TextEncoder();
function embed256(s){ const dim=256, v=new Float32Array(dim); s=(s??"").toLowerCase();
  for(let i=0;i<s.length;i++){ const a=s.charCodeAt(i), b=s.charCodeAt((i+1)%s.length), c=s.charCodeAt((i+2)%s.length);
    const h=(a*31+b*17+c*13+i*7)>>>0; v[h%dim]+=1 } let m=0; for(let i=0;i<dim;i++) m+=v[i]*v[i];
  m=Math.sqrt(m)||1; for(let i=0;i<dim;i++) v[i]/=m; return Array.from(v);
}
export default {
  async fetch(req){
    const url = new URL(req.url);
    if (url.pathname.endsWith("/embed")){
      const body = await req.json().catch(()=>({}));
      const text = String(body.text ?? "");
      return new Response(JSON.stringify({ ok:true, vector: embed256(text), len: text.length }), { headers:{ "content-type":"application/json" }});
    }
    return new Response(JSON.stringify({ ok:true, endpoints:["/svc/embeddings/embed"]}),{headers:{ "content-type":"application/json"}});
  }
}