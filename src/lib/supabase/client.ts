import { createBrowserClient } from "@supabase/ssr";

// As variáveis NEXT_PUBLIC_* precisam ser referenciadas literalmente para entrarem no bundle do navegador.
export const createClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
