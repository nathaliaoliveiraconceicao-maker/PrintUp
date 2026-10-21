import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "./paths";

/** Links temporários (1 h) para arquivos privados. Falha de rede ou arquivo ausente => sem link (a tela segue sem imagem). */
export async function signedUrls(supabase: SupabaseClient, paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(unique, 3600);
    for (const item of data ?? []) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  } catch {
    // sem links: a interface mostra o espaço reservado
  }
  return out;
}
