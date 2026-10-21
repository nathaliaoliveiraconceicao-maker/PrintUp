"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { uuid4 } from "@/features/imports/paths";
import { IMAGE_BUCKET, MAX_IMAGE_BYTES } from "./image-paths";

/** Reduz no navegador (lado maior ≤ `maxSide`). Reexportar em canvas também remove metadados (ex.: GPS da foto). */
async function shrink(file: File, maxSide: number, png: boolean): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  if (!png) {
    ctx.fillStyle = "#ffffff"; // JPEG não tem transparência
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), png ? "image/png" : "image/jpeg", 0.85),
  );
}

/**
 * Escolhe uma imagem, reduz, envia direto ao Storage (pasta do usuário) e pede ao servidor para registrar —
 * o servidor confere o tipo real do arquivo antes de aceitar.
 */
export function ImageUploader({
  currentUrl,
  folder,
  label,
  maxSide = 1000,
  keepTransparency = false,
  onSaved,
  onRemoved,
  testId,
}: {
  currentUrl: string | null;
  /** Pasta dentro da do usuário: "produtos" ou "logo". */
  folder: "produtos" | "logo";
  label: string;
  maxSide?: number;
  keepTransparency?: boolean;
  /** Recebe o caminho enviado; devolve mensagem de erro (ou undefined se registrou). */
  onSaved: (path: string) => Promise<string | undefined>;
  onRemoved: () => Promise<string | undefined>;
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [pending, start] = useTransition();

  const pick = (file: File | undefined) => {
    if (!file) return;
    setError(undefined);
    start(async () => {
      try {
        if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use uma imagem JPG, PNG ou WebP.");
        const png = keepTransparency && file.type === "image/png";
        const blob = await shrink(file, maxSide, png);
        if (blob.size > MAX_IMAGE_BYTES) throw new Error("A imagem ficou grande demais. Tente uma menor.");
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Sessão expirada. Entre novamente.");
        const path = `${user.id}/${folder}/${uuid4()}.${png ? "png" : "jpg"}`;
        const { error: upErr } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: png ? "image/png" : "image/jpeg" });
        if (upErr) throw new Error("Não foi possível enviar a imagem. Confira seu espaço no plano e tente de novo.");
        const problem = await onSaved(path);
        if (problem) throw new Error(problem);
        setPreview(URL.createObjectURL(blob));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível enviar a imagem.");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  };

  return (
    <div className="flex items-center gap-4" data-testid={testId}>
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-paper text-muted">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} className="h-full w-full object-contain" />
        ) : (
          <ImagePlus size={28} aria-hidden="true" />
        )}
      </div>
      <div className="space-y-2">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={label} onChange={(e) => pick(e.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => input.current?.click()}>
            {pending ? "Enviando…" : preview ? "Trocar imagem" : "Escolher imagem"}
          </Button>
          {preview && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const problem = await onRemoved();
                  if (problem) setError(problem);
                  else setPreview(null);
                })
              }
            >
              <Trash2 size={14} />Remover
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">JPG, PNG ou WebP. Reduzimos a imagem automaticamente.</p>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
