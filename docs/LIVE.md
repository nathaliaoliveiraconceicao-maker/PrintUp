# PrintUp Live — arquitetura, segurança e conectores

Estado: **Fase 1 (contratos e documentação)**. Nenhuma tabela, rota, tela ou conector real existe ainda.
Código desta fase: `src/features/live/` (tipos, catálogo, schemas de telemetria/comando — tudo puro e testado).

## 1. Problema central

O PrintUp roda na Vercel (funções serverless). Elas não mantêm WebSocket/MQTT abertos e não alcançam IPs de rede
local (`192.168.x.x`). Expor a impressora na internet é proibido. Logo:

```
Impressora ──(rede local)──► Conector local ──HTTPS de saída──► PrintUp (ingestão) ──► Supabase ──Realtime──► Dashboard
                                   ▲                                                      │
                                   └─────── comandos confirmados (fila; o conector busca) ◄┘
```

- O **conector local** é um programa na rede do usuário. Só faz conexões **de saída** (nada escuta na internet).
- **Credenciais da impressora** (chave de API, código de acesso) ficam **só no conector**. A nuvem guarda metadados e o
  hash do token do conector. O frontend nunca recebe chave nem endereço local.
- A interface só mostra o que o adaptador declarou suportar.

## 2. Matriz de capacidades (fonte: `adapters/catalog.ts`)

Níveis: `verificado` (testado em equipamento real) · `documentado` (consta na documentação oficial, sem teste em
equipamento) · `experimental` (só fontes não oficiais) · `a_confirmar` · `nao_suportado`.

| Capacidade | OctoPrint | Moonraker/Klipper | Bambu Lab (LAN) |
|---|---|---|---|
| status | documentado | a_confirmar | experimental |
| progresso | documentado | a_confirmar | experimental |
| temperaturas | documentado | a_confirmar | experimental |
| camada | a_confirmar (plugin) | a_confirmar | experimental |
| câmera (foto) | documentado | documentado | experimental |
| câmera (vídeo) | documentado | documentado | experimental |
| pausar / retomar / cancelar | a_confirmar | a_confirmar | **não suportado** |

**Na Fase 1 nada está `verificado`.** Regras impostas por código e teste:
- Comando remoto só é oferecido com nível `verificado` (documentação sozinha não basta) **e** confirmação do usuário.
- Bambu é somente leitura e `experimental_nao_verificado`. Subir de nível exige teste em impressora real, versionado.
- Valor desconhecido é `null`; nunca inventamos dado.

### Evidências e ressalvas (conferidas em 2026-11-16)
- **OctoPrint** — [Job](https://docs.octoprint.org/en/main/api/job): `GET /api/job`, `POST /api/job {"command":"start"}`;
  `GET /api/printer`; chave no cabeçalho `X-Api-Key`. Câmera em `/api/settings` (`webcam.streamUrl`/`snapshotUrl`),
  que a versão 2.0 muda para várias câmeras ([Settings](https://docs.octoprint.org/en/main/api/settings.html)).
  **A conferir (Fase 3):** push em tempo real, campo de filamento, comandos pausar/cancelar.
- **Moonraker** — [notificações](https://moonraker.readthedocs.io/en/latest/external_api/jsonrpc_notifications/):
  WebSocket JSON-RPC, `printer.objects.subscribe`, `notify_status_update`;
  [webcams](https://moonraker.readthedocs.io/en/latest/external_api/webcams/): `server.webcams.list`.
  **A conferir (Fase 3):** objetos exatos de status/progresso/temperatura, autenticação, comandos.
- **Bambu Lab** — [portas](https://wiki.bambulab.com/en/general/printer-network-ports) (MQTT 8883 no modo LAN; a
  própria página diverge sobre a porta do vídeo), [Developer Mode](https://blog.bambulab.com/updates-and-third-party-integration-with-bambu-connect/)
  (abre MQTT, vídeo e FTP; opcional; a Bambu diz não dar suporte; comandos passam por um fluxo de autorização fechado).
  O formato das mensagens e a porta da câmera por modelo vêm de fontes de terceiros (engenharia reversa).

## 3. Protocolo conector ↔ PrintUp (`telemetry.ts`)

- **Telemetria** (`telemetryEnvelopeSchema`): `{ v:1, printerId, seq, state }`. O servidor revalida tudo (limites
  numéricos, estados conhecidos, texto limpo) e ignora `seq` repetido ou fora de ordem.
- **Autenticação do conector (Fase 2):** token longo por conector, mostrado uma vez; só o hash fica no banco; revogável.
  Ingestão por função `SECURITY DEFINER` com `EXECUTE` revogado de `public`/`anon`, chamada só pelo servidor.
- **Frequência:** grava só se mudou e passou 3 s, ou como batimento a cada 30 s (`shouldWrite`).
- **Dado velho:** ≤ 20 s "ao vivo", ≤ 90 s "atrasado", acima disso "desatualizado" → a impressora aparece "sem sinal",
  mesmo que o último estado dissesse "conectada" (`freshness`, `connectionIndicator`).
- **Comandos** (`commandRequestSchema`): `pause | resume | cancel`, `confirm: true` obrigatório, chave de
  idempotência, validade de 120 s. Vão para uma fila; o conector busca (saída) e executa só o que o adaptador declarou.
  Todo pedido e resultado entram no log de auditoria imutável.

## 4. Câmera
- O endereço da câmera é conhecido só pelo conector. Na nuvem, o realista é **quadro a cada 5–10 s** enviado a um
  bucket privado (`<user_id>/…`, URL assinada de curta duração) — "quase tempo real", não vídeo contínuo.
- Vídeo contínuo: só dentro da rede local, ou numa fase futura (WebRTC/relay).

## 5. Integração financeira (Fase 2+)
- Sessão de impressão (`live_sessions`) vinculada a `production_jobs` e ao cálculo (`pricings`).
- Tempo efetivo: medido pelo conector. Material: só se a fonte informar (mm de filamento), senão fica em branco.
- **Energia sempre "estimada"**: `power_watts` × tempo × `energy_price_per_kwh`. Não há medição real.
- Custo real × previsto reaproveita `features/orders/financials.ts`; falhas usam `report_failure`.
- Nada altera estoque por conta própria: baixa de filamento continua só pelas funções SQL existentes.

## 6. Monitoramento por IA (Fase 7, opcional)
- Desligado por padrão; opt-in explícito com aviso de privacidade (imagens saem para um serviço externo; LGPD).
- A detecção é **probabilística e não substitui supervisão humana**; gera alerta e registro, nunca interrompe a
  impressão sem ação confirmada do usuário.

## 7. Modelo de ameaças (resumo)
| Ameaça | Mitigação |
|---|---|
| Vazar dados de outro usuário | RLS `user_id = auth.uid()` em toda tabela + teste SQL; autorização por impressora |
| Chave da impressora exposta | Fica só no conector; nunca vai ao banco nem ao navegador |
| Conector falso envia dados | Token por conector (hash), revogável; revalidação Zod; `seq` |
| Comando indevido | Confirmação, validade de 120 s, idempotência, capacidade `verificado`, auditoria imutável |
| Replay de comando antigo | Expiração + chave idempotente |
| Texto malicioso na telemetria | `cleanText`, limites numéricos, nada executado |
| Exposição de portas | Arquitetura só de saída; documentação orienta a nunca abrir portas |
| Dado velho mostrado como atual | `freshness` + indicador "sem sinal" |

## 8. Fases
1. **Contratos e documentação** (esta) ✔
2. Banco, cadastro, token do conector, plano/limites, RLS e testes SQL
3. Conector local + OctoPrint e Moonraker (conferir os itens "a conferir")
4. Painel mobile e Realtime (conferir limites do Supabase Realtime por plano)
5. Bambu Lab (experimental, somente leitura)
6. Câmera (quadros), notificações e histórico
7. IA opcional
8. Testes de segurança, desempenho e compatibilidade

Decisões pendentes do dono do produto: arquitetura de conector local, câmera "quase tempo real", impressoras reais
para validação e forma de instalação do conector (Windows ou Raspberry Pi/Docker).
