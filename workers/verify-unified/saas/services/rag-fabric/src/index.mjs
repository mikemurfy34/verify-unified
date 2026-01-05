export default {
  async fetch(){
    return new Response(JSON.stringify({ ok:true, note:"rag-fabric stub", endpoints:["/svc/rag-fabric/ingest","/svc/rag-fabric/query"]}), { headers:{ "content-type":"application/json"}});
  }
}