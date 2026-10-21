import { describe, expect, it } from "vitest";
import { detectImageKind } from "./image-type";

describe("detectImageKind", () => {
  it("reconhece PNG, JPEG e WebP pelos bytes", () => {
    expect(detectImageKind(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(detectImageKind(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(detectImageKind(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("webp");
  });
  it("rejeita o resto (SVG, HTML, PDF, vazio)", () => {
    expect(detectImageKind(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImageKind(new TextEncoder().encode("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectImageKind(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(detectImageKind(new Uint8Array())).toBeNull();
  });
});
