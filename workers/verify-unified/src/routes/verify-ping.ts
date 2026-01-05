import { PingReq, EchoReq } from "../schema/verify";
import { stdHeaders } from "../lib/headers";
export async function tryPingOk(req: Request, env: any): Promise<Response|null> {
  if (String(env?.VERIFY_MODE || "") !== "verify") return null;
  const ct = req.headers.get("content-type")?.toLowerCase() || "";
  if (!ct.includes("application/json")) return null;
  let body: any; try { body = await req.clone().json(); } catch { return null; }
  const isPing = PingReq.safeParse(body).success;
  const isEcho = EchoReq.safeParse(body).success;
  if (!isPing && !isEcho) return null;
  const json = { ok:true, mode: env?.VERIFY_MODE || "verify", worker: env?.WORKER_NAME || "worker", buildId: env?.BUILD_ID || "dev", ts: new Date().toISOString(), ...(body.echo !== undefined ? { echo: body.echo } : {}) };
  const h = stdHeaders(env); h.set("content-type","application/json;charset=utf-8");
  return new Response(JSON.stringify(json), { status: 200, headers: h });
}
