export default {
  async fetch(req){
    const url = new URL(req.url);
    if (url.pathname.endsWith("/query")) {
      return new Response(JSON.stringify({ ok:true, lineage:[], note:"lineage-governance stub" }), { headers:{ "content-type":"application/json"}});
    }
    return new Response(JSON.stringify({ ok:true, endpoints:["/svc/lineage-governance/query"]}), { headers:{ "content-type":"application/json"}});
  }
}