"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorMessage, zodToState, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { printerSchema, toPrinterDb } from "./schema";

export async function savePrinter(id: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = printerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);

  const supabase = await createClient();
  const row = toPrinterDb(parsed.data);
  // user_id vem do default auth.uid() no insert; o RLS impede tocar em linhas de outros.
  const { error } = id
    ? await supabase.from("printers").update(row).eq("id", id)
    : await supabase.from("printers").insert(row);
  if (error) return { error: dbErrorMessage(error) };

  revalidatePath("/impressoras");
  redirect("/impressoras");
}

export async function deletePrinter(id: string) {
  const supabase = await createClient();
  await supabase.from("printers").delete().eq("id", id);
  revalidatePath("/impressoras");
}
