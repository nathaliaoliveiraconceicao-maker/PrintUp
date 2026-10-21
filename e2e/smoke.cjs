// Teste E2E de fumaça do PrintUp: sobe o Supabase falso + `next start` e percorre os fluxos principais.
// Pré-requisitos: Chromium disponível
//   (PLAYWRIGHT_CHROMIUM_PATH=/caminho/chrome  OU  `npx playwright-core install chromium`).
// Uso: npm run test:e2e
const { spawn, execSync } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("playwright-core");
const fixtures = require("./fixtures.cjs");

const MOCK_PORT = 54399;
const APP_PORT = 3199;
const B = `http://localhost:${APP_PORT}`;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) failures++; };
const children = [];
// O `next build` reescreve o tsconfig.json (inclui a pasta de build do teste); guardamos o original e restauramos ao final.
const TSCONFIG = path.join(__dirname, "..", "tsconfig.json");
const tsconfigBackup = require("node:fs").readFileSync(TSCONFIG, "utf8");

function start(cmd, args, env) {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: "ignore", shell: process.platform === "win32" });
  children.push(c);
  return c;
}
async function waitFor(url, label) {
  for (let i = 0; i < 60; i++) {
    try { await fetch(url); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error(`${label} não respondeu em ${url}`);
}

async function main() {
  // As variáveis NEXT_PUBLIC_* entram no código do NAVEGADOR no momento do build, então o app é construído aqui,
  // com o Supabase falso, numa pasta própria (não mexe no seu `.next`).
  const appEnv = {
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-publica-FALSA-apenas-para-teste-local",
    NEXT_DIST_DIR: ".next-e2e",
  };
  console.log("Construindo o app para o teste (pode levar ~30 s)…");
  execSync("npx next build", { cwd: path.join(__dirname, ".."), env: { ...process.env, ...appEnv }, stdio: "ignore" });
  start("node", [path.join(__dirname, "mock-supabase.cjs")], { MOCK_PORT });
  start("npx", ["next", "start", "-p", String(APP_PORT)], appEnv);
  await waitFor(`http://127.0.0.1:${MOCK_PORT}/auth/v1/user`, "Supabase falso");
  await waitFor(B + "/login", "app");

  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const main$ = async () => (await p.locator("main").innerText()).replace(/\s+/g, " ");
  const fill = (label, v) => p.getByLabel(label, { exact: true }).first().fill(v);

  // ── Acesso ──
  await p.goto(B + "/calculadora");
  ok(p.url().endsWith("/login"), "anônimo é redirecionado ao login");
  await p.fill("input[name=email]", "teste@printup.local");
  await p.fill("input[name=password]", "errada-errada");
  await p.click("button[type=submit]");
  await p.waitForSelector("form [role=alert]");
  ok((await p.textContent("form [role=alert]")).includes("incorretos"), "senha errada mostra mensagem em pt-BR");
  ok((await p.inputValue("input[name=email]")) === "teste@printup.local", "o e-mail digitado é mantido após o erro");
  await p.fill("input[name=password]", "senha-de-teste-123");
  await p.click("button[type=submit]");
  await p.waitForURL(B + "/");
  ok((await main$()).includes("Seus indicadores aparecem aqui"), "dashboard vazio orienta a salvar a primeira precificação");

  // ── Configurações, impressora (com limite do plano) e filamento ──
  await p.goto(B + "/configuracoes");
  const cfg = { monthlyFixedCosts: "480", productiveHoursPerMonth: "160", laborHourlyRate: "30", lossPercent: "5", saleFeePercent: "14", saleFeeFixed: "4", taxPercent: "6", marginPercent: "30", energyPricePerKwh: "0,90" };
  for (const [k, v] of Object.entries(cfg)) await p.fill(`input[name=${k}]`, v);
  await p.click("button[type=submit]");
  await p.waitForSelector("form [role=status]");
  ok(true, "configurações salvas");

  await p.goto(B + "/impressoras/nova");
  await p.fill("input[name=name]", "Bambu A1"); await p.fill("input[name=powerWatts]", "150"); await p.fill("input[name=wearPerHour]", "1,50");
  await p.click("button[type=submit]");
  await p.waitForURL(B + "/impressoras");
  await p.goto(B + "/impressoras/nova");
  await p.fill("input[name=name]", "Segunda");
  await p.click("button[type=submit]");
  await p.waitForSelector("form [role=alert]");
  ok((await p.textContent("form [role=alert]")).toLowerCase().includes("limite do seu plano"), "limite do plano exibe mensagem amigável");
  await p.fill("input[name=powerWatts]", "abc");
  await p.click("button[type=submit]");
  await p.waitForFunction(() => document.body.innerText.includes("Informe um número válido"));
  ok(true, "campo numérico inválido é rejeitado com mensagem");

  await p.goto(B + "/filamentos/novo");
  await p.fill("input[name=name]", "PLA Preto"); await p.fill("input[name=pricePerKg]", "120");
  await p.click("button[type=submit]");
  await p.waitForURL(B + "/filamentos");

  // ── Calculadora: caso conferido à mão (mesmo do teste unitário) ──
  await p.goto(B + "/calculadora");
  await fill("Horas", "2"); await fill("Minutos", "30"); await fill("Peso (g)", "80");
  await fill("Mão de obra (min)", "10"); await fill("Embalagem (R$)", "2");
  const res = async () => (await p.locator("main aside").first().innerText()).replace(/\s+/g, " ");
  let t = await res();
  ok(/R\$\s?65,74/.test(t), "preço sugerido = R$ 65,74");
  ok(/Custo unitário R\$\s?28,87/.test(t), "custo unitário = R$ 28,87");
  ok(/Lucro \/ unid\. R\$\s?19,73/.test(t), "lucro = R$ 19,73");
  await fill("Unidades", "10"); t = await res();
  ok(/Custo do lote \(10\) R\$\s?288,72/.test(t), "lote de 10: custo = R$ 288,72");
  await fill("Unidades", "1");

  const saveBtn = p.getByRole("button", { name: "Salvar precificação" });
  const productSelect = p.locator("select").last();
  ok(await saveBtn.isDisabled(), "salvar fica desabilitado até dar nome ao produto novo");
  await p.getByLabel("Nome do novo produto").fill("Suporte de celular");
  await saveBtn.click();
  await p.waitForSelector("text=Precificação salva.");
  await p.waitForTimeout(800);
  ok((await productSelect.inputValue()) !== "__new__", "produto recém-criado fica selecionado na lista");
  await fill("Peso (g)", "100");
  await saveBtn.click();
  await p.waitForFunction(() => document.body.innerText.includes("Precificação salva."));
  await p.waitForTimeout(600);

  // 2º produto em markup; depois confere a regra de margem impossível
  await fill("Peso (g)", "80");
  await p.getByRole("radio", { name: /Markup/ }).click();
  await p.getByLabel("Markup (%)").fill("100");
  t = await res();
  ok(/R\$\s?57,74/.test(t), "markup 100% => preço = 2 × custo (R$ 57,74)");
  await productSelect.selectOption("__new__");
  await p.getByLabel("Nome do novo produto").fill("Vaso espiral");
  await saveBtn.click();
  await p.waitForSelector("text=Precificação salva.");
  await p.getByRole("radio", { name: /Margem/ }).click();
  await p.getByLabel("Margem de lucro (%)").fill("90");
  ok(/não existe preço que feche/i.test(await res()), "margem + taxas ≥ 100% é bloqueada com mensagem");

  // ── Produtos ──
  await p.goto(B + "/produtos");
  t = await main$();
  ok(t.includes("Suporte de celular") && t.includes("R$ 70,78"), "lista mostra o último preço do produto (R$ 70,78)");
  ok(t.includes("Vaso espiral") && t.includes("R$ 57,74"), "lista mostra o 2º produto (R$ 57,74)");
  ok(/Vaso espiral.*Abaixo da sua margem padrão/.test(t), "aviso de margem abaixo da meta no produto certo");
  await p.getByText("Suporte de celular").click();
  await p.waitForURL(/produtos\/[0-9a-f-]{36}/);
  t = await main$();
  ok(t.includes("2 precificação(ões)") && t.includes("R$ 70,78") && t.includes("R$ 65,74"), "histórico do produto tem as 2 precificações");
  ok(t.includes("Impressora: Bambu A1") && t.includes("Filamento: PLA Preto"), "nomes de impressora e filamento gravados no histórico");
  await p.locator("summary", { hasText: "Composição do custo" }).first().click();
  ok((await main$()).includes("R$ 12,00"), "composição do custo expandida (filamento R$ 12,00)");
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: /Excluir esta precificação/ }).first().click();
  await p.waitForFunction(() => document.body.innerText.includes("1 precificação(ões)"));
  ok(true, "excluir precificação funciona");

  // ── Dashboard e histórico ──
  await p.goto(B + "/");
  t = await main$();
  ok(t.includes("Produtos precificados 2"), "dashboard: 2 produtos precificados");
  ok(t.includes("Preço médio R$ 61,74"), "dashboard: preço médio = média do último preço de cada produto (R$ 61,74)");
  ok(t.includes("1 produto está abaixo"), "dashboard: alerta de produto abaixo da margem");
  await p.goto(B + "/historico");
  t = await main$();
  ok(t.includes("Precificação criada") && t.includes("Precificação excluída"), "histórico registra criação e exclusão");

  // ── Celular ──
  const m = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await m.context().addCookies(await p.context().cookies());
  await m.goto(B + "/produtos");
  await m.getByRole("link", { name: "Mais" }).click();
  await m.waitForURL(/mais/);
  ok((await m.locator("main").innerText()).includes("Filamentos"), "celular: 'Mais' leva a Filamentos, Custos e Histórico");
  ok(!(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "celular: sem rolagem horizontal");

  // ── Exclusão de produto e logout ──
  await p.goto(B + "/produtos");
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: /Excluir Vaso espiral/ }).click();
  await p.waitForFunction(() => !document.body.innerText.includes("Vaso espiral"));
  ok(true, "excluir produto funciona");
  await p.goto(B + "/");
  await p.getByRole("button", { name: "Sair" }).first().click();
  await p.waitForURL(/login/);
  ok(true, "logout leva ao login");
  // ── Recuperação de senha ──
  await p.getByRole("link", { name: "Esqueci minha senha" }).click();
  await p.waitForURL(/recuperar-senha/);
  await p.fill("input[name=email]", "alguem@exemplo.com");
  await p.click("button[type=submit]");
  await p.waitForSelector("form [role=status]");
  ok((await p.textContent("form [role=status]")).includes("Se existir uma conta"), "recuperação: resposta neutra (não revela se o e-mail existe)");
  await p.goto(B + "/auth/callback?code=codigo-de-teste&next=/redefinir-senha");
  await p.waitForURL(/redefinir-senha/);
  ok(true, "link do e-mail abre a tela de nova senha");
  await p.fill("input[name=password]", "nova-senha-123");
  await p.fill("input[name=confirm]", "outra-coisa-123");
  await p.click("button[type=submit]");
  await p.waitForSelector("form [role=alert]");
  ok((await p.textContent("form [role=alert]")).includes("não são iguais"), "senhas diferentes são rejeitadas");
  await p.fill("input[name=confirm]", "nova-senha-123");
  await p.click("button[type=submit]");
  await p.waitForURL(B + "/");
  ok(true, "nova senha salva e usuário segue para o painel");
  await p.getByRole("button", { name: "Sair" }).first().click();
  await p.waitForURL(/login/);
  await p.fill("input[name=email]", "teste@printup.local");
  await p.fill("input[name=password]", "senha-de-teste-123");
  await p.click("button[type=submit]");
  await p.waitForSelector("form [role=alert]");
  ok((await p.textContent("form [role=alert]")).includes("incorretos"), "a senha antiga deixa de funcionar");
  await p.fill("input[name=password]", "nova-senha-123");
  await p.click("button[type=submit]");
  await p.waitForURL(B + "/");
  ok(true, "login com a nova senha funciona");
  await p.getByRole("button", { name: "Sair" }).first().click();
  await p.waitForURL(/login/);
  await p.goto(B + "/auth/callback?code=x&next=https://evil.com");
  ok(p.url().startsWith(B), "callback não redireciona para endereço externo");

  // ── Importador de modelos (arquivos SINTÉTICOS gerados para o teste) ──
  const fx = fixtures.make();
  const F = fx.files;
  await p.fill("input[name=email]", "teste@printup.local");
  await p.fill("input[name=password]", "nova-senha-123");
  await p.click("button[type=submit]");
  await p.waitForURL(B + "/");
  await p.goto(B + "/importar");
  t = await main$();
  ok(t.includes("Arquivo 3MF") && t.includes("Arquivo G-code") && t.includes("Informar manualmente") && t.includes("Link do MakerWorld"), "importar: quatro opções (3MF, G-code, manual e link)");
  ok(t.includes("em breve"), "importar: link do MakerWorld aparece como 'em breve'");
  ok((await p.locator('[aria-disabled="true"]').count()) === 1, "importar: opção do link está desabilitada");

  // arquivos recusados, sempre com mensagem clara e sem enviar nada
  const rejectCase = async (file, expected, label) => {
    await p.setInputFiles('[data-testid="input-3mf"]', file);
    await p.waitForSelector('[role=alert]:has-text("Não foi possível importar")');
    const msg = (await p.locator('[role=alert]:has-text("Não foi possível importar")').innerText()).replace(/\s+/g, " ");
    ok(expected.test(msg), label);
  };
  await rejectCase(F["modelo.stl"], /STL.*fatiamento/, "recusa STL e orienta a fatiar");
  await rejectCase(F["falso.3mf"], /não é um 3MF válido/, "recusa arquivo .3mf que não é ZIP");
  await rejectCase(F["enorme.3mf"], /mais de 50 MB/, "recusa arquivo acima de 50 MB");
  await rejectCase(F["bomba.3mf"], /recusado por segurança/, "recusa ZIP bomb (descompressão acima do limite)");

  // 3MF (Bambu, sintético): ficha, origem, impressora diferente, correção manual e calculadora
  await p.setInputFiles('[data-testid="input-3mf"]', F["suporte.gcode.3mf"]);
  await p.waitForSelector('[data-testid="origem"]');
  const origem = (await p.locator('[data-testid="origem"]').innerText()).replace(/\s+/g, " ");
  ok(origem.includes("Bambu Studio 01.08.00.62") && origem.includes("3MF") && origem.includes("autor: Maria") && origem.includes("2 placa"), "ficha: origem dos dados (programa, formato, autor, placas)");
  ok((await p.locator('input[value="Suporte de Celular"]').count()) === 1, "ficha: nome do modelo vindo do arquivo");
  ok((await p.locator('img[alt="Prévia do modelo"]').count()) === 1, "ficha: miniatura do arquivo exibida");
  ok((await p.locator('input[value="Bambu Lab A1 mini"]').count()) === 2, "ficha: impressora do arquivo nas duas placas");
  ok((await p.locator('input[value="25,5"]').count()) === 1 && (await p.locator('input[value="150"]').count() + (await p.locator('input[value="2"]').count())) >= 1, "ficha: peso 25,5 g e tempo 2h30 lidos da placa 1");
  ok((await p.locator("text=do arquivo").count()) >= 4, "ficha: dados lidos marcados como 'do arquivo'");
  const alertText = (await p.locator('[role=alert]:has-text("estimado para")').first().innerText()).replace(/\s+/g, " ");
  ok(alertText.includes("Bambu Lab A1 mini") && alertText.includes("Bambu A1"), "ficha: avisa que o tempo foi estimado para OUTRA impressora (A1 mini × A1)");
  await p.locator('input[value="25,5"]').fill("30");
  ok((await p.locator("text=editado").count()) >= 1, "ficha: peso corrigido passa a 'editado'");
  await p.getByRole("button", { name: "Calcular preço" }).first().click();
  await p.waitForURL(/calculadora\?perfil=/);
  await p.waitForSelector('[data-testid="perfil-banner"]');
  const banner = (await p.locator('[data-testid="perfil-banner"]').innerText()).replace(/\s+/g, " ");
  ok(banner.includes("Corpo") && banner.includes("Suporte de Celular") && banner.includes("PLA"), "calculadora: recebe o perfil sem novo preenchimento");
  ok((await p.getByLabel("Peso (g)").first().inputValue()) === "30", "calculadora: peso corrigido (30 g) transferido");
  ok((await p.getByLabel("Horas").first().inputValue()) === "2" && (await p.getByLabel("Minutos").first().inputValue()) === "30", "calculadora: tempo 2h30 transferido");
  ok((await p.locator('[data-testid="perfil-banner"] [role=alert]').count()) === 1, "calculadora: alerta de impressora diferente");
  const pageText = (await main$());
  ok(pageText.includes("editado") && pageText.includes("do arquivo"), "calculadora: peso 'editado' e tempo 'do arquivo'");
  ok(/R\$\s?\d+,\d\d/.test(await res()), "calculadora: preço calculado automaticamente");
  ok((await p.locator('input[placeholder="Ex.: Suporte de celular"]').inputValue()) === "Suporte de Celular", "calculadora: nome do produto sugerido pelo modelo");
  await p.getByRole("button", { name: "Salvar precificação" }).click();
  await p.waitForSelector("text=Precificação salva.");
  await p.getByRole("link", { name: "Ver produto" }).click();
  await p.waitForURL(/produtos\/[0-9a-f-]{36}/);
  t = await main$();
  ok(t.includes("Modelo de origem") && t.includes("Suporte de Celular") && (await p.locator('img[alt="Foto do produto"]').count()) === 1, "catálogo: produto com foto e modelo de origem");
  const orig = (await p.locator('[data-testid="origem-preco"]').innerText()).replace(/\s+/g, " ");
  ok(orig.includes("peso editado (difere do arquivo)") && orig.includes("tempo do arquivo") && orig.includes("estimado para"), "histórico do preço: registra origem (peso editado, tempo do arquivo, impressora diferente)");

  // G-code (Prusa, sintético), guardando o arquivo original
  await p.goto(B + "/importar");
  await p.setInputFiles('[data-testid="input-gcode"]', F["peca-prusa.gcode"]);
  await p.waitForSelector('[data-testid="origem"]');
  ok((await p.locator('[data-testid="origem"]').innerText()).includes("PrusaSlicer 2.6.0"), "G-code: reconhece o PrusaSlicer");
  ok((await p.locator('input[value="25,4"]').count()) === 1 && (await p.locator('input[value="MK3S"]').count()) === 1 && (await p.locator('input[value="PLA"]').count()) === 1, "G-code: peso, impressora e material lidos");
  ok((await p.locator('input[value="30,25"]').count()) === 1, "G-code: tempo 2h 30m 15s lido (30,25 min)");
  await p.getByLabel("Guardar o arquivo original na minha conta").check();
  await p.getByRole("button", { name: "Salvar modelo sem calcular" }).click();
  await p.waitForURL(/importar\/[0-9a-f-]{36}/);
  t = await main$();
  ok(t.includes("Arquivo guardado: peca-prusa.gcode") && t.includes("Baixar"), "G-code: arquivo original guardado e com link de download (opcional)");
  ok(t.includes("Origem dos dados: arquivo G-code"), "modelo: mostra a origem dos dados");
  // editar perfil salvo: origem recalculada
  const peso = p.locator('[data-testid="perfil"] input').nth(3);
  await p.locator('[data-testid="perfil"]').getByLabel("Peso (g)").fill("27");
  await p.getByRole("button", { name: "Salvar alterações" }).click();
  await p.waitForSelector("text=Perfil salvo.");
  await p.reload();
  ok((await p.locator('[data-testid="perfil"] >> text=editado').count()) >= 1, "perfil salvo: peso corrigido aparece como 'editado' após recarregar");
  void peso;

  // Cura (sintético): não inventa o peso
  await p.goto(B + "/importar");
  await p.setInputFiles('[data-testid="input-gcode"]', F["peca-cura.gcode"]);
  await p.waitForSelector('[data-testid="origem"]');
  ok((await p.locator("body").innerText()).includes("apenas o comprimento do filamento"), "Cura: avisa que só há comprimento de filamento, sem peso");
  ok((await p.getByLabel("Peso (g)").first().inputValue()) === "", "Cura: peso fica em branco (não é estimado)");
  // 3MF só com geometria
  await p.goto(B + "/importar");
  await p.setInputFiles('[data-testid="input-3mf"]', F["cubo.3mf"]);
  await p.waitForSelector('[data-testid="origem"]');
  ok((await p.locator("body").innerText()).includes("não contém dados de fatiamento"), "3MF só com geometria: informa que é preciso fatiar");
  ok((await p.getByLabel("Peso (g)").first().inputValue()) === "", "3MF só com geometria: sem peso nem tempo inventados");

  // Entrada manual
  await p.goto(B + "/importar/novo");
  await p.getByPlaceholder("Ex.: Suporte de celular").fill("Chaveiro");
  await p.getByLabel("Peso (g)").fill("12,5");
  await p.getByLabel("Tempo (horas)").fill("1");
  await p.getByRole("button", { name: "Calcular preço" }).click();
  await p.waitForURL(/calculadora\?perfil=/);
  await p.waitForSelector('[data-testid="perfil-banner"]');
  ok((await p.locator("body").innerText()).includes("informado por você"), "manual: dados digitados ficam como 'informado por você'");

  // Lista de modelos e exclusão (remove também os arquivos)
  await p.goto(B + "/importar");
  t = await main$();
  ok(t.includes("Suporte de Celular") && t.includes("peca-prusa") && t.includes("Chaveiro"), "lista: modelos importados aparecem");
  await p.getByText("Chaveiro").first().click();
  await p.waitForURL(/importar\/[0-9a-f-]{36}/);
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: /Excluir Chaveiro/ }).click();
  await p.waitForURL(B + "/importar");
  ok(!(await main$()).includes("Chaveiro"), "excluir modelo funciona");
  // ── Exemplos SINTÉTICOS da própria tela (fluxo completo sem nenhum arquivo seu) ──
  await p.goto(B + "/importar");
  await p.locator('[data-testid="exemplos"] summary').click();
  ok((await p.locator('[data-testid="exemplos"]').innerText()).includes("Não são exportações reais"), "exemplos: a tela declara que são sintéticos e NÃO reais");
  ok((await p.locator('[data-testid^="exemplo-exemplo-sintetico"]').count()) === 9, "exemplos: nove arquivos (completos, incompletos e inválidos)");
  await p.locator('[data-testid="exemplo-exemplo-sintetico-3mf-completo.3mf"]').click();
  await p.waitForSelector('[data-testid="origem"]');
  ok((await p.locator('[data-testid="aviso-sintetico"]').count()) === 1, "exemplo 3MF: aviso fixo de arquivo SINTÉTICO na ficha");
  ok((await p.locator('input[value="[EXEMPLO SINTÉTICO] Suporte de celular"]').count()) === 1, "exemplo 3MF: nome marcado como exemplo sintético");
  ok((await p.locator('img[alt="Prévia do modelo"]').evaluate((i) => i.complete && i.naturalWidth === 96)), "exemplo 3MF: miniatura PNG real (96x96) exibida");
  await p.locator('[data-testid="relatorio"] summary').click();
  const rel = await p.locator('[data-testid="relatorio"] pre').innerText();
  ok(rel.includes("Arquivo sintético de exemplo: SIM") && rel.includes("Metadata/slice_info.config") && rel.includes("Placa 1"), "exemplo 3MF: relatório técnico com estrutura e dados lidos");
  await p.getByRole("button", { name: "Copiar relatório de leitura" }).click();
  await p.waitForSelector('[data-testid="relatorio"] [role=status]');
  ok(true, "exemplo 3MF: botão de copiar o relatório responde (copiado ou instrução manual)");
  await p.getByRole("button", { name: "Calcular preço" }).first().click();
  await p.waitForURL(/calculadora\?perfil=/);
  await p.waitForSelector('[data-testid="perfil-banner"]');
  ok((await p.locator('[data-testid="perfil-banner"]').innerText()).includes("[EXEMPLO SINTÉTICO] Suporte de celular"), "exemplo 3MF → calculadora: dados chegam sem novo preenchimento");
  ok((await p.getByLabel("Peso (g)").first().inputValue()) === "25,5" && (await p.getByLabel("Horas").first().inputValue()) === "2", "exemplo 3MF → calculadora: peso 25,5 g e 2 h");
  await p.getByRole("button", { name: "Salvar precificação" }).click();
  await p.waitForSelector("text=Precificação salva.");
  await p.getByRole("link", { name: "Ver produto" }).click();
  await p.waitForURL(/produtos\/[0-9a-f-]{36}/);
  ok((await p.locator("main").innerText()).includes("[EXEMPLO SINTÉTICO] Suporte de celular"), "exemplo 3MF → produto: salvo no catálogo com a marcação de exemplo");
  await p.locator('[data-testid="produto-modelo"] a').click();
  await p.waitForURL(/importar\/[0-9a-f-]{36}/);
  ok((await p.locator('[data-testid="aviso-sintetico"]').count()) === 1, "modelo salvo continua avisando que veio de arquivo sintético");

  // incompleto: o que falta fica em branco e o fluxo segue
  await p.goto(B + "/importar");
  await p.locator('[data-testid="exemplos"] summary').click();
  await p.locator('[data-testid="exemplo-exemplo-sintetico-gcode-so-tempo.gcode"]').click();
  await p.waitForSelector('[data-testid="origem"]');
  ok((await p.getByLabel("Peso (g)").first().inputValue()) === "" && (await p.locator("body").innerText()).includes("Peso do filamento: não encontrado"), "exemplo incompleto: peso em branco e avisado");
  await p.getByRole("button", { name: "Calcular preço" }).first().click();
  await p.waitForURL(/calculadora\?perfil=/);
  ok((await p.getByLabel("Peso (g)").first().inputValue()) === "" && (await p.getByLabel("Minutos").first().inputValue()) === "45,17", "exemplo incompleto → calculadora: só o tempo foi transferido");

  // inválidos: recusados com mensagem
  await p.goto(B + "/importar");
  await p.locator('[data-testid="exemplos"] summary').click();
  await p.locator('[data-testid="exemplo-exemplo-sintetico-invalido-stl.stl"]').click();
  await p.waitForSelector('[role=alert]:has-text("Não foi possível importar")');
  ok((await p.locator('[role=alert]:has-text("Não foi possível importar")').innerText()).includes("STL"), "exemplo inválido (STL): recusado com orientação");
  await p.locator('[data-testid="exemplo-exemplo-sintetico-invalido-nao-e-3mf.3mf"]').click();
  await p.waitForFunction(() => document.body.innerText.includes("não é um 3MF válido"));
  ok(true, "exemplo inválido (texto .3mf): recusado");

  require("node:fs").rmSync(fx.dir, { recursive: true, force: true });

  ok(errors.length === 0, "sem erros no console/página" + (errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""));
  await browser.close();
}

main()
  .catch((e) => { console.error("FALHA:", e.message.split("\n")[0]); failures++; })
  .finally(() => {
    children.forEach((c) => c.kill());
    require("node:fs").writeFileSync(TSCONFIG, tsconfigBackup);
    require("node:fs").rmSync(path.join(__dirname, "..", ".next-e2e"), { recursive: true, force: true });
    console.log(failures ? `\n${failures} verificação(ões) falharam` : "\nE2E OK");
    process.exit(failures ? 1 : 0);
  });
