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
  // detached: o filho vira líder de um grupo de processos, para encerrar também o `next-server` que o npx cria.
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: "ignore", shell: process.platform === "win32", detached: process.platform !== "win32" });
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
    // Cobrança: só o SIMULADOR (nunca um gateway real) e chaves FALSAS de teste.
    SUPABASE_SERVICE_ROLE_KEY: "chave-servidor-FALSA-apenas-para-teste-local",
    BILLING_GATEWAY: "simulado",
    BILLING_WEBHOOK_SECRET: "segredo-de-teste-local-0123456789",
  };
  // E2E_REUSE_BUILD=1 reaproveita o build anterior (guardado quando E2E_KEEP_BUILD=1): só para iterar rápido no desenvolvimento.
  if (process.env.E2E_REUSE_BUILD === "1" && require("node:fs").existsSync(path.join(__dirname, "..", ".next-e2e"))) {
    console.log("Reaproveitando o build anterior (E2E_REUSE_BUILD=1).");
  } else {
    console.log("Construindo o app para o teste (pode levar ~30 s)…");
    execSync("npx next build", { cwd: path.join(__dirname, ".."), env: { ...process.env, ...appEnv }, stdio: "ignore" });
  }
  start("node", [path.join(__dirname, "mock-supabase.cjs")], { MOCK_PORT });
  start("npx", ["next", "start", "-p", String(APP_PORT)], appEnv);
  await waitFor(`http://127.0.0.1:${MOCK_PORT}/auth/v1/user`, "Supabase falso");
  await waitFor(B + "/login", "app");

  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
  const p = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  globalThis.__debug = { p, errors };
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const main$ = async () => (await p.locator("main").innerText()).replace(/\s+/g, " ");
  const fill = (label, v) => p.getByLabel(label, { exact: true }).first().fill(v);

  // ── Link de confirmação de e-mail: abrir a página não gasta o link; só o clique no botão confirma ──
  await p.goto(B + "/auth/confirm?token_hash=tokenvalido123456&type=signup");
  ok((await p.locator('[data-testid="confirmar-email"]').count()) === 1 && p.url().includes("/auth/confirm"), "link de confirmação: abrir a página só mostra o botão (não confirma sozinho)");
  await p.goto(B + "/auth/confirm?token_hash=tokenvalido123456&type=signup");
  await p.getByRole("button", { name: "Confirmar e entrar" }).click();
  await p.waitForURL((u) => !u.pathname.startsWith("/auth/confirm"));
  ok(!p.url().includes("/login"), "link de confirmação válido: o clique no botão entra na conta");
  await p.context().clearCookies();
  await p.goto(B + "/auth/confirm?token_hash=tokeninvalido99999&type=signup");
  await p.getByRole("button", { name: "Confirmar e entrar" }).click();
  await p.waitForURL(/login\?erro=link/);
  ok((await p.locator("body").innerText()).includes("inválido ou expirou"), "link inválido/expirado: mensagem clara no login");
  await p.goto(B + "/auth/confirm?token_hash=curto&type=signup");
  ok((await p.locator('[data-testid="confirmar-invalido"]').count()) === 1, "link malformado: página de link inválido");
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
  // ── Primeiro acesso: assistente de configuração (pode ser pulado) ──
  await p.waitForURL(B + "/boas-vindas");
  ok((await p.locator('[data-testid="onboarding"]').count()) === 1, "primeiro acesso leva ao assistente de configuração");
  await p.getByRole("button", { name: "Configurar tudo depois" }).click();
  await p.waitForURL(B + "/");
  let t = await main$();
  ok(t.includes("Nada precificado ainda") && t.includes("Nenhum orçamento ainda") && t.includes("Produtos cadastrados 0"), "pular o assistente: painel vazio com orientações (sem números inventados)");
  ok(t.includes("não registra vendas ou pagamentos") && t.includes("Lucro estimado dos aprovados —"), "painel deixa claro que valores são orçados e que lucro ainda é desconhecido");
  for (const a of ["Nova precificação", "Importar modelo", "Cadastrar produto", "Criar orçamento", "Cadastrar impressora", "Cadastrar filamento"]) {
    if (!(await p.locator('section[aria-labelledby="h-atalhos"]').getByRole("link", { name: new RegExp(a) }).count())) ok(false, `atalho ausente: ${a}`);
  }
  ok(true, "painel tem os 6 atalhos");
  await p.goto(B + "/");
  ok(p.url() === B + "/", "depois de pular, o assistente não volta sozinho");
  ok((await Promise.all(["Pedidos", "Produção", "Estoque"].map((l) => p.locator("aside").getByRole("link", { name: l }).count()))).every((c) => c === 1) && (await p.locator("aside").getByText("em breve").count()) === 0, "menu: Pedidos, Produção e Estoque agora são links reais (nada marcado como 'em breve')");

  // Refazer o assistente (a pedido), validando e salvando cada passo
  await fetch(`http://127.0.0.1:${MOCK_PORT}/__reset_onboarding`);
  await p.goto(B + "/");
  await p.waitForURL(B + "/boas-vindas");
  await p.getByRole("button", { name: "Continuar" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Informe o nome do seu negócio"));
  ok(true, "assistente: nome vazio é recusado com mensagem");
  await p.getByLabel("Nome do negócio").fill("Oficina Aurora 3D");
  await p.getByRole("button", { name: "Continuar" }).click();
  await p.getByLabel("Marca da impressora").fill("Bambu Lab");
  await p.getByLabel("Nome ou modelo da impressora").fill("A1");
  await p.getByRole("button", { name: "Continuar" }).click();
  await p.getByRole("radio", { name: /Calcular pelo preço e vida útil/ }).click();
  await p.getByRole("button", { name: "Continuar" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Informe o preço de compra da impressora"));
  ok(true, "assistente: custo da hora calculado exige preço e vida útil");
  await p.getByLabel("Preço da impressora (R$)").fill("1500");
  await p.getByLabel("Vida útil da impressora (horas)").fill("1000");
  await p.getByLabel("Potência da impressora (W)").fill("150");
  ok((await p.locator('[data-testid="desgaste-por-hora"]').innerText()).includes("1,50"), "assistente: mostra o desgaste da impressora por hora (1500 ÷ 1000 = R$ 1,50)");
  await p.getByRole("button", { name: "Continuar" }).click();
  await p.getByLabel("Cor (opcional)").fill("Preto");
  await p.getByRole("button", { name: "Continuar" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Informe o preço por kg"));
  await p.getByLabel("Preço por kg (R$)").fill("120");
  await p.getByRole("button", { name: "Continuar" }).click();
  await p.getByLabel("Margem de lucro padrão (%)").fill("100");
  await p.getByRole("button", { name: "Salvar e concluir" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Valor alto demais"));
  ok(true, "assistente: margem impossível (100%) é recusada");
  await p.getByLabel("Margem de lucro padrão (%)").fill("30");
  await p.getByRole("button", { name: "Salvar e concluir" }).click();
  await p.waitForSelector("text=Tudo pronto");
  ok((await p.getByText("Configurado", { exact: true }).count()) === 5, "assistente: os 5 passos aparecem como configurados");
  await p.getByRole("button", { name: "Ir para o painel" }).click();
  await p.waitForURL(B + "/");
  await p.goto(B + "/boas-vindas?refazer=1");
  ok((await p.getByLabel("Nome do negócio").inputValue()) === "Oficina Aurora 3D", "assistente: nome do negócio persistiu e volta preenchido");
  await p.getByRole("button", { name: "Continuar" }).click();
  ok((await p.getByLabel("Nome ou modelo da impressora").inputValue()) === "A1" && (await p.getByLabel("Marca da impressora").inputValue()) === "Bambu Lab", "assistente: impressora persistiu (atualiza, não duplica)");
  await p.goto(B + "/impressoras");
  ok(((await main$()).match(/Bambu Lab A1/g) ?? []).length === 1, "assistente refeito não duplica a impressora");
  await p.goto(B + "/filamentos");
  ok((await main$()).includes("PLA Preto"), "assistente criou o filamento 'PLA Preto'");

  // ── Configurações ──
  await p.goto(B + "/configuracoes");
  const cfg = { monthlyFixedCosts: "480", productiveHoursPerMonth: "160", laborHourlyRate: "30", lossPercent: "5", saleFeePercent: "14", saleFeeFixed: "4", taxPercent: "6", marginPercent: "30", energyPricePerKwh: "0,90" };
  for (const [k, v] of Object.entries(cfg)) await p.fill(`input[name=${k}]`, v);
  await p.click("button[type=submit]");
  await p.waitForSelector("form [role=status]");
  ok(true, "configurações salvas");

  await p.goto(B + "/impressoras/nova");
  await p.fill("input[name=brand]", "Creality");
  await p.fill("input[name=model]", "Ender-3 V3 KE");
  ok((await main$()).includes("Vai aparecer como: Creality Ender-3 V3 KE"), "impressora: mostra como o nome vai aparecer (marca + modelo)");
  await p.click("button[type=submit]");
  await p.waitForSelector("form [role=alert]");
  ok((await p.textContent("form [role=alert]")).toLowerCase().includes("limite do seu plano"), "limite do plano exibe mensagem amigável");
  await p.fill("input[name=powerWatts]", "abc");
  await p.click("button[type=submit]");
  await p.waitForFunction(() => document.body.innerText.includes("Informe um número válido"));
  ok(true, "campo numérico inválido é rejeitado com mensagem");

  // ── Calculadora: modo rápido × avançado, caso conferido à mão (mesmo do teste unitário) ──
  await p.goto(B + "/calculadora");
  const res = async () => (await p.locator("main aside").first().innerText()).replace(/\s+/g, " ");
  ok((await p.getByRole("radio", { name: /Modo rápido/ }).getAttribute("aria-checked")) === "true", "calculadora abre no modo rápido");
  ok((await p.getByLabel("Mão de obra (min)").count()) === 0 && (await p.getByLabel("Perdas (%)").count()) === 0 && (await p.getByLabel("Impostos (%)").count()) === 0, "modo rápido esconde mão de obra, perdas e impostos");
  ok((await p.getByLabel("Margem de lucro (%)").count()) === 1 && (await p.getByLabel("Unidades", { exact: true }).count()) === 1, "modo rápido mostra margem e unidades");
  ok((await p.locator('[data-testid="padroes-rapido"]').innerText()).includes("padrões já estão aplicados"), "modo rápido avisa que os padrões configurados foram carregados");
  await fill("Horas", "2"); await fill("Minutos", "30"); await fill("Peso (g)", "80");
  t = await res();
  ok(/Perdas|5%/.test(await p.locator('[data-testid="padroes-rapido"]').innerText()) && /R\$\s?\d+,\d\d/.test(t), "modo rápido calcula com os padrões já carregados (perdas 5%)");
  const quickPrice = (await p.locator('[data-testid="preco-sugerido"]').first().innerText()).replace(/\s+/g, " ");
  await p.getByRole("radio", { name: /Modo avançado/ }).click();
  await fill("Mão de obra (min)", "10"); await fill("Embalagem (R$/unid.)", "2");
  t = await res();
  ok(/R\$\s?65,74/.test(t), "preço sugerido = R$ 65,74");
  ok(/Custo unitário R\$\s?28,87/.test(t), "custo unitário = R$ 28,87");
  ok(/Lucro \/ unid\. R\$\s?19,73/.test(t), "lucro = R$ 19,73");
  ok(/Custo do filamento R\$\s?9,60/.test(t) && /Custo da impressora/.test(t) && /Custos adicionais/.test(t), "resultado mostra filamento, impressora, adicionais, custo total, lucro e margem");
  ok((await p.locator('[data-testid="grafico-custos"]').count()) >= 1 && (await p.locator('[data-testid="grafico-custos"] [role=img]').first().getAttribute("aria-label")).includes("Composição do custo por unidade"), "gráfico de composição do custo presente e descrito");
  await p.getByLabel("Acabamento (R$/unid.)").fill("1");
  t = await res();
  ok(/Custo unitário R\$\s?29,87/.test(t), "acabamento soma ao custo (R$ 28,87 + 1,00)");
  await p.getByLabel("Acabamento (R$/unid.)").fill("0");
  await p.getByLabel("Desconto ao cliente (%) — simulação").fill("10");
  ok((await p.locator('[data-testid="simulacao-desconto"]').first().innerText()).includes("Com 10% de desconto"), "modo avançado: simula desconto ao cliente");
  ok(/R\$\s?65,74/.test(await p.locator('[data-testid="preco-sugerido"]').first().innerText()), "desconto é só simulação: preço sugerido não muda");
  await p.getByLabel("Desconto ao cliente (%) — simulação").fill("60");
  ok((await p.locator('[data-testid="simulacao-desconto"]').first().innerText()).includes("não cobre custo"), "desconto que dá prejuízo é sinalizado");
  await p.getByLabel("Desconto ao cliente (%) — simulação").fill("0");
  await p.getByLabel("Potência (W)").fill("300");
  ok(!/Custo unitário R\$\s?28,87/.test(await res()), "ajustar potência no modo avançado muda o custo");
  await p.getByRole("button", { name: "Voltar aos padrões" }).click();
  ok(/Custo unitário R\$\s?28,87/.test(await res()), "voltar aos padrões restaura o custo da impressora");
  await p.getByRole("radio", { name: /Modo rápido/ }).click();
  ok(/Custo unitário R\$\s?28,87/.test(await res()) && /R\$\s?65,74/.test(await p.locator('[data-testid="preco-sugerido"]').first().innerText()), "mesmo motor: voltar ao modo rápido mantém exatamente o mesmo resultado");
  ok(quickPrice.length > 0, "modo rápido sem ajustes avançados mostrou um preço");
  await p.getByRole("radio", { name: /Modo avançado/ }).click();
  await fill("Unidades", "10"); t = await res();
  ok(/Custo do lote \(10\) R\$\s?288,72/.test(t), "lote de 10: custo = R$ 288,72");
  await fill("Unidades", "1");

  const saveBtn = p.getByRole("button", { name: /Salvar como produto|Atualizar produto/ });
  const productSelect = p.locator("select").last();
  ok(await saveBtn.isDisabled(), "salvar fica desabilitado até dar nome ao produto novo");
  await p.getByLabel("Nome do novo produto").fill("Suporte de celular");
  await saveBtn.click();
  await p.waitForSelector("text=Produto salvo no catálogo.");
  await p.waitForTimeout(800);
  ok((await productSelect.inputValue()) !== "__new__", "produto recém-criado fica selecionado na lista");
  await fill("Peso (g)", "100");
  await saveBtn.click();
  await p.waitForFunction(() => document.body.innerText.includes("Produto salvo no catálogo."));
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
  await p.waitForSelector("text=Produto salvo no catálogo.");
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
  ok(t.includes("Histórico de preços (2)") && t.includes("R$ 70,78") && t.includes("R$ 65,74"), "histórico do produto tem as 2 precificações");
  ok(t.includes("Impressora: Bambu Lab A1") && t.includes("Filamento: PLA Preto"), "nomes de impressora e filamento gravados no histórico");
  await p.locator("summary", { hasText: "Composição do custo" }).first().click();
  ok((await main$()).includes("R$ 12,00"), "composição do custo expandida (filamento R$ 12,00)");
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: /Excluir esta precificação/ }).first().click();
  await p.waitForFunction(() => document.body.innerText.includes("Histórico de preços (1)"));
  ok(true, "excluir precificação funciona");

  // ── Dashboard e histórico ──
  await p.goto(B + "/");
  t = await main$();
  ok(t.includes("Produtos cadastrados 2"), "dashboard: 2 produtos cadastrados");
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
  const maisTxt = await m.locator("main").innerText();
  ok(["Importar modelo", "Filamentos", "Configurações", "Histórico", "Configuração guiada", "Meus produtos", "Estoque de filamento"].every((x) => maisTxt.includes(x)) && !maisTxt.includes("em breve"), "celular: 'Mais' leva a Produtos, Estoque, Importar, Filamentos, Configurações, Histórico e à configuração guiada");
  ok(!(await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "celular: sem rolagem horizontal");

  // ═══════════ ETAPA 3: catálogo, negócio e orçamentos ═══════════
  const zlib = require("node:zlib");
  const pdfText = (buf) => {
    const out = [];
    let at = 0;
    for (;;) {
      const st = buf.indexOf("stream", at, "latin1"); if (st < 0) break;
      const en = buf.indexOf("endstream", st, "latin1"); if (en < 0) break;
      at = en + 9;
      try {
        const body = buf.subarray(st + 6, en);
        const c = zlib.inflateSync(body.subarray(body[0] === 0x0d ? 2 : 1)).toString("latin1");
        for (const mm of c.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) out.push(Buffer.from(mm[1], "hex").toString("latin1"));
      } catch { /* não é fluxo de conteúdo */ }
    }
    return out.join("\n");
  };
  const shot = async (page, name) => { if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, name + ".png"), fullPage: true }); };
  const idOf = async (name) => {
    await p.goto(B + "/produtos");
    const href = await p.locator("a", { hasText: name }).first().getAttribute("href");
    return href.split("/").pop();
  };

  // Catálogo: busca, edição, validação de link, persistência
  await p.goto(B + "/produtos");
  await p.getByRole("search").getByLabel("Buscar").fill("vaso");
  await p.getByRole("search").getByRole("button", { name: "Filtrar" }).click();
  await p.waitForURL(/q=vaso/);
  t = await main$();
  ok(t.includes("Vaso espiral") && !t.includes("Suporte de celular"), "catálogo: busca por nome filtra a lista");
  const vasoId = await idOf("Vaso espiral");
  const suporteId = await idOf("Suporte de celular");
  await p.goto(`${B}/produtos/${vasoId}`);
  await shot(p, "ficha-produto-desktop");
  t = await main$();
  ok(t.includes("Custo de produção") && t.includes("R$ 57,74") && t.includes("Margem líquida"), "ficha do produto: custo, preço e margem líquida vindos do cálculo");
  await p.getByRole("link", { name: "Editar" }).click();
  await p.waitForURL(/editar/);
  await p.locator("input[name=category]").fill("Decoração");
  await p.locator("input[name=stockQty]").fill("5");
  await p.locator("input[name=sourceUrl]").fill("ftp://invalido");
  await p.getByRole("button", { name: "Salvar produto" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("começando com http"));
  ok(true, "catálogo: link que não é http(s) é recusado");
  await p.locator("input[name=sourceUrl]").fill("https://makerworld.com/modelo/123");
  await p.locator("textarea[name=licenseInfo]").fill("Uso comercial permitido (CC BY)");
  await p.locator("textarea[name=description]").fill("Vaso decorativo em espiral");
  await p.getByRole("button", { name: "Salvar produto" }).click();
  await p.waitForURL(new RegExp(`/produtos/${vasoId}$`));
  await p.reload();
  t = await main$();
  ok(t.includes("Decoração") && t.includes("Vaso decorativo em espiral") && t.includes("CC BY") && (await p.locator('a[href="https://makerworld.com/modelo/123"]').count()) === 1, "catálogo: edição persiste após recarregar a página");
  ok((await p.locator("#estoque-" + vasoId).inputValue()) === "5", "catálogo: estoque 5 persiste");
  ok((await p.locator('a[href="https://makerworld.com/modelo/123"]').getAttribute("rel")).includes("noopener"), "link externo abre com rel=noopener");

  // Foto do produto (reduzida no navegador, conferida no servidor)
  await p.goto(`${B}/produtos/${vasoId}/editar`);
  await p.locator('input[aria-label="Foto do produto"]').setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
  await p.waitForFunction(() => document.body.innerText.includes("Trocar imagem"));
  await p.goto(`${B}/produtos/${vasoId}`);
  ok((await p.locator('[data-testid="ficha-produto"] img[alt="Foto de Vaso espiral"]').count()) === 1, "catálogo: foto enviada aparece na ficha");

  // Duplicar, arquivar, restaurar
  await p.getByRole("button", { name: "Duplicar" }).click();
  await p.waitForFunction(() => /\(cópia\)/.test(document.querySelector("h1")?.textContent ?? ""));
  const copyId = p.url().split("/").pop();
  t = await main$();
  ok(t.includes("Vaso espiral (cópia)") && t.includes("R$ 57,74") && (await p.locator("#estoque-" + copyId).inputValue()) === "0", "duplicar: cópia com os mesmos valores e estoque zerado");
  ok((await p.locator('[data-testid="ficha-produto"] img').count()) === 1, "duplicar: a foto é copiada");
  await p.getByRole("button", { name: "Arquivar" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Restaurar"));
  await p.goto(B + "/produtos");
  ok(!(await main$()).includes("(cópia)"), "arquivar: some da lista de ativos");
  await p.goto(B + "/produtos?ver=arquivados");
  ok((await main$()).includes("Vaso espiral (cópia)"), "arquivar: aparece em Arquivados");
  await p.getByRole("button", { name: "Restaurar" }).click();
  await p.waitForFunction(() => !document.body.innerText.includes("(cópia)"));
  await p.goto(B + "/produtos?ver=estoque");
  t = await main$();
  ok(t.includes("Vaso espiral") && !t.includes("(cópia)") && !t.includes("Suporte de celular"), "filtro 'Com estoque' mostra só quem tem estoque [tela: " + t.slice(0, 400) + "]");
  await p.goto(B + "/produtos?cat=Decora%C3%A7%C3%A3o");
  t = await main$();
  ok(t.includes("Vaso espiral") && !t.includes("Suporte de celular"), "filtro por categoria");

  // Custos mudam: o produto NÃO muda sozinho; recalcular é opcional e vira novo item no histórico
  await p.goto(B + "/filamentos");
  await p.getByRole("link", { name: /PLA Preto/ }).first().click();
  await p.waitForURL(/filamentos\/[0-9a-f-]{36}/);
  await p.fill("input[name=pricePerKg]", "200");
  await p.click("button[type=submit]");
  await p.waitForURL(B + "/filamentos");
  await p.goto(B + "/produtos");
  t = await main$();
  ok((await p.locator('[data-testid="aviso-desatualizados"]').count()) === 1, "custos mudaram: aviso de produtos desatualizados");
  ok(t.includes("R$ 57,74") && t.includes("Custos mudaram: hoje seria"), "custos mudaram: preço salvo continua R$ 57,74 (não muda sozinho)");
  await p.goto(`${B}/produtos/${vasoId}`);
  ok((await p.locator('[data-testid="aviso-custos"]').count()) === 1 && (await main$()).includes("O preço salvo continua R$ 57,74"), "ficha mostra a diferença e mantém o preço salvo");
  await p.goto(B + "/produtos/recalcular");
  await shot(p, "recalcular-desktop");
  t = await main$();
  ok(t.includes("Preço do filamento") && t.includes("R$ 120,00/kg → R$ 200,00/kg") && t.includes("Vaso espiral"), "recalcular: mostra o que mudou (filamento 120 → 200) antes de confirmar");
  const antes = t;
  await p.locator('[data-testid="lista-recalcular"]').getByRole("button", { name: "Recalcular só este" }).first().click();
  await p.waitForFunction(() => document.body.innerText.includes("recalculado"));
  await p.goto(`${B}/produtos/${vasoId}`);
  t = await main$();
  ok(!t.includes("O preço salvo continua") && t.includes("Histórico de preços (2)") && !/R\$\s?57,74\s+preço de venda/.test(t), "recalcular: produto atualizado e novo item no histórico (o anterior permanece)");
  ok(antes.length > 0 && (await p.locator('[data-testid="aviso-custos"]').count()) === 0, "recalcular: produto volta a ficar em dia");

  // Meu negócio
  await p.goto(B + "/orcamentos/novo");
  ok((await p.locator('[data-testid="aviso-negocio"]').count()) === 0, "nome do negócio informado no assistente já vale para os orçamentos (sem aviso)");
  await p.goto(B + "/negocio");
  await p.fill("input[name=businessName]", "Oficina Aurora 3D");
  await p.fill("input[name=phone]", "(11) 98888-7777");
  await p.fill("input[name=email]", "contato@aurora.example");
  await p.fill("textarea[name=defaultPaymentTerms]", "50% na aprovação, 50% na entrega.");
  await p.click('[data-testid="form-negocio"] button[type=submit]');
  await p.waitForSelector('[data-testid="form-negocio"] [role=status]');
  await p.reload();
  ok((await p.inputValue("input[name=businessName]")) === "Oficina Aurora 3D" && (await p.inputValue("textarea[name=defaultPaymentTerms]")).includes("50%"), "meu negócio: dados persistem após recarregar");
  await p.locator('input[aria-label="Logo do negócio"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
  await p.waitForFunction(() => document.body.innerText.includes("Trocar imagem"));

  // Orçamento com vários itens, desconto e personalização
  await p.goto(`${B}/orcamentos/novo?produto=${vasoId}`);
  const itens = p.locator('[data-testid="item-orcamento"]');
  ok((await itens.count()) === 1, "orçamento: produto escolhido no catálogo já entra como item");
  await p.getByLabel("Adicionar produto").selectOption(suporteId);
  await p.getByRole("button", { name: "Personalização" }).click();
  ok((await itens.count()) === 3, "orçamento: 2 produtos + 1 personalização");
  const setItem = async (i, qty, price) => {
    await itens.nth(i).getByLabel("Qtd.").fill(String(qty));
    await itens.nth(i).getByLabel("Preço unit. (R$)").fill(price);
  };
  await setItem(0, 2, "40,00");
  await setItem(1, 1, "30,00");
  await itens.nth(2).getByLabel("Personalização / serviço").fill("Nome gravado");
  await setItem(2, 1, "25,00");
  await p.getByLabel("Desconto no total").selectOption("percentual");
  await p.getByLabel("Desconto (%)", { exact: true }).last().fill("10");
  await p.getByLabel("Prazo de produção (dias)").fill("5");
  t = (await p.locator('[data-testid="totais-orcamento"]').innerText()).replace(/\s+/g, " ");
  ok(/Subtotal R\$\s?135,00/.test(t) && /Desconto - R\$\s?13,50/.test(t) && /Total R\$\s?121,50/.test(t), "orçamento: subtotal 135,00 − 10% = total 121,50 (contas na tela)");
  await shot(p, "orcamento-editor-desktop");
  await p.getByRole("button", { name: "Salvar orçamento" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Informe o nome do cliente"));
  ok(true, "orçamento: sem cliente não salva e explica");
  await p.getByLabel("Nome", { exact: true }).fill("Ana Souza");
  await p.getByLabel("WhatsApp / telefone").fill("(11) 99999-0000");
  await p.getByLabel("Guardar este cliente para os próximos orçamentos").check();
  await p.getByRole("button", { name: "Salvar orçamento" }).click();
  await p.waitForURL(/orcamentos\/[0-9a-f-]{36}$/);
  const q1 = p.url().split("/").pop();
  await shot(p, "orcamento-detalhe-desktop");
  t = await main$();
  ok(t.includes("Orçamento #0001") && t.includes("Rascunho") && t.includes("R$ 121,50") && t.includes("Ana Souza") && t.includes("Nome gravado"), "orçamento salvo: nº 0001, rascunho, total 121,50");
  await p.reload();
  t = await main$();
  ok(t.includes("R$ 135,00") && t.includes("- R$ 13,50") && t.includes("5 dia(s)") && t.includes("50% na aprovação"), "orçamento: valores, desconto, prazo e pagamento persistem após recarregar");
  ok((await p.locator('[data-testid="visao-vendedor"]').count()) === 1, "orçamento: custo interno aparece só na visão do vendedor");

  // PDF: baixa, confere conteúdo e ausência de custos/margem
  const pdfRes = await p.request.get(`${B}/orcamentos/${q1}/pdf`);
  const pdfBytes = await pdfRes.body();
  ok(pdfRes.status() === 200 && (pdfRes.headers()["content-type"] || "").includes("application/pdf") && pdfBytes.subarray(0, 5).toString() === "%PDF-", "PDF: gerado como application/pdf");
  const txt = pdfText(pdfBytes).replace(/ /g, " ");
  ok(["Oficina Aurora 3D", "#0001", "Ana Souza", "Vaso espiral", "Suporte de celular", "Nome gravado", "R$ 121,50", "R$ 135,00", "5 dias", "50% na aprovação"].every((x) => txt.includes(x)), "PDF: identidade, cliente, itens, valores, desconto, prazo e pagamento");
  ok(!/custo|margem|lucro|markup/i.test(txt), "PDF: nenhum custo interno nem margem");
  ok((await p.request.get(`${B}/orcamentos/00000000-0000-4000-8000-000000000000/pdf`)).status() === 404, "PDF de orçamento inexistente: 404");
  await browser.newContext().then(async (c) => {
    const anon = await c.request.get(`${B}/orcamentos/${q1}/pdf`, { maxRedirects: 0 });
    ok(anon.status() !== 200, "PDF sem login não é entregue");
    await c.close();
  });

  // Compartilhar por WhatsApp (link wa.me, sem API)
  await p.getByRole("button", { name: "Compartilhar" }).click();
  await p.waitForSelector('[data-testid="painel-compartilhar"]');
  const wa = await p.locator('[data-testid="btn-whatsapp"]').getAttribute("href");
  const waText = decodeURIComponent(wa.split("?text=")[1] || "").replace(/\u00a0/g, " ");
  ok(wa.startsWith("https://wa.me/5511999990000?text=") && waText.includes("Ana Souza") && waText.includes("#0001") && waText.includes("R$ 121,50") && /PDF: http/.test(waText), "WhatsApp: link com telefone do cliente, texto e link do PDF");
  ok(!/custo|margem|lucro/i.test(waText), "WhatsApp: mensagem sem custo interno");
  const shared = await p.locator('input[aria-label="Link do PDF"]').inputValue();
  const sharedRes = await p.request.get(shared.startsWith("http") ? shared : `http://127.0.0.1:${MOCK_PORT}/storage/v1${shared}`);
  ok(sharedRes.status() === 200 && (await sharedRes.body()).subarray(0, 5).toString() === "%PDF-", "link compartilhado entrega o PDF");

  // Status: enviado trava a edição; duplicar cria novo rascunho
  await p.getByRole("button", { name: "Marcar como enviado" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Enviado") && !document.body.innerText.includes("Marcar como enviado"));
  ok((await p.getByRole("link", { name: "Editar" }).count()) === 0, "enviado: botão Editar some");
  await p.goto(`${B}/orcamentos/${q1}/editar`);
  await p.waitForURL(new RegExp(`/orcamentos/${q1}$`));
  ok(true, "enviado: abrir a edição redireciona para o orçamento (conteúdo travado)");
  await p.getByRole("button", { name: "Duplicar" }).click();
  await p.waitForFunction((id) => !location.pathname.endsWith(id), q1);
  const q2 = p.url().split("/").pop();
  t = await main$();
  ok(t.includes("Orçamento #0002") && t.includes("Rascunho") && t.includes("R$ 121,50"), "duplicar orçamento: novo rascunho nº 0002 com os mesmos valores");
  await p.getByRole("link", { name: "Editar" }).click();
  await p.waitForURL(/editar/);
  await p.locator('[data-testid="item-orcamento"]').nth(0).getByLabel("Qtd.").fill("3");
  await p.getByRole("button", { name: "Salvar alterações" }).click();
  await p.waitForURL(new RegExp(`/orcamentos/${q2}$`));
  t = await main$();
  ok(t.includes("R$ 157,50") && t.includes("R$ 175,00"), "editar rascunho: 3 × 40 + 30 + 25 = 175,00 − 10% = 157,50 recalculado");

  // Mudar o preço do produto depois não altera o orçamento já feito (retrato)
  await p.goto(`${B}/produtos/${vasoId}/editar`);
  await p.locator("input[name=salePrice]").fill("999,00");
  await p.getByRole("button", { name: "Salvar produto" }).click();
  await p.waitForURL(new RegExp(`/produtos/${vasoId}$`));
  await p.goto(`${B}/orcamentos/${q1}`);
  t = await main$();
  ok(t.includes("R$ 121,50") && t.includes("2 × R$ 40,00") && !t.includes("999,00"), "orçamento é um retrato: mudar o preço do produto depois não o altera");

  // Aprovar, histórico por status, excluir rascunho
  await p.getByRole("button", { name: "Marcar como aprovado" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Aprovado"));
  ok(await p.getByRole("button", { name: "Transformar em pedido" }).isEnabled(), "aprovado: 'Transformar em pedido' está disponível");
  const sellerView = (await p.goto(`${B}/orcamentos/${q1}`) && (await p.locator('[data-testid="visao-vendedor"]').innerText())).replace(/\s+/g, " ");
  const profitShown = /Resultado sobre o custo (R\$\s?[\d.]+,\d\d)/.exec(sellerView)?.[1];
  await p.goto(B + "/");
  t = (await p.locator('[data-testid="indicadores"]').innerText()).replace(/\s+/g, " ");
  ok(t.includes("Orçamentos criados 2") && t.includes("Orçamentos aprovados 1") && /Valor aprovado \(orçado\) R\$\s?121,50/.test(t), "dashboard: orçamentos criados, aprovados e valor aprovado vêm dos dados reais");
  ok(profitShown && t.includes("Lucro estimado dos aprovados " + profitShown), "dashboard: lucro estimado dos aprovados = valor do orçamento − custo de produção (igual à visão do vendedor)");
  ok(t.includes("não significa recebido"), "dashboard: separa orçado de venda realizada");
  await shot(p, "painel-desktop");
  await p.goto(B + "/orcamentos");
  t = await main$();
  ok(t.includes("Todos (2)") && t.includes("Aprovado (1)") && t.includes("Rascunho (1)"), "histórico: contagem por status");
  await p.goto(B + "/orcamentos?status=aprovado");
  t = await main$();
  ok(t.includes("#0001") && !t.includes("#0002"), "histórico: filtro por status");
  await p.goto(B + "/orcamentos?q=ana");
  ok((await main$()).includes("#0002"), "histórico: busca por cliente");
  await p.goto(`${B}/orcamentos/${q2}`);
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Excluir rascunho" }).click();
  await p.waitForURL(B + "/orcamentos");
  ok(!(await main$()).includes("#0002"), "rascunho excluído some do histórico");
  await p.goto(`${B}/orcamentos/${q1}`);
  ok((await p.getByRole("button", { name: "Excluir rascunho" }).count()) === 0, "orçamento aprovado não oferece exclusão");

  // Celular
  const mq = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await mq.context().addCookies(await p.context().cookies());
  for (const route of ["/", "/calculadora", "/calculadora?modo=avancado", "/boas-vindas?refazer=1", "/orcamentos/novo", "/orcamentos", "/produtos", "/negocio", "/mais", "/pedidos", "/pedidos/novo", "/producao", "/estoque", "/filamentos/estoque"]) {
    await mq.goto(B + route);
    await shot(mq, "mobile" + route.replace(/[/?=]/g, "-"));
    ok(await mq.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `celular: ${route} sem rolagem horizontal`);
  }
  await mq.goto(B + "/produtos");
  const bottom = mq.getByRole("navigation", { name: "Principal" });
  ok((await Promise.all(["Painel", "Precificar", "Orçamentos", "Pedidos", "Produção", "Mais"].map((l) => bottom.getByRole("link", { name: l }).count()))).every((c) => c === 1), "celular: navegação inferior com Painel, Precificar, Orçamentos, Pedidos, Produção e Mais");
  await mq.close();

  // ═══════════ ETAPA 5: estoque, pedidos, produção ═══════════
  const money = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
  const bodyTxt = async () => (await p.locator("main").innerText()).replace(/\s+/g, " ").replace(/ /g, " ");

  // Estoque: duas bobinas do mesmo material e cor
  await p.goto(B + "/filamentos/estoque");
  ok((await bodyTxt()).includes("sem bobinas"), "estoque: filamento sem bobinas aparece como 'sem bobinas' (sem alarme)");
  for (const [maker, g, price, loc] of [["Marca X", "300", "36", "Prateleira 1"], ["Marca Y", "200", "24", "Prateleira 2"]]) {
    await p.getByRole("button", { name: "Nova bobina" }).click();
    const f = p.locator('[data-testid="form-bobina"]');
    await f.getByLabel("Fabricante").fill(maker);
    await f.getByLabel("Peso inicial (g)").fill(g);
    await f.getByLabel("Valor pago (R$)").fill(price);
    await f.getByLabel("Local de armazenamento").fill(loc);
    await f.getByRole("button", { name: "Cadastrar bobina" }).click();
    await p.waitForFunction((m) => document.querySelector('[data-testid="lista-bobinas"]')?.innerText.includes(m), maker);
  }
  t = await bodyTxt();
  ok(t.includes("2 bobinas") && /No saldo 500 g/.test(t) && t.includes("Reservado 0 g") && /Disponível 500 g/.test(t), "estoque: duas bobinas do mesmo filamento somam 500 g disponíveis");

  // Converter orçamento aprovado em pedido — sem duplicar, nem com duas abas
  await p.goto(`${B}/orcamentos/${q1}`);
  const stale = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await stale.context().addCookies(await p.context().cookies());
  await stale.goto(`${B}/orcamentos/${q1}`);
  await stale.waitForSelector('[data-testid="transformar-pedido"]');
  await p.locator('[data-testid="transformar-pedido"]').click();
  await p.waitForURL(/pedidos\/[0-9a-f-]{36}$/);
  const o1 = p.url().split("/").pop();
  t = await bodyTxt();
  ok(t.includes("Pedido #0001") && t.includes("Ana Souza") && t.includes("orçamento de origem") && t.includes("Pagamento pendente") && t.includes(money(121.5)), "converter: pedido nº 1 criado com cliente, total e vínculo com o orçamento");
  await stale.locator('[data-testid="transformar-pedido"]').click();
  await stale.waitForURL(/pedidos\/[0-9a-f-]{36}$/);
  ok(stale.url().endsWith(o1), "converter de novo (aba desatualizada): leva ao MESMO pedido, sem duplicar");
  await stale.close();
  await p.goto(B + "/pedidos");
  ok((await p.locator('[data-testid="lista-pedidos"] li').count()) === 1, "um orçamento gera um único pedido");
  await p.goto(`${B}/orcamentos/${q1}`);
  ok((await p.getByRole("link", { name: "Ver pedido deste orçamento" }).count()) === 1 && (await p.locator('[data-testid="transformar-pedido"]').count()) === 0, "orçamento convertido mostra 'Ver pedido' e some o botão de converter");

  // Pedido: lotes e reserva de filamento
  await p.goto(`${B}/pedidos/${o1}`);
  const itensP = p.locator('[data-testid="item-do-pedido"]');
  ok((await itensP.count()) === 3, "pedido tem os 3 itens do orçamento");
  const lote = async (i, qty) => {
    await itensP.nth(i).locator('[data-testid="criar-lote"]').click();
    const f = itensP.nth(i).locator('[data-testid="form-lote"]');
    await f.locator("input").first().fill(String(qty));
    await f.getByRole("button", { name: "Criar e reservar material" }).click();
    await p.waitForFunction(() => document.body.innerText.includes("Lote criado e material reservado."));
    jobsExpected += 1;
    await p.waitForFunction((n) => document.querySelectorAll('[data-testid="tarefa"]').length >= n, jobsExpected);
  };
  let jobsExpected = 0;
  await lote(0, 1);
  { const tt = await bodyTxt(); ok(tt.includes("Reservado 80 g"), "lote de 1 Vaso reserva 80 g (peso do produto × quantidade)" + (tt.includes("Reservado 80 g") ? "" : ` [${tt.slice(tt.indexOf("Itens e produção"), tt.indexOf("Itens e produção") + 700)}]`)); }
  await lote(0, 1);
  await lote(1, 1);
  t = await bodyTxt();
  ok((await p.locator('[data-testid="tarefa"]').count()) === 3 && (await itensP.nth(0).locator('[data-testid="criar-lote"]').count()) === 0, `pedido dividido em 2 lotes do Vaso + 1 do Suporte; item totalmente distribuído [tarefas=${await p.locator('[data-testid="tarefa"]').count()} botoes=${await itensP.nth(0).locator('[data-testid="criar-lote"]').count()}]`);
  ok(/Personalização\/serviço: não vai para a fila/.test(t), "personalização não vai para a produção");
  await p.goto(B + "/filamentos/estoque");
  t = await bodyTxt();
  ok(/Reservado 260 g/.test(t) && /No saldo 500 g/.test(t) && /Disponível 240 g/.test(t), "reservar não baixa o saldo físico: 500 g no saldo, 260 g reservados, 240 g disponíveis");
  ok((await p.locator('[data-testid="alertas-estoque"]').innerText()).includes("estoque baixo"), "alerta de estoque baixo (240 g disponíveis < mínimo de 250 g)");

  // Pedido manual maior que o estoque: estoque insuficiente
  await p.goto(B + "/pedidos/novo");
  await p.getByLabel("Nome", { exact: true }).fill("Bia Lima");
  const optV = await p.getByLabel("Adicionar produto").evaluate((el) => [...el.options].find((o) => o.text.startsWith("Vaso espiral —")).value);
  await p.getByLabel("Adicionar produto").selectOption(optV);
  await p.locator('[data-testid="item-pedido"]').first().getByLabel("Qtd.").fill("5");
  await p.locator('[data-testid="item-pedido"]').first().getByLabel("Preço unit. (R$)").fill("50");
  ok((await p.locator('[data-testid="totais-pedido"]').innerText()).replace(/\s+/g, " ").replace(/ /g, " ").includes("Total " + money(250)), "pedido manual: total 250,00 na tela");
  await p.getByRole("button", { name: "Criar pedido" }).click();
  await p.waitForURL(/pedidos\/[0-9a-f-]{36}$/);
  const o2 = p.url().split("/").pop();
  ok((await bodyTxt()).includes("Pedido #0002"), "pedido manual criado (nº 2)");
  await p.locator('[data-testid="criar-lote"]').first().click();
  await p.locator('[data-testid="form-lote"]').getByRole("button", { name: "Criar e reservar material" }).click();
  await p.waitForSelector('[data-testid="form-lote"] [role=alert]');
  t = (await p.locator('[data-testid="form-lote"] [role=alert]').innerText()).replace(/\s+/g, " ");
  ok(/Estoque insuficiente: faltam 160/.test(t), "estoque insuficiente: avisa quanto falta (faltam 160 g de PLA Preto)");
  ok((await p.locator('[data-testid="tarefa"]').count()) === 0, "estoque insuficiente: a tarefa não é criada");
  await p.getByRole("button", { name: "Criar mesmo assim, sem reservar" }).click();
  await p.waitForSelector('[data-testid="tarefa"]');
  ok((await bodyTxt()).includes("Sem material reservado"), "criada sem reserva: a tarefa avisa 'Sem material reservado'");
  await p.goto(B + "/filamentos/estoque");
  ok(/Reservado 260 g/.test(await bodyTxt()), "o lote sem reserva não comprometeu o estoque dos outros pedidos");

  // Pedido atrasado (simula a passagem do tempo no dublê)
  await fetch(`http://127.0.0.1:${MOCK_PORT}/__set_order_due`, { method: "POST", body: JSON.stringify({ number: 2, due: "2020-01-01" }) });
  await p.goto(B + "/pedidos");
  t = await bodyTxt();
  ok(/Atrasados 1/.test(t) && (await p.locator('[data-testid="lista-pedidos"] li', { hasText: "Bia Lima" }).getByText(/Atrasado/).count()) === 1, "pedido com prazo vencido aparece como atrasado");
  await p.goto(B + "/pedidos?atrasados=1");
  ok((await p.locator('[data-testid="lista-pedidos"] li').count()) === 1 && (await bodyTxt()).includes("Bia Lima"), "filtro 'só atrasados'");
  await p.goto(B + "/producao");
  ok((await p.locator('[data-testid="avisos-producao"]').innerText()).includes("atrasada"), "produção: aviso de tarefa atrasada");
  ok((await p.locator('[data-testid="coluna-aguardando"] [data-testid="tarefa"]').count()) === 4, "kanban: 4 tarefas em Aguardando");
  await p.goto(B + "/producao?atrasados=1");
  ok((await p.locator('[data-testid="tarefa"]').count()) === 1, "kanban: filtro de atrasadas");
  await p.goto(B + "/producao?impressora=00000000-0000-0000-0000-000000000000");
  ok((await p.locator('[data-testid="tarefa"]').count()) === 0, "kanban: filtro por impressora sem resultados");

  // Produção: avançar, falhar, concluir com consumo real diferente do previsto
  await p.goto(B + "/producao");
  const card = (name, n = 0) => p.locator('[data-testid="tarefa"]', { hasText: name }).filter({ hasText: "Pedido #0001" }).nth(n);
  await card("Vaso espiral").getByRole("button", { name: "Avançar para preparando" }).click();
  await p.waitForSelector('[data-testid="coluna-preparando"] [data-testid="tarefa"]');
  await p.locator('[data-testid="coluna-preparando"] [data-testid="tarefa"]').getByRole("button", { name: "Avançar para imprimindo" }).click();
  await p.waitForSelector('[data-testid="coluna-imprimindo"] [data-testid="tarefa"]');
  await p.goto(`${B}/pedidos/${o1}`);
  ok((await bodyTxt()).includes("Em produção"), "iniciar a produção move o pedido para 'Em produção'");
  await p.goto(B + "/producao");
  const sup = p.locator('[data-testid="tarefa"]', { hasText: "Suporte de celular" });
  await sup.getByRole("button", { name: "Falha" }).click();
  await sup.locator('[data-testid="painel-falha"]').getByLabel("Material perdido (g)").fill("20");
  await sup.getByRole("button", { name: "Registrar falha" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Falha registrada"));
  await p.waitForFunction(() => /1 falha/.test(document.body.innerText));
  { const tt = await p.locator('[data-testid="tarefa"]', { hasText: "Suporte de celular" }).first().innerText(); ok(tt.includes("1 falha"), `falha de impressão registrada na tarefa [${tt.replace(/\s+/g, " ")}]`); }
  await p.goto(B + "/filamentos/estoque");
  t = await bodyTxt();
  ok(/No saldo 480 g/.test(t) && /Reservado 260 g/.test(t), "falha baixou 20 g do estoque (480 g) e manteve a reserva da reimpressão");

  await p.goto(B + "/producao");
  const concluir = async (locator, grams, minutes) => {
    await locator.getByRole("button", { name: "Concluir" }).click();
    const panel = locator.locator('[data-testid="painel-concluir"]');
    await panel.getByLabel("Consumo real (g)").fill(grams);
    if (minutes) await panel.getByLabel("Tempo real (min)").fill(minutes);
    await panel.getByRole("button", { name: "Concluir e baixar estoque" }).click();
    await p.waitForFunction(() => document.body.innerText.includes("Tarefa concluída e consumo registrado."));
  };
  await concluir(p.locator('[data-testid="coluna-imprimindo"] [data-testid="tarefa"]', { hasText: "Vaso espiral" }), "90");
  await p.goto(B + "/filamentos/estoque");
  t = await bodyTxt();
  ok(/No saldo 390 g/.test(t) && /Reservado 180 g/.test(t), "consumo real (90 g) diferente do previsto (80 g): saldo 390 g; reserva do lote liberada");
  await p.goto(B + "/producao");
  ok((await p.locator('[data-testid="coluna-concluido"] [data-testid="tarefa"]').innerText()).includes("90"), "kanban: tarefa concluída mostra o consumo real");
  await concluir(card("Vaso espiral"), "80");
  await concluir(card("Suporte de celular"), "100");
  await p.goto(`${B}/pedidos/${o1}`);
  ok((await p.locator("h1").innerText()).includes("#0001") && (await bodyTxt()).includes("Pronto"), "todas as unidades concluídas: pedido fica 'Pronto'");
  await p.goto(B + "/filamentos/estoque");
  t = await bodyTxt();
  ok(/No saldo 210 g/.test(t) && /Reservado 0 g/.test(t), "estoque final: 500 − 90 − 80 − 100 − 20 (falha) = 210 g, nada reservado");
  await p.goto(B + "/filamentos/estoque");
  const spoolHref = await p.locator('[data-testid="lista-bobinas"] a', { hasText: "Marca X" }).first().getAttribute("href");
  await p.goto(B + spoolHref);
  t = await bodyTxt();
  ok(t.includes("Entrada") && t.includes("Reserva") && t.includes("Consumo") && t.includes("Falha de impressão"), `histórico da bobina: entrada, reserva, consumo e falha [${t.slice(t.indexOf("Histórico de mov"), t.indexOf("Histórico de mov") + 500)}]`);
  await p.locator('[data-testid="ajuste-bobina"]').getByLabel("Saldo correto (g)").fill("150");
  await p.locator('[data-testid="ajuste-bobina"]').getByLabel("Motivo").fill("contagem física");
  await p.getByRole("button", { name: "Ajustar saldo" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Saldo ajustado"));
  await p.reload();
  ok((await bodyTxt()).includes("Ajuste"), "ajuste manual fica registrado no histórico");
  await p.locator('[data-testid="ajuste-bobina"]').getByLabel("Saldo correto (g)").fill("10");
  await p.locator('[data-testid="ajuste-bobina"]').getByLabel("Motivo").fill("voltar ao valor");
  await p.getByRole("button", { name: "Ajustar saldo" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Saldo ajustado"));

  // Pagamento: parcial, excesso recusado, quitação; lucro realizado
  await p.goto(`${B}/pedidos/${o1}`);
  t = await bodyTxt();
  ok(/Custo estimado/.test(t) && /Lucro realizado/.test(t), `antes de receber: bloco financeiro presente [${t.slice(t.indexOf("Custos e lucro"), t.indexOf("Custos e lucro") + 400)}]`);
  await p.getByRole("button", { name: "Lançar recebimento" }).click();
  await p.locator('[data-testid="form-pagamento"]').getByLabel("Valor recebido (R$)").fill("50");
  await p.locator('[data-testid="form-pagamento"]').getByRole("button", { name: "Confirmar" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Pago em parte"));
  t = await bodyTxt();
  ok(t.includes("Pago em parte") && t.includes("A receber " + money(71.5)) && t.includes("Pagamento parcial: o custo real é reconhecido na mesma proporção"), "pagamento parcial: recebido R$ 50, a receber R$ 71,50 e lucro realizado proporcional");
  await p.getByRole("button", { name: "Lançar recebimento" }).click();
  await p.locator('[data-testid="form-pagamento"]').getByLabel("Valor recebido (R$)").fill("100");
  await p.locator('[data-testid="form-pagamento"]').getByRole("button", { name: "Confirmar" }).click();
  await p.waitForSelector('[data-testid="form-pagamento"] [role=alert]');
  ok((await p.locator('[data-testid="form-pagamento"] [role=alert]').innerText()).includes("passa do saldo"), "recebimento acima do saldo é recusado com mensagem");
  await p.locator('[data-testid="form-pagamento"]').getByLabel("Valor recebido (R$)").fill("71,50");
  await p.locator('[data-testid="form-pagamento"]').getByRole("button", { name: "Confirmar" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Pedido quitado"));
  t = await bodyTxt();
  ok(t.includes("Pago") && t.includes("Receita recebida " + money(121.5)) && !/Lucro realizado —/.test(t), "quitado: receita recebida R$ 121,50 e lucro realizado calculado");
  const realized = /Lucro realizado (R\$ [\d.,]+)/.exec(t)?.[1];
  const realCost = /Custo real (R\$ [\d.,]+)/.exec(t)?.[1];
  ok(Boolean(realized && realCost), `custo real (${realCost}) e lucro realizado (${realized}) aparecem separados do estimado`);
  await p.getByRole("button", { name: "Marcar como entregue" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Entregue"));
  ok((await p.getByRole("button", { name: "Cancelar pedido" }).count()) === 0, "pedido entregue não pode ser cancelado");

  // Painel: indicadores reais de pedidos e produção
  await p.goto(B + "/");
  t = (await p.locator('[data-testid="indicadores-pedidos"]').innerText()).replace(/\s+/g, " ").replace(/ /g, " ");
  ok(/Pedidos em aberto 1/.test(t) && /Atrasados 1/.test(t) && /Concluídos \(entregues\) 1/.test(t), "painel: 1 pedido em aberto, 1 atrasado, 1 entregue");
  ok(t.includes("Valor de vendas (pedidos) " + money(371.5)) && t.includes("A receber " + money(250)) && t.includes("Receita recebida " + money(121.5)), "painel: vendas R$ 371,50, a receber R$ 250,00 e recebido R$ 121,50 (só o que foi lançado)");
  ok(/Consumo de filamento 290 g/.test(t), "painel: consumo de filamento = 290 g (consumo real + falha)");
  ok(/Lucro realizado R\$/.test(t) && /Lucro estimado R\$/.test(t), "painel: lucro estimado e lucro realizado");

  // Cancelar pedido libera a reserva e mantém o que foi consumido
  await p.goto(`${B}/pedidos/${o2}`);
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Cancelar pedido" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Cancelado"));
  ok((await p.locator('[data-testid="tarefa"]').innerText()).includes("Cancelado") && (await p.getByRole("button", { name: "Lançar recebimento" }).count()) === 0, "cancelar: tarefas encerradas e novos pagamentos bloqueados");
  await p.goto(B + "/");
  t = (await p.locator('[data-testid="indicadores-pedidos"]').innerText()).replace(/\s+/g, " ").replace(/ /g, " ");
  ok(t.includes("Valor de vendas (pedidos) " + money(121.5)) && /Atrasados 0/.test(t), "cancelado sai das vendas e dos atrasados");

  // Cadastro e edição de pedido manual (persistência) e exclusão
  await p.goto(B + "/pedidos/novo");
  await p.getByLabel("Nome", { exact: true }).fill("Caio Reis");
  await p.getByRole("button", { name: "Personalização" }).click();
  await p.locator('[data-testid="item-pedido"]').first().getByLabel("Personalização / serviço").fill("Chaveiro");
  await p.locator('[data-testid="item-pedido"]').first().getByLabel("Preço unit. (R$)").fill("12");
  await p.getByLabel("Forma de pagamento").selectOption("pix");
  await p.getByRole("button", { name: "Criar pedido" }).click();
  await p.waitForURL(/pedidos\/[0-9a-f-]{36}$/);
  const o3 = p.url().split("/").pop();
  await p.getByRole("link", { name: "Editar itens" }).click();
  await p.waitForURL(/editar/);
  await p.locator('[data-testid="item-pedido"]').first().getByLabel("Qtd.").fill("3");
  await p.getByRole("button", { name: "Salvar alterações" }).click();
  await p.waitForURL(new RegExp(`/pedidos/${o3}$`));
  await p.reload();
  t = await bodyTxt();
  ok(t.includes("Caio Reis") && t.includes(money(36)) && t.includes("Pix"), "pedido manual editado: 3 × R$ 12 = R$ 36 e forma de pagamento persistem");
  await p.locator('[data-testid="detalhes-pedido"] input[type=date]').fill("2099-12-31");
  await p.getByRole("button", { name: "Salvar prazo e observações" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Salvo."));
  await p.reload();
  ok((await p.locator('[data-testid="detalhes-pedido"] input[type=date]').inputValue()) === "2099-12-31", "prazo de entrega persiste");
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: "Excluir" }).click();
  await p.waitForURL(B + "/pedidos");
  ok(!(await bodyTxt()).includes("Caio Reis"), "pedido novo, sem produção, pode ser excluído");
  await shot(p, "pedidos-desktop");
  await p.goto(`${B}/pedidos/${o1}`);
  await shot(p, "pedido-detalhe-desktop");
  await p.goto(B + "/producao");
  await shot(p, "producao-desktop");
  await p.goto(B + "/filamentos/estoque");
  await shot(p, "estoque-desktop");

  // ── Exclusão de produto e logout ──
  await p.goto(`${B}/produtos/${suporteId}`);
  p.once("dialog", (d) => d.accept());
  await p.getByRole("button", { name: /Excluir Suporte de celular/ }).click();
  await p.waitForURL(B + "/produtos");
  ok(!(await main$()).includes("Suporte de celular"), "excluir produto funciona");
  await p.goto(`${B}/orcamentos/${q1}`);
  ok((await main$()).includes("Suporte de celular"), "excluir produto não apaga orçamentos já feitos (retrato preservado)");
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
  ok(alertText.includes("Bambu Lab A1 mini") && alertText.includes("Bambu Lab A1"), "ficha: avisa que o tempo foi estimado para OUTRA impressora (A1 mini × A1)");
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
  await p.getByRole("button", { name: /Salvar como produto|Atualizar produto/ }).click();
  await p.waitForSelector("text=Produto salvo no catálogo.");
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
  await p.getByRole("button", { name: /Salvar como produto|Atualizar produto/ }).click();
  await p.waitForSelector("text=Produto salvo no catálogo.");
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


  // ── Estoque de produtos (unidades prontas) e estoque de filamento dentro de Filamentos ──
  await p.goto(B + "/estoque");
  ok((await main$()).includes("Estoque de produtos") && (await p.locator('[data-testid="resumo-estoque-produtos"]').count()) === 1, "estoque: a tela principal agora é de PRODUTOS (unidades prontas)");
  ok((await p.locator('[data-testid="lista-estoque-produtos"] li').count()) >= 1, "estoque de produtos: lista os produtos cadastrados");
  const firstStock = p.locator('[data-testid="lista-estoque-produtos"] li').first();
  await firstStock.locator("input").fill("7");
  await firstStock.getByRole("button", { name: "Atualizar" }).click();
  await firstStock.getByText("Estoque atualizado").waitFor();
  await p.goto(B + "/estoque");
  ok((await p.locator('[data-testid="lista-estoque-produtos"] li').first().locator("input").inputValue()) === "7", "estoque de produtos: a quantidade é salva e continua depois de recarregar");
  await p.goto(B + "/filamentos");
  ok((await p.getByRole("link", { name: "Estoque de bobinas" }).count()) === 1, "filamentos: aba 'Estoque de bobinas' (o estoque de filamento fica dentro de Filamentos)");
  await p.getByRole("link", { name: "Estoque de bobinas" }).click();
  await p.waitForURL(/\/filamentos\/estoque$/);
  ok((await main$()).includes("Bobinas") || (await main$()).includes("bobinas"), "filamentos → estoque de bobinas abre");

  // ── Etapa 6: planos, assinatura e webhooks (simulador; nenhuma cobrança real) ──
  p.on("dialog", (d) => d.accept());
  await p.goto(B + "/planos");
  ok((await p.locator('[data-testid^="card-"]').count()) === 3, "página pública de planos mostra Gratuito, Pro e Business (preços vêm do banco)");
  const planosTxt = (await p.locator('[data-testid="planos"]').innerText()).replace(/\s+/g, " ");
  ok(/49,90/.test(planosTxt) && /99,90/.test(planosTxt), "planos: preços mensais exibidos em BRL");
  await p.goto(B + "/assinatura");
  ok((await p.locator('[data-testid="estado-assinatura"]').innerText()).includes("Em teste"), "Minha assinatura: conta nova começa em teste");
  ok((await p.locator('[data-testid="uso-limites"]').innerText()).length > 20, "Minha assinatura: mostra limites e consumo");
  // webhook inválido é recusado e não muda nada
  const whBad = await fetch(B + "/api/webhooks/billing", { method: "POST", headers: { "content-type": "application/json", "x-simulated-signature": "00" }, body: JSON.stringify({ events: [] }) });
  ok(whBad.status === 401, "webhook com assinatura inválida: 401");
  await p.goto(B + "/assinatura");
  ok((await p.locator('[data-testid="estado-assinatura"]').innerText()).includes("Em teste"), "webhook inválido não altera a assinatura");
  // contratar: o front sozinho NÃO ativa; só o webhook
  await p.goto(B + "/planos");
  await p.locator('[data-testid="plano-pro"]').click();
  await p.waitForURL(/assinatura\/simulador\//);
  await p.goto(B + "/assinatura");
  ok(!(await p.locator('[data-testid="estado-assinatura"]').innerText()).includes("Ativa"), "abrir o checkout não ativa o plano");
  await p.goBack();
  await p.getByRole("button", { name: "Simular pagamento aprovado" }).click();
  await p.waitForFunction(() => document.body.innerText.includes("Situação do checkout: pago"));
  await p.goto(B + "/assinatura");
  ok((await p.locator('[data-testid="nome-plano"]').innerText()).includes("Pro") && (await p.locator('[data-testid="estado-assinatura"]').innerText()).includes("Ativa"), "pagamento aprovado (webhook assinado) ativa o Pro");
  ok((await p.locator('[data-testid="historico-cobrancas"]').innerText()).includes("49,90"), "histórico de cobranças mostra o pagamento");
  const act = async (label, expectState) => {
    await p.goto(B + "/assinatura");
    await p.getByRole("button", { name: label }).click();
    // o painel some após o refresh (a situação muda), então confere a situação recarregando a página
    let got = "";
    for (let i = 0; i < 20 && !got.includes(expectState); i++) {
      await p.waitForTimeout(300);
      await p.goto(B + "/assinatura");
      got = await p.locator('[data-testid="estado-assinatura"]').innerText();
    }
    ok(got.includes(expectState), `${label} → ${expectState}`);
  };
  await act("Webhook duplicado", "Ativa");
  await act("Cobrança falhou", "Pagamento pendente");
  await act("Renovação paga", "Ativa");
  await act("Cancelamento no fim do período", "Cancelamento agendado");
  ok((await p.locator("main").innerText()).includes("Pro"), "cancelamento agendado mantém o Pro até o fim do período");
  await act("Cancelamento imediato", "Plano Gratuito");
  await p.goto(B + "/pedidos");
  ok((await p.locator("main").innerText()).includes("plano"), "recurso pago sem permissão: aviso de plano em Pedidos");
  await p.goto(B + "/produtos");
  ok(!(await main$()).includes("Nenhum produto"), "dados continuam acessíveis após o cancelamento (produtos preservados)");

  // ── Etapa 7: Superadmin (papel só por procedimento seguro; aqui o papel é alternado no Supabase falso) ──
  const setAdmin = (admin) => fetch(`http://127.0.0.1:${MOCK_PORT}/__set_admin`, { method: "POST", body: JSON.stringify({ admin }) });
  await setAdmin(false);
  const errorsBefore404 = errors.length;
  for (const path of ["/admin", "/admin/usuarios", "/admin/planos", "/admin/assinaturas", "/admin/cupons", "/admin/uso", "/admin/monitoramento", "/admin/auditoria", "/admin/configuracoes"]) {
    const r = await p.goto(B + path);
    if (r.status() !== 404 || (await p.locator('[data-testid="admin-main"]').count()) !== 0) ok(false, `usuário comum acessou ${path}`);
  }
  errors.splice(errorsBefore404); // os 404 acima são o resultado esperado (não são erros do app)
  ok(true, "usuário comum: todas as rotas /admin respondem 404");
  await p.goto(B + "/");
  ok((await p.locator("aside").getByRole("link", { name: "Administração" }).count()) === 0, "menu do cliente comum não mostra Administração");

  await setAdmin(true);
  await p.goto(B + "/");
  ok((await p.locator("aside").getByRole("link", { name: "Administração" }).count()) === 1, "superadmin vê o atalho Administração");
  await p.goto(B + "/admin");
  ok((await p.locator('[data-testid="mrr"]').innerText()).includes("91,48") && (await p.locator('[data-testid="recebido"]').innerText()).includes("548,90"), "visão geral: MRR (contratado) e recebido (efetivo) separados");
  ok((await p.locator('[data-testid="usuarios-total"]').innerText()).includes("7") && (await p.locator('[data-testid="distribuicao-planos"]').count()) === 1, "visão geral: usuários e distribuição por plano");
  await p.goto(B + "/admin?periodo=7d");
  ok((await main$()).includes("Últimos 7 dias"), "filtro de período");
  await p.goto(B + "/admin/usuarios");
  ok((await p.locator('[data-testid="linha-usuario"]').count()) === 1 && (await main$()).includes("nunca aparecem aqui"), "usuários: lista só com contagens (aviso de privacidade)");

  // plano: exige confirmação; preço novo aparece na página pública
  await p.goto(B + "/admin/planos");
  const pro = p.locator('[data-testid="plano-pro"]');
  await pro.getByLabel("Preço mensal (R$)").fill("39,90");
  await pro.getByRole("button", { name: "Salvar plano" }).click();
  await pro.getByText("Marque a confirmação").waitFor();
  ok(true, "plano: alteração sem confirmação é recusada");
  await pro.getByLabel("Confirmo:", { exact: false }).check();
  await pro.getByRole("button", { name: "Salvar plano" }).click();
  await pro.getByText("Plano atualizado").waitFor();
  await p.goto(B + "/planos");
  ok(/39,90/.test(await p.locator('[data-testid="card-pro"]').innerText()), "plano editado: novo preço na página pública");

  // cupom: criar, resgatar como cliente, uso único
  await p.goto(B + "/admin/cupons");
  await p.getByLabel("Código", { exact: false }).first().fill("bemvindo7");
  await p.locator('[data-testid="novo-cupom"]').getByLabel("Dias de acesso").fill("7");
  await p.locator('[data-testid="novo-cupom"]').getByLabel("Limite de usos", { exact: false }).fill("1");
  await p.getByRole("button", { name: "Criar cupom" }).click();
  await p.getByText("Cupom BEMVINDO7 criado").waitFor();
  await p.reload();
  ok((await p.locator('[data-testid="linha-cupom"]').first().innerText()).includes("BEMVINDO7"), "cupom criado aparece na lista");
  await p.goto(B + "/admin/auditoria");
  const audTxt = await main$();
  ok(audTxt.includes("cupom.criado") && audTxt.includes("plano.alterado"), "auditoria registrou a edição do plano e a criação do cupom");

  // configurações refletem na página pública
  await p.goto(B + "/admin/configuracoes");
  await p.getByLabel("E-mail de suporte").fill("suporte@printup.test");
  await p.getByRole("button", { name: "Salvar configurações" }).click();
  await p.getByText("Configurações salvas").waitFor();
  const diagTxt = await p.locator('[data-testid="diagnostico-pagamentos"]').innerText();
  ok(/BILLING_GATEWAY/.test(diagTxt) && /simulado/.test(diagTxt) && !/segredo-de-teste-local|chave-servidor-FALSA/.test(diagTxt), "diagnóstico de pagamentos aponta o que está errado e não vaza valores secretos");
  await p.goto(B + "/planos");
  ok((await p.locator("footer").innerText()).includes("suporte@printup.test"), "e-mail de suporte aparece no rodapé público");

  // cliente resgata o cupom (sem ser admin)
  await setAdmin(false);
  await p.goto(B + "/assinatura");
  await p.locator('[data-testid="resgatar-codigo"]').getByLabel("Tenho um código").fill("NAO-EXISTE");
  await p.getByRole("button", { name: "Aplicar código" }).click();
  await p.getByText("Código inválido ou expirado").waitFor();
  ok(true, "cupom inexistente: mensagem genérica");
  await p.locator('[data-testid="resgatar-codigo"]').getByLabel("Tenho um código").fill("bemvindo7");
  await p.getByRole("button", { name: "Aplicar código" }).click();
  await p.getByText("Código aplicado").waitFor();
  await p.reload();
  ok((await p.locator('[data-testid="estado-assinatura"]').innerText()).includes("Em teste"), "cupom resgatado: cliente fica em teste no plano do cupom");
  const errorsBefore404b = errors.length;
  await p.goto(B + "/admin");
  ok((await p.locator('[data-testid="admin-main"]').count()) === 0, "depois de perder o papel, /admin volta a 404");
  errors.splice(errorsBefore404b);

  require("node:fs").rmSync(fx.dir, { recursive: true, force: true });

  ok(errors.length === 0, "sem erros no console/página" + (errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""));
  await browser.close();
}

main()
  .catch(async (e) => {
    console.error("FALHA:", e.message.split("\n")[0]);
    const d = globalThis.__debug;
    if (d) {
      console.error("  URL:", d.p.url());
      console.error("  Tela:", (await d.p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400));
      console.error("  Alertas:", (await d.p.locator("[role=alert]").allInnerTexts().catch(() => [])).join(" | "));
      console.error("  Erros:", d.errors.slice(0, 3).join(" | "));
    }
    failures++;
  })
  .finally(() => {
    children.forEach((c) => {
      try { process.platform === "win32" ? c.kill() : process.kill(-c.pid); } catch { /* já encerrou */ }
    });
    require("node:fs").writeFileSync(TSCONFIG, tsconfigBackup);
    if (process.env.E2E_KEEP_BUILD !== "1") require("node:fs").rmSync(path.join(__dirname, "..", ".next-e2e"), { recursive: true, force: true });
    console.log(failures ? `\n${failures} verificação(ões) falharam` : "\nE2E OK");
    process.exit(failures ? 1 : 0);
  });
