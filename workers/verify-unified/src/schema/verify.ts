import { z } from "zod";
export const PingReq = z.object({ ping: z.literal("ok") });
export const EchoReq = z.object({ echo: z.any() });
export const VerifySuccess = z.object({ ok: z.literal(true), mode: z.string(), worker: z.string(), buildId: z.string(), ts: z.string(), echo: z.any().optional() });
export const VerifyError = z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() })});
