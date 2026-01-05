import { stdHeaders } from "./headers";
export function jsonError(env: any, code: string, message: string, status = 400): Response {
  const body = JSON.stringify({ ok: false, error: { code, message }});
  const h = stdHeaders(env); h.set("content-type","application/json;charset=utf-8");
  return new Response(body, { status, headers: h });
}
