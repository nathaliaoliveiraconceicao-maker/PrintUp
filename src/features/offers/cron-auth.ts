import { timingSafeEqual } from "node:crypto";

/** `null` = segredo não configurado (ou curto demais): a rotina recusa tudo. */
export function cronAuthorized(authorization: string | null, secret: string | undefined): boolean | null {
  if (!secret || secret.length < 16) return null;
  const a = Buffer.from(authorization ?? ""), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
