import Link from "next/link";
import { Plus } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { deletePrinter } from "@/features/printers/actions";
import type { PrinterRow } from "@/features/printers/schema";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/utils";

export const metadata = { title: "Impressoras" };

export default async function PrintersPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("printers").select("*").order("name");
  const printers = (data ?? []) as PrinterRow[];

  return (
    <>
      <PageHeader
        title="Impressoras"
        description="Cada impressora tem seu próprio custo por hora."
        action={<Button asChild><Link href="/impressoras/nova"><Plus size={18} />Nova impressora</Link></Button>}
      />
      {printers.length === 0 ? (
        <Card className="text-center text-muted">Nenhuma impressora ainda. Cadastre a primeira para usar a calculadora.</Card>
      ) : (
        <ul className="space-y-3">
          {printers.map((p) => (
            <li key={p.id}>
              <Card className="flex items-center gap-3 p-4">
                <Link href={`/impressoras/${p.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="num text-sm text-muted">
                    {[p.brand, p.model].filter(Boolean).join(" ") || "Sem marca"} · {p.power_watts} W
                    {p.hourly_cost > 0 && ` · ${formatBRL(p.hourly_cost)}/h`}
                  </p>
                </Link>
                <DeleteButton what={p.name} action={deletePrinter.bind(null, p.id)} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
