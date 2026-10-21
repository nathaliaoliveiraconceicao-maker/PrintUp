import { z } from "zod";

const optText = (max: number) => z.string().trim().max(max).nullable();
const origin = z.enum(["arquivo", "manual"]).nullable();

export const profileInputSchema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome ao perfil.").max(120),
    plateIndex: z.number().int().min(1).max(1000).nullable(),
    pieceCount: z.number().int().min(1).max(100000).nullable(),
    slicerPrinterName: optText(120),
    printerModelCode: optText(60),
    nozzleMm: z.number().positive().max(10).nullable(),
    layerHeightMm: z.number().positive().max(10).nullable(),
    filamentType: optText(80),
    materials: z
      .array(
        z.object({
          type: optText(40),
          color: z.string().regex(/^#[0-9a-fA-F]{6,8}$/).nullable(),
          grams: z.number().positive().max(100000).nullable(),
        }),
      )
      .max(16)
      .nullable(),
    weightG: z.number().positive().max(100000).nullable(),
    printMinutes: z.number().positive().max(60 * 24 * 365).nullable(),
    supportUsed: z.boolean().nullable(),
    wasteG: z.number().min(0).max(100000).nullable(),
    weightOrigin: origin,
    timeOrigin: origin,
    editedFields: z.array(z.string().max(30)).max(20),
    fieldOrigins: z.object({ pieces: origin.unwrap().optional(), printer: origin.unwrap().optional(), material: origin.unwrap().optional(), support: origin.unwrap().optional(), waste: origin.unwrap().optional() }),
    rawMeta: z.record(z.string().max(80), z.string().max(200)).nullable(),
  })
  .superRefine((v, ctx) => {
    if ((v.weightG === null) !== (v.weightOrigin === null)) ctx.addIssue({ code: "custom", path: ["weightG"], message: "Peso e origem do peso precisam andar juntos." });
    if ((v.printMinutes === null) !== (v.timeOrigin === null)) ctx.addIssue({ code: "custom", path: ["printMinutes"], message: "Tempo e origem do tempo precisam andar juntos." });
    const present: Record<string, boolean> = { pieces: v.pieceCount !== null, printer: v.slicerPrinterName !== null, material: v.filamentType !== null, support: v.supportUsed !== null, waste: v.wasteG !== null };
    for (const [key, has] of Object.entries(present)) {
      if (has !== (key in v.fieldOrigins && (v.fieldOrigins as Record<string, unknown>)[key] !== undefined)) {
        ctx.addIssue({ code: "custom", path: ["fieldOrigins", key], message: "Cada dado informado precisa ter origem (e dado ausente não tem origem)." });
      }
    }
  });

export const saveImportSchema = z
  .object({
    source: z.enum(["arquivo", "manual"]),
    title: z.string().trim().min(1, "Dê um nome ao modelo.").max(160),
    designer: optText(120),
    slicerLabel: optText(120),
    plateCount: z.number().int().min(1).max(1000).nullable(),
    parseNotes: z.array(z.string().max(300)).max(20),
    fileKind: z.enum(["3mf", "gcode"]).nullable(),
    fileName: optText(200),
    filePath: z.string().max(300).nullable(),
    fileSize: z.number().int().min(0).nullable(),
    thumbPath: z.string().max(300).nullable(),
    profiles: z.array(profileInputSchema).min(1, "Selecione ao menos uma placa.").max(100),
  })
  .refine((v) => (v.filePath === null) === (v.fileKind === null), { message: "Arquivo e tipo precisam andar juntos.", path: ["filePath"] });

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type SaveImportInput = z.infer<typeof saveImportSchema>;

export type SaveImportState = { ok?: true; modelId?: string; profileIds?: string[]; error?: string };

/** Edição de um perfil já salvo: o servidor recalcula as origens (o cliente não decide). */
export const profileEditSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao perfil.").max(120),
  pieceCount: z.number().int().min(1).max(100000).nullable(),
  slicerPrinterName: optText(120),
  filamentType: optText(80),
  weightG: z.number().positive().max(100000).nullable(),
  printMinutes: z.number().positive().max(60 * 24 * 365).nullable(),
  supportUsed: z.boolean().nullable(),
  wasteG: z.number().min(0).max(100000).nullable(),
});
export type ProfileEditInput = z.infer<typeof profileEditSchema>;
