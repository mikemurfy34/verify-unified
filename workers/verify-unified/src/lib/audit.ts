export async function writeAudit(env: any, key: string, record: unknown){
  if (!env?.AUDIT_ENABLE || env.AUDIT_ENABLE === "0") return;
  const b = env.AUDIT_R2; if (!b) return;
  const name = `${env?.WORKER_NAME || "worker"}/${env?.BUILD_ID || "dev"}/${key}.json`;
  await b.put(name, JSON.stringify(record),
    { httpMetadata: { contentType: "application/json" }});
}
