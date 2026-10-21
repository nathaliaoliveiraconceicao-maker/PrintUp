// Teste E2E de fumaça do PrintUp: sobe o Supabase falso + `next start` e percorre os fluxos principais.
// Pré-requisitos: `npm run build` já executado; Chromium disponível
//   (PLAYWRIGHT_CHROMIUM_PATH=/caminho/chrome  OU  `npx playwright-core install chromium`).
// Uso: npm run test:e2e
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright-core");

const MOCK_PORT = 54399;
const APP_PORT = 3199;
const B = `http://localhost:${APP_PORT}`;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) failures++; };
const children = [];

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
  if (!existsSync(path.join(__dirname, "..", ".next"))) throw new Error("Rode `npm run build` antes do E2E.");
  start("node", [path.join(__dirname, "mock-supabase.cjs")], { MOCK_PORT });
  start("npx", ["next", "start", "-p", String(APP_PORT)], {
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-publica-FALSA-apenas-para-teste-local",
  });
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
  ok(errors.length === 0, "sem erros no console/página" + (errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""));
  await browser.close();
}

main()
  .catch((e) => { console.error("FALHA:", e.message.split("\n")[0]); failures++; })
  .finally(() => {
    children.forEach((c) => c.kill());
    console.log(failures ? `\n${failures} verificação(ões) falharam` : "\nE2E OK");
    process.exit(failures ? 1 : 0);
  });
