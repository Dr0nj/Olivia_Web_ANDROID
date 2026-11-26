# Plano e esforço — Olivia Web (Android)

Base: análise de `docs/ANALISE-CLIENTE-WEB.md`. Esforço em **dias de trabalho focados**,
uma pessoa, já com o spike feito.

## Arquitetura recomendada

```
┌──────────────────── APK Android (Kotlin) ────────────────────┐
│  WebView (Chromium)  ──  LOW web (lowmmorpg.com/juego)       │
│      ▲                                                        │
│      │ evaluateJavascript / @JavascriptInterface              │
│  Driver JS (mínimo, sem patch)                                │
│      • assina Red.al('eresbot')  → responde "Não"             │
│      • lê J.yo / Hud.inv / Hud.datos                          │
│      • envia Red.enviar({t:'ir',x,y}) sob demanda             │
│      ▲                                                        │
│  Serviço de primeiro plano + WAKE_LOCK + notificação          │
│  Painel nativo (Compose): rotas, contadores, log              │
└───────────────────────────────────────────────────────────────┘
```

Por quê assim:

- **WebView** é o único caminho que roda no aparelho, em primeiro plano, com controle de
  tela/serviço e sem depender de loja de extensões.
- O **driver JS fica pequeno** de propósito: cada linha a mais é superfície para o `Calidad`.
- O **painel é nativo**: não aparece no DOM do jogo (bits 8/128) e sobrevive a reload.

Alternativa de menor esforço para começar: userscript no Firefox Android/Kiwi (é o que está
em `src/`). Serve para validar comportamento; não serve como produto (sem serviço, sem
wake lock, sem controle de tela).

## Fases

| Fase | Entrega | Esforço | Confiança |
|---|---|---|---|
| F0 | Spike do cliente web (feito) | 0,5–1 d | ✅ feito |
| F1 | Anti-bot no browser + contador por sessão + painel discreto | 2–4 d | alta |
| F2 | Concha APK: WebView, foreground service, wake lock, tela cheia, reinstalação do driver em cada navegação | 5–8 d | alta |
| F3 | Rotas: carga dos waypoints, `ir`/`parar`, detecção de chegada, anti-travamento, retomada | 8–12 d | média |
| F4 | Follow, leitura de inventário/supplies, log de eventos, contadores do painel | 5–8 d | média |
| F5 | Endurecimento contra `Calidad` + validação de longa duração | 5–10 d | **baixa** |

- **MVP útil (F0–F2): 8–13 dias.** É "o Olivia do celular" no sentido que mais importa:
  responde anti-bot sozinho, fica de pé, mostra estado.
- **Paridade razoável (F0–F4): 20–32 dias.**
- **F5 não é opcional para uso contínuo**, e é a fase com estimativa menos confiável porque
  depende de thresholds do servidor que não estão no código.

## O que NÃO está no escopo

- Combate, cura e loot: o LOW web já tem Hunt Assist **no servidor** (`{t:"huntassist"}`).
  Reimplementar seria retrabalho e mais exposição.
- Reimplementar o protocolo/cripto: usamos o cliente real; o `sello` HMAC continua sendo
  respondido por ele.
- Rodar em segundo plano no celular: bit 512 + Doze tornam isso inviável. A tela fica ligada.

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| `Calidad` marcar bit 64 em rotas longas | alto | validar com CDP trusted input, toque real mantido ou lotes com pausa; medir `q` no WS |
| `Calidad` mudar a cada deploy do jogo | alto | teste automatizado que baixa `red.js` e compara as regras com a nossa lista |
| Ban de conta | alto | conta de teste primeiro; sessões curtas; acompanhar `q` |
| Chrome Android não aceita extensão | médio | APK WebView (F2) é o caminho de produto |
| WebView antigo/OEM | médio | exigir WebView atualizado; fallback `minSdk` alto |
| `VersionWeb` recarregar no meio da rota | médio | driver reinjeta e restaura estado de rota do armazenamento nativo |

## Critério de aceite mensurável

O `ping` carrega `q` (bitmask). O próprio cliente instala um embrulho em `Red.enviar`, então
o baseline de um cliente legítimo é **`q === 16`**. Aceite: **30 min de operação com `q === 16`**
(sem os bits 32/64/128/512) e o contador batendo com o número de janelas respondidas.
Isso é observável no DevTools (WS frames) e vira teste de regressão.

## Observação legal

O LOW é servidor de fãs e tem regras próprias; automação pode gerar banimento. Este projeto
assume esse risco explicitamente e por isso trata o detector como requisito de primeira
classe, não como detalhe.
