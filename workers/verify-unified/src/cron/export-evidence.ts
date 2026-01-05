import { writeAudit } from "../lib/audit";
export default async function exportEvidence(env: any){
  const summary = { ts: new Date().toISOString(), worker: env?.WORKER_NAME, buildId: env?.BUILD_ID, mode: env?.VERIFY_MODE };
  await writeAudit(env, `daily/${summary.ts}`, summary);
}
