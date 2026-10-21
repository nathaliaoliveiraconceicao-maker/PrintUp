/** Caminhos no bucket privado `user-images`: sempre `<usuário>/<produtos|logo>/<uuid>.<ext>` gerados por nós. */
export const IMAGE_BUCKET = "user-images";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const productPhotoPath = (userId: string, id: string, ext: "jpg" | "png") => `${userId}/produtos/${id}.${ext}`;
export const logoPath = (userId: string, id: string, ext: "jpg" | "png") => `${userId}/logo/${id}.${ext}`;

export const isValidProductPhotoPath = (userId: string, p: string) => new RegExp(`^${esc(userId)}/produtos/${UUID}\\.(jpg|png)$`).test(p);
export const isValidLogoPath = (userId: string, p: string) => new RegExp(`^${esc(userId)}/logo/${UUID}\\.(jpg|png)$`).test(p);
