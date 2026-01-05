function ok(v){ return typeof v==="string" && v.length>0 }
export default {
  async fetch(req, env){
    const url = new URL(req.url);
    if (!url.pathname.endsWith("/get")) {
      return new Response(JSON.stringify({ ok:true, endpoints:["/svc/secrets/get"]}),{headers:{ "content-type":"application/json"}});
    }
    const name = (url.searchParams.get("name")||"").toUpperCase().replace(/[^A-Z0-9_]/g,"");
    if (!name) return new Response(JSON.stringify({ ok:false, error:"name-required"}),{status:400,headers:{ "content-type":"application/json"}});
    const v = env?.[name] || env?.["SECRET_"+name] || null;
    if (!ok(v)) return new Response(JSON.stringify({ ok:false, error:"not-found"}),{status:404,headers:{ "content-type":"application/json"}});
    return new Response(JSON.stringify({ ok:true, name, value:v }),{headers:{ "content-type":"application/json"}});
  }
}