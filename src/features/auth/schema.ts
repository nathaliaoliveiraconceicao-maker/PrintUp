import { z } from "zod";

export const forgotPasswordSchema = z.object({
  email: z.email("Informe um e-mail válido."),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres.").max(72, "A senha pode ter no máximo 72 caracteres."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "As senhas não são iguais.", path: ["confirm"] });

/** Destinos internos permitidos após a confirmação por e-mail (evita redirecionamento aberto). */
const ALLOWED_NEXT = ["/redefinir-senha"] as const;

export function safeNextPath(next: string | null | undefined): string {
  return (ALLOWED_NEXT as readonly string[]).includes(next ?? "") ? (next as string) : "/";
}

/** Link de e-mail que só confirma quando a pessoa CLICA no botão (programas de segurança do e-mail que apenas "abrem" o link não o gastam). */
export const confirmLinkSchema = z.object({
  token_hash: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
  type: z.enum(["signup", "email", "recovery"]),
  next: z.string().optional(),
});
