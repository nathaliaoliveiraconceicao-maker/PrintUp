import Link from "next/link";
import { LEGAL, LegalPage } from "@/features/legal/legal-page";

export const metadata = { title: "Política de privacidade" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade">
      <p>
        Esta política explica quais dados pessoais o PrintUp usa, para quê e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).
        A responsável pelos dados (controladora) é <strong>{LEGAL.controller}</strong>, de {LEGAL.forum}. Contato: <a className="font-medium text-accent-strong underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

      <h2>1. Dados que coletamos</h2>
      <ul>
        <li><strong>Cadastro:</strong> nome, e-mail e senha (a senha é guardada de forma protegida, nunca em texto aberto).</li>
        <li><strong>O que você cadastra:</strong> impressoras, filamentos, configurações de custo, produtos, orçamentos, pedidos, produção e estoque; dados de clientes que você informar nos orçamentos (nome, contato); imagens e arquivos de modelos 3D que você enviar.</li>
        <li><strong>Assinatura e pagamento:</strong> plano, status e histórico de cobranças. Os dados do cartão são tratados apenas pelo Mercado Pago; o PrintUp não os recebe nem os guarda.</li>
        <li><strong>Registros técnicos:</strong> eventos de funcionamento e erros, com identificadores e códigos, sem conteúdo dos seus dados e sem segredos.</li>
      </ul>

      <h2>2. Para que usamos (e a base legal)</h2>
      <ul>
        <li>Criar e manter sua conta e prestar o serviço contratado (execução de contrato).</li>
        <li>Processar assinaturas e pagamentos e cumprir obrigações legais e fiscais (execução de contrato e obrigação legal).</li>
        <li>Garantir a segurança, prevenir fraudes e corrigir falhas (legítimo interesse).</li>
        <li>Enviar e-mails do serviço, como confirmação de conta e recuperação de senha (execução de contrato).</li>
      </ul>
      <p>Não vendemos seus dados e não os usamos para publicidade de terceiros.</p>

      <h2>3. Com quem compartilhamos</h2>
      <p>Apenas com provedores necessários para o serviço funcionar, que tratam os dados em nosso nome:</p>
      <ul>
        <li><strong>Supabase:</strong> banco de dados, login e armazenamento de arquivos.</li>
        <li><strong>Vercel:</strong> hospedagem do aplicativo.</li>
        <li><strong>Mercado Pago:</strong> pagamentos e assinaturas.</li>
      </ul>
      <p>Esses provedores podem operar servidores fora do Brasil. Nesses casos, a transferência internacional ocorre para a prestação do serviço, com as garantias previstas na LGPD. Também podemos compartilhar dados quando a lei ou uma ordem judicial exigir.</p>

      <h2>4. Segurança</h2>
      <p>Cada conta só enxerga os próprios dados (controle de acesso no banco de dados), arquivos e PDFs ficam em áreas privadas, e as comunicações usam HTTPS. Nenhum sistema é totalmente imune a falhas; em caso de incidente que possa afetar você, avisaremos conforme a lei.</p>

      <h2>5. Cookies</h2>
      <p>Usamos apenas cookies essenciais para manter você conectado. Não usamos cookies de publicidade.</p>

      <h2>6. Por quanto tempo guardamos</h2>
      <p>Enquanto sua conta existir. Ao excluir a conta, apagamos seus dados em prazo razoável, exceto o que precisarmos manter por obrigação legal (por exemplo, registros de cobrança) ou para a defesa em processos.</p>

      <h2>7. Seus direitos</h2>
      <p>Você pode pedir: confirmação de que tratamos seus dados, acesso, correção, anonimização, portabilidade, informação sobre compartilhamento, exclusão dos dados e revogação de consentimento. Escreva para <a className="font-medium text-accent-strong underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>; respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>

      <h2>8. Dados dos seus clientes</h2>
      <p>Se você inclui dados de clientes seus nos orçamentos, você é a responsável por ter o direito de usá-los. O PrintUp apenas os armazena para você, e o PDF enviado ao cliente nunca mostra custo, margem ou lucro.</p>

      <h2>9. Crianças e adolescentes</h2>
      <p>O serviço é destinado a maiores de 18 anos. Menores só podem usá-lo com um responsável legal.</p>

      <h2>10. Mudanças nesta política</h2>
      <p>Podemos atualizar esta política e avisaremos sobre mudanças relevantes. Veja também os <Link href="/termos" className="font-medium text-accent-strong underline">Termos de uso</Link>.</p>
    </LegalPage>
  );
}
