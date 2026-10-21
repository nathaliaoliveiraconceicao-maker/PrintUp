"use server";

import { revalidatePath } from "next/cache";
import { dbErrorMessage, zodToState, type FormState } from "@/lib/forms";
import { detectImageKind } from "@/lib/image-type";
import { createClient } from "@/lib/supabase/server";
import { IMAGE_BUCKET, MAX_IMAGE_BYTES, isValidLogoPath } from "@/features/products/image-paths";
import { businessSchema } from "./schema";

export async function saveBusiness(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = businessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  const { error } = await supabase.from("business_profiles").upsert({
    user_id: user.id,
    business_name: v.businessName ?? null,
    contact_name: v.contactName ?? null,
    phone: v.phone ?? null,
    email: v.email ?? null,
    city: v.city ?? null,
    brand_color: v.brandColor,
    default_validity_days: Math.round(v.defaultValidityDays),
    default_payment_terms: v.defaultPaymentTerms ?? null,
    default_notes: v.defaultNotes ?? null,
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/negocio");
  revalidatePath("/orcamentos/novo");
  return { ok: "Dados do negócio salvos." };
}

/** Registra o logo já enviado ao Storage; confere pasta, tamanho e tipo real (JPG/PNG) antes de aceitar. */
export async function setLogo(path: string | null): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  if (path !== null) {
    if (!isValidLogoPath(user.id, path)) return { error: "Caminho de imagem inválido." };
    const { data: blob } = await supabase.storage.from(IMAGE_BUCKET).download(path);
    const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    const kind = bytes ? detectImageKind(bytes) : null;
    if (!bytes || bytes.length > MAX_IMAGE_BYTES || (kind !== "png" && kind !== "jpeg")) {
      await supabase.storage.from(IMAGE_BUCKET).remove([path]);
      return { error: "A imagem não foi aceita. Use um logo JPG ou PNG de até 2 MB." };
    }
  }
  const { data: prev } = await supabase.from("business_profiles").select("logo_path").maybeSingle();
  const { error } = await supabase.from("business_profiles").upsert({ user_id: user.id, logo_path: path });
  if (error) {
    if (path) await supabase.storage.from(IMAGE_BUCKET).remove([path]);
    return { error: dbErrorMessage(error) };
  }
  if (prev?.logo_path && prev.logo_path !== path) await supabase.storage.from(IMAGE_BUCKET).remove([prev.logo_path as string]);
  revalidatePath("/negocio");
  return { ok: true };
}
