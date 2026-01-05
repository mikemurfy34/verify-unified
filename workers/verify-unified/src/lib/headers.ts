export function stdHeaders(env: any): Headers {
  const h = new Headers();
  if (env?.VERIFY_MODE) h.set("x-mode", String(env.VERIFY_MODE));
  if (env?.WORKER_NAME) h.set("x-worker", String(env.WORKER_NAME));
  if (env?.BUILD_DATE)  h.set("x-build-date", String(env.BUILD_DATE));
  if (env?.BUILD_ID)    h.set("x-build-id", String(env.BUILD_ID));
  h.set("x-robots-tag","noindex"); h.set("referrer-policy","no-referrer");
  h.set("x-content-type-options","nosniff");
  h.set("strict-transport-security","max-age=31536000; includeSubDomains; preload");
  h.set("cache-control","no-store");
  return h;
}
