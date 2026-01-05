export default {
  async fetch(req, env){
    const body = {
      ok:true, ts: new Date().toISOString(),
      worker: "verify-unified",
      proof_mode: env?.PROOF_MARKS || "light",
      safety: env?.INFINITY_SAFETY || "strict",
      infinity: (env?.INFINITY_MODE || "on") === "on",
      rate_per_min: Number(env?.RATE_PER_MIN || "600")
    };
    return new Response(JSON.stringify(body), { headers:{ "content-type":"application/json" }});
  }
}