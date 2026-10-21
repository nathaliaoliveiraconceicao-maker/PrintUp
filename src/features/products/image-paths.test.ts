import { describe, expect, it } from "vitest";
import { isValidLogoPath, isValidProductPhotoPath, logoPath, productPhotoPath } from "./image-paths";

const U = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";

describe("caminhos de imagem", () => {
  it("aceita só a pasta do próprio usuário e o formato esperado", () => {
    expect(isValidProductPhotoPath(U, productPhotoPath(U, ID, "jpg"))).toBe(true);
    expect(isValidLogoPath(U, logoPath(U, ID, "png"))).toBe(true);
    expect(isValidProductPhotoPath(U, `33333333-3333-4333-8333-333333333333/produtos/${ID}.jpg`)).toBe(false);
    expect(isValidProductPhotoPath(U, `${U}/produtos/../${ID}.jpg`)).toBe(false);
    expect(isValidProductPhotoPath(U, `${U}/produtos/${ID}.svg`)).toBe(false);
    expect(isValidProductPhotoPath(U, logoPath(U, ID, "jpg"))).toBe(false);
  });
});
