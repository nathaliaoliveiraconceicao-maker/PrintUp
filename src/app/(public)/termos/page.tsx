import Link from "next/link";
import { LEGAL, LegalPage } from "@/features/legal/legal-page";

export const metadata = { title: "Termos de uso" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso">
      <p>
        Estes termos regulam o uso do PrintUp, um serviço online de precificação e gestão para quem trabalha com impressão 3D. O serviço é oferecido por <strong>{LEGAL.controller}</strong> (pessoa física), de {LEGAL.forum}.
        Ao criar uma conta, você declara que leu e concorda com estes termos e com a <Link href="/privacidade" className="font-medium text-accent-strong underline">Política de privacidade</Link>.
      </p>

      <h2>1. Quem pode usar</h2>
      <p>Pessoas com 18 anos ou mais, ou menores representados por responsável legal. Você é responsável por manter sua senha em segurança e pelas atividades feitas na sua conta.</p>

      <h2>2. O que o PrintUp faz</h2>
      <p>Calcula custos e preços sugeridos, guarda seus produtos, orçamentos, pedidos, produção e estoque, e gera orçamentos em PDF. Os recursos disponíveis e os limites dependem do seu plano.</p>

      <h2>3. Os resultados são uma sugestão</h2>
      <p>
        Os cálculos usam os valores que <strong>você</strong> informa (filamento, impressora, despesas, taxas, margem). O PrintUp não garante que o preço sugerido cubra todos os seus custos, nem que gere lucro, nem que esteja de acordo com as regras de qualquer marketplace.
        As taxas de Shopee, Mercado Livre e outros canais variam e são informadas por você. A decisão final de preço e de venda é sempre sua.
      </p>

      <h2>4. Planos, pagamento e cancelamento</h2>
      <ul>
        <li>Existe um plano Gratuito e planos pagos, com preços e limites mostrados na página de planos.</li>
        <li>O pagamento é feito na página segura do Mercado Pago. O PrintUp não guarda os dados do seu cartão.</li>
        <li>Seu plano só muda depois que o pagamento é confirmado pelo serviço de pagamento.</li>
        <li>Você pode cancelar quando quiser. O cancelamento vale no fim do período já pago, e depois disso a conta volta ao plano Gratuito.</li>
        <li>Mudar o preço de um plano não altera assinaturas em andamento sem aviso prévio.</li>
        <li>Direito de arrependimento: em contratações feitas pela internet, você pode desistir em até 7 dias da contratação, conforme o Código de Defesa do Consumidor. Fale com o suporte.</li>
        <li>A emissão de nota fiscal ainda não está integrada ao PrintUp. Fale com o suporte se precisar de comprovante.</li>
      </ul>

      <h2>5. Seus dados e conteúdos</h2>
      <p>Os produtos, orçamentos, imagens, arquivos e demais conteúdos que você cadastra continuam sendo seus. Você nos autoriza apenas a armazená-los e processá-los para prestar o serviço. Você é responsável por ter o direito de usar o que envia (por exemplo, modelos 3D e imagens de terceiros).</p>
      <p>Se você voltar ao plano Gratuito ou cancelar, seus dados não são apagados por isso. Você pode pedir a exclusão da conta a qualquer momento (veja a Política de privacidade).</p>

      <h2>6. Uso proibido</h2>
      <ul>
        <li>Tentar acessar dados de outros usuários ou burlar limites e a segurança do serviço.</li>
        <li>Enviar arquivos com código malicioso ou conteúdo ilegal.</li>
        <li>Usar o serviço para fraudar clientes ou violar direitos de terceiros.</li>
      </ul>
      <p>Contas que violem estes termos podem ser suspensas.</p>

      <h2>7. Disponibilidade e responsabilidade</h2>
      <p>
        Trabalhamos para manter o serviço no ar e seguro, mas ele é oferecido “como está”, podendo sofrer interrupções para manutenção ou por falhas de provedores terceiros. Faça cópias dos dados que forem críticos para você.
        Na máxima extensão permitida pela lei, a responsabilidade do PrintUp fica limitada ao valor que você pagou pelo plano nos 12 meses anteriores ao fato, e não inclui lucros cessantes ou perdas de vendas decorrentes do uso dos preços sugeridos. Isso não afasta direitos que a lei garante ao consumidor.
      </p>

      <h2>8. Mudanças nestes termos</h2>
      <p>Podemos atualizar estes termos. Mudanças relevantes serão avisadas por e-mail ou dentro do app. Continuar usando o serviço depois do aviso significa que você aceita a nova versão.</p>

      <h2>9. Contato e foro</h2>
      <p>
        Dúvidas, pedidos e reclamações: <a className="font-medium text-accent-strong underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
        Fica eleito o foro de {LEGAL.forum}, sem prejuízo do foro do domicílio do consumidor quando a lei assim determinar.
      </p>
    </LegalPage>
  );
}
