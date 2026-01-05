export default {
  async fetch(req){
    const url = new URL(req.url);
    if (url.pathname.endsWith("/stream")){
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const enc = (s)=> new TextEncoder().encode(s);
      writer.write(enc(`{"ok":true,"note":"event-streaming stub (JSON instead of SSE for decoration)"}\n`));
      writer.close();
      return new Response(readable, { headers:{ "content-type":"application/json" }});
    }
    return new Response(JSON.stringify({ ok:true, endpoints:["/svc/event-streaming/stream"]}), { headers:{ "content-type":"application/json"}});
  }
}