import type { SupabaseClient } from "@supabase/supabase-js";
import { IMAGE_BUCKET } from "./image-paths";

/** Links temporários (1 h) para fotos e logos privados. Sem link => a tela mostra o espaço reservado. */
export async function imageUrls(supabase: SupabaseClient, paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  try {
    const { data } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(unique, 3600);
    for (const item of data ?? []) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  } catch {
    // segue sem imagens
  }
  return out;
}
