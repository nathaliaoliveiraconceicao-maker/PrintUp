"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbErrorMessage, zodToState, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { filamentSchema, toFilamentDb } from "./schema";

export async function saveFilament(id: string | null, _: FormState, formData: FormData): Promise<FormState> {
  const parsed = filamentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return zodToState(parsed.error);

  const supabase = await createClient();
  const row = toFilamentDb(parsed.data);
  const { error } = id
    ? await supabase.from("filaments").update(row).eq("id", id)
    : await supabase.from("filaments").insert(row);
  if (error) return { error: dbErrorMessage(error) };

  revalidatePath("/filamentos");
  redirect("/filamentos");
}

export async function deleteFilament(id: string) {
  const supabase = await createClient();
  await supabase.from("filaments").delete().eq("id", id);
  revalidatePath("/filamentos");
}
