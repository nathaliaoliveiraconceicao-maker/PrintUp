import Link from "next/link";
import { Plus } from "lucide-react";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { deleteFilament } from "@/features/filaments/actions";
import type { FilamentRow } from "@/features/filaments/schema";
import { createClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/utils";

export const metadata = { title: "Filamentos" };

export default async function FilamentsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("filaments").select("*").order("name");
  const filaments = (data ?? []) as FilamentRow[];

  return (
    <>
      <PageHeader
        title="Filamentos"
        description="O preço por kg alimenta o custo de material."
        action={<Button asChild><Link href="/filamentos/novo"><Plus size={18} />Novo filamento</Link></Button>}
      />
      {filaments.length === 0 ? (
        <Card className="text-center text-muted">Nenhum filamento ainda.</Card>
      ) : (
        <ul className="space-y-3">
          {filaments.map((f) => (
            <li key={f.id}>
              <Card className="flex items-center gap-3 p-4">
                <Link href={`/filamentos/${f.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.name}</p>
                  <p className="num text-sm text-muted">
                    {f.material}{f.color ? ` · ${f.color}` : ""} · {formatBRL(f.price_per_kg)}/kg
                  </p>
                </Link>
                <DeleteButton what={f.name} action={deleteFilament.bind(null, f.id)} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
