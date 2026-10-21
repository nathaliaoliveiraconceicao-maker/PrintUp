/**
 * Caminhos de objetos no bucket privado `model-files`. Sempre `<id do usuário>/…` com nomes gerados por nós:
 * o nome original do arquivo é sanitizado e nunca decide a pasta.
 */
export const BUCKET = "model-files";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function safeFileName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-80);
  return base || "arquivo";
}

export const filePath = (userId: string, id: string, name: string) => `${userId}/${id}-${safeFileName(name)}`;
export const thumbPath = (userId: string, id: string) => `${userId}/thumbs/${id}.png`;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function isValidFilePath(userId: string, path: string): boolean {
  return new RegExp(`^${esc(userId)}/${UUID}-[A-Za-z0-9._-]{1,80}$`).test(path);
}
export function isValidThumbPath(userId: string, path: string): boolean {
  return new RegExp(`^${esc(userId)}/thumbs/${UUID}\\.png$`).test(path);
}

/** UUID v4 que funciona também fora de HTTPS (crypto.randomUUID só existe em contextos seguros). */
export function uuid4(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
