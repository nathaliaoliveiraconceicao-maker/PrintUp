import { z } from "zod";
import { checkbox, optionalText } from "@/lib/forms";

export const catalogShareSchema = z.object({
  title: optionalText(80),
  enabled: checkbox,
  showPrices: checkbox,
  showOutOfStock: checkbox,
});

export type CatalogShareRow = { token: string; enabled: boolean; title: string | null; show_prices: boolean; show_out_of_stock: boolean };

export const TOKEN_RE = /^[0-9a-f]{32}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
