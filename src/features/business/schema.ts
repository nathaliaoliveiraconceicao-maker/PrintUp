import { z } from "zod";
import { decimal, optionalText } from "@/lib/forms";

export const businessSchema = z.object({
  businessName: optionalText(120),
  contactName: optionalText(120),
  phone: optionalText(30),
  email: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(160).email("E-mail inválido.").optional()),
  city: optionalText(120),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
  defaultValidityDays: decimal({ min: 1, max: 365, empty: 7 }),
  defaultPaymentTerms: optionalText(1000),
  defaultNotes: optionalText(1000),
});

export interface BusinessRow {
  user_id: string;
  business_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  logo_path: string | null;
  brand_color: string;
  default_payment_terms: string | null;
  default_validity_days: number;
  default_notes: string | null;
}

export const DEFAULT_BUSINESS: Omit<BusinessRow, "user_id"> = {
  business_name: null, contact_name: null, phone: null, email: null, city: null, logo_path: null,
  brand_color: "#d94e1b", default_payment_terms: null, default_validity_days: 7, default_notes: null,
};
