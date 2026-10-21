import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 em hexadecimal do corpo BRUTO (nunca do JSON já interpretado). */
export const hmacHex = (secret: string, rawBody: string): string => createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

/** Comparação em tempo constante; strings de tamanhos diferentes são recusadas sem vazar onde divergem. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyHmac(secret: string | undefined, rawBody: string, received: string | null): boolean {
  if (!secret || secret.length < 16 || !received) return false;
  return safeEqual(hmacHex(secret, rawBody), received.trim().toLowerCase());
}
