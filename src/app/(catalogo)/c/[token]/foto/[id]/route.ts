import { TOKEN_RE, UUID_RE } from "@/features/catalog-share/schema";
import { IMAGE_BUCKET } from "@/features/products/image-paths";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Entrega a foto de um produto da vitrine pública. O bucket continua privado: só sai a foto que o banco confirma para ESTE token. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!TOKEN_RE.test(token) || !UUID_RE.test(id)) return new Response(null, { status: 404 });
  const supabase = await createClient();
  const { data: path } = await supabase.rpc("public_catalog_photo", { p_token: token, p_product_id: id });
  if (typeof path !== "string" || !/\.(jpg|png)$/.test(path)) return new Response(null, { status: 404 });
  try {
    const { data, error } = await createAdminClient().storage.from(IMAGE_BUCKET).download(path);
    if (error || !data) return new Response(null, { status: 404 });
    return new Response(data, {
      headers: { "Content-Type": path.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
