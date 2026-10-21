"use client";

import { useRouter } from "next/navigation";
import { ImageUploader } from "./image-uploader";
import type { ProductActionState } from "./catalog-schema";

export function ProductPhoto({
  productId,
  currentUrl,
  setPhoto,
}: {
  productId: string;
  currentUrl: string | null;
  setPhoto: (productId: string, path: string | null) => Promise<ProductActionState>;
}) {
  const router = useRouter();
  return (
    <ImageUploader
      testId="foto-produto"
      folder="produtos"
      label="Foto do produto"
      currentUrl={currentUrl}
      onSaved={async (path) => {
        const r = await setPhoto(productId, path);
        if (r.ok) router.refresh();
        return r.error;
      }}
      onRemoved={async () => {
        const r = await setPhoto(productId, null);
        if (r.ok) router.refresh();
        return r.error;
      }}
    />
  );
}
