"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { useActionForm } from "@/lib/use-action-form";
import { ImageUploader } from "@/features/products/image-uploader";
import { saveBusiness, setLogo } from "./actions";
import type { BusinessRow } from "./schema";

export function BusinessForm({ business, logoUrl }: { business: Omit<BusinessRow, "user_id">; logoUrl: string | null }) {
  const router = useRouter();
  const { state, onSubmit, pending } = useActionForm(saveBusiness, {} as FormState);
  const e = state.fieldErrors ?? {};
  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <h2 className="font-semibold">Logo</h2>
        <ImageUploader
          testId="logo-negocio"
          folder="logo"
          label="Logo do negócio"
          maxSide={600}
          keepTransparency
          currentUrl={logoUrl}
          onSaved={async (p) => {
            const r = await setLogo(p);
            if (r.ok) router.refresh();
            return r.error;
          }}
          onRemoved={async () => {
            const r = await setLogo(null);
            if (r.ok) router.refresh();
            return r.error;
          }}
        />
      </Card>
      <form onSubmit={onSubmit} className="space-y-6" data-testid="form-negocio">
        <Card className="space-y-4">
          <h2 className="font-semibold">Identidade e contato</h2>
          <Field label="Nome do negócio" error={e.businessName}><Input name="businessName" defaultValue={business.business_name ?? ""} maxLength={120} placeholder="Ex.: Oficina Aurora 3D" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Responsável" error={e.contactName}><Input name="contactName" defaultValue={business.contact_name ?? ""} maxLength={120} /></Field>
            <Field label="WhatsApp / telefone" error={e.phone}><Input name="phone" inputMode="tel" defaultValue={business.phone ?? ""} maxLength={30} /></Field>
            <Field label="E-mail" error={e.email}><Input name="email" type="email" defaultValue={business.email ?? ""} maxLength={160} /></Field>
            <Field label="Cidade / UF" error={e.city}><Input name="city" defaultValue={business.city ?? ""} maxLength={120} /></Field>
          </div>
          <Field label="Cor da marca no PDF" error={e.brandColor}>
            <Input name="brandColor" type="color" defaultValue={business.brand_color} className="w-24 p-1" />
          </Field>
        </Card>
        <Card className="space-y-4">
          <h2 className="font-semibold">Padrões dos orçamentos</h2>
          <Field label="Validade padrão (dias)" error={e.defaultValidityDays}><Input name="defaultValidityDays" inputMode="numeric" defaultValue={String(business.default_validity_days)} /></Field>
          <Field label="Condições de pagamento padrão" error={e.defaultPaymentTerms}><Textarea name="defaultPaymentTerms" defaultValue={business.default_payment_terms ?? ""} maxLength={1000} className="min-h-16" placeholder="Ex.: 50% na aprovação e 50% na entrega. Pix ou cartão." /></Field>
          <Field label="Observações padrão" error={e.defaultNotes}><Textarea name="defaultNotes" defaultValue={business.default_notes ?? ""} maxLength={1000} className="min-h-16" /></Field>
        </Card>
        <FormMessage error={state.error} ok={state.ok} />
        <SubmitButton pending={pending}>Salvar dados do negócio</SubmitButton>
      </form>
    </div>
  );
}
