import { createRemoteJWKSet, jwtVerify } from "jose";
export async function verifyBearerJWT(env: any, token: string){
  const iss = env?.JWT_ISSUER, aud = env?.JWT_AUDIENCE, jwks = env?.JWT_JWKS_URL;
  if (!iss || !aud || !jwks) return { ok:false, error:"jwt.not_configured" as const };
  const jwksSet = createRemoteJWKSet(new URL(jwks), { cache:true, cooldownDuration:30000 });
  try { const { payload } = await jwtVerify(token, jwksSet, { issuer: iss, audience: aud });
        return { ok:true as const, payload }; } catch { return { ok:false as const, error:"jwt.invalid" }; }
}
