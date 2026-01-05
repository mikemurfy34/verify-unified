import { jsonError } from "./errors";
export function requireIdem(request: Request, env: any): Response | null {
  if (env?.IDEMPOTENCY_REQUIRED !== "1") return null;
  const key = request.headers.get("Idempotency-Key");
  if (!key) return jsonError(env, "idem.missing", "Idempotency-Key header is required", 400);
  if (key.length > 256) return jsonError(env, "idem.too_long", "Idempotency-Key too long", 400);
  return null;
}
