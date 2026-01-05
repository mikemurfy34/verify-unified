export function abacCheck(req, env, {action="call",resource="svc",tenant=null,role=null,clearance=null}={}){
  const pol = (env?.INFINITY_SAFETY || "strict");
  if (pol === "deny") return { ok:false, reason:"policy-deny" };
  // Basic headers
  const hdr = k => req.headers.get(k) || "";
  const H = {
    key: hdr("x-api-key"),
    tenant: hdr("x-tenant") || tenant || "public",
    actor: hdr("x-actor") || "anon",
    role: hdr("x-role") || role || "user",
    clearance: hdr("x-clearance") || clearance || "unclass"
  };
  // deny-by-default if no api key in strict mode
  if (pol === "strict" && !H.key) return { ok:false, reason:"missing-api-key" };
  // Example: require clearance for function-calling
  if (resource === "function" && !/secret|high/.test(H.clearance)) return { ok:false, reason:"insufficient-clearance" };
  return { ok:true, context:H };
}