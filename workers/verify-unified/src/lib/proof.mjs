import canonicalize from "canonicalize";
import nacl from "tweetnacl";

// Polyfills for atob/btoa in Node (nodejs_compat)
const atobSafe = (typeof atob === "function") ? atob : (b64)=>Buffer.from(b64,"base64").toString("binary");
const btoaSafe = (typeof btoa === "function") ? btoa : (bin)=>Buffer.from(bin,"binary").toString("base64");

// bytes <-> base64url
export function b64uToBytes(b64u){
  const pad = "=".repeat((4 - (b64u.length % 4)) % 4);
  const b64 = (b64u + pad).replace(/-/g,"+").replace(/_/g,"/");
  const bin = atobSafe(b64);
  const arr = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
export function bytesToB64u(arr){
  let bin = "";
  for(let i=0;i<arr.length;i++) bin += String.fromCharCode(arr[i]);
  return btoaSafe(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

export function canonicalizeRFC8785(obj){
  return canonicalize(obj);
}

export async function sha256Bytes(buf){
  const d = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(d);
}
export async function sha256B64u(buf){
  return bytesToB64u(await sha256Bytes(buf));
}

export async function signEd25519B64u(hashBytes, secretKeyB64u){
  const sk = b64uToBytes(secretKeyB64u);
  const sig = nacl.sign.detached(hashBytes, sk);
  return bytesToB64u(sig);
}
export function verifyEd25519(hashBytes, sigB64u, pubB64u){
  const sig = b64uToBytes(sigB64u);
  const pk  = b64uToBytes(pubB64u);
  return nacl.sign.detached.verify(hashBytes, sig, pk);
}

export async function makeProof(payload, env){
  const canon = canonicalizeRFC8785(payload);
  const bytes = new TextEncoder().encode(canon);
  const hashBytes = await sha256Bytes(bytes);
  const hash = bytesToB64u(hashBytes);
  const pub  = env?.PROOF_PUBLIC_B64U;
  const sec  = env?.PROOF_SECRET_B64U;
  let out = { alg: "Ed25519-SHA256-RFC8785", hash };
  if (pub && sec){
    const sig = await signEd25519B64u(hashBytes, sec);
    out = { alg: "Ed25519-SHA256-RFC8785", hash, pub, sig };
  }
  return out;
}