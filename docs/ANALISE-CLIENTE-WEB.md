# Análise do cliente web do LOW

Inspeção feita em 26/11/2026 sobre o cliente público (`https://lowmmorpg.com/juego/`), sem
login. Tudo abaixo veio dos arquivos servidos pelo próprio site.

## 1. Stack

- HTML + CSS + **JavaScript puro**, sem framework, sem bundler e **sem ofuscação**.
- ~120 arquivos `<script src="js/*.js?v=...">` carregados na ordem, todos em escopo global.
- Canvas 2D (`#mundo`) + HUD em DOM.
- Comunicação: **WebSocket JSON** em `wss://<host>/juego/ws` (ou `/juego/ws/pvp`).
- O site é um projeto de fãs; a conta é por OAuth (Google/Apple/Discord) ou usuário/senha.

## 2. Objetos globais úteis

| Global | Origem | Serve para |
|---|---|---|
| `Red` | `js/red.js` | `Red.enviar(msg)`, `Red.al(evento, fn)`, `Red.ws`, `Red.personaje` |
| `J` | `js/juego.js` | estado do jogo: `J.yo`, `J.ents`, `J.enJuego`, `J.destino`, `J.zonaProtegida` |
| `Hud` | `js/hud.js` | `Hud.yo`, `Hud.inv`, `Hud.datos` (objetos/hechizos), `Hud.enviar` |
| `Pelea` | `js/pelea.js` | alvo atual, `Pelea.siguiente()` |
| `Asistente` | `js/asistente.js` | Hunt Assist (auto-cura, auto-ataque, auto-loot) |
| `EresBot` | `js/eresbot.js` | janela anti-bot: `EresBot.m`, `EresBot.tocar(k)` |
| `VersionWeb` | `js/versionweb.js` | recarrega a página sozinha quando o jogo atualiza |
| `Calidad` | `js/red.js` | **detector de automação** (ver §5) |

## 3. Protocolo (tipos vistos no código)

Envio (`Red.enviar`): `login`, `elegir`, `ir`, `parar`, `pc`, `dir`, `usar`, `skill`,
`objetivo`, `recoger`, `chat`, `sesion`, `huntassist`, `sello`, `ping`, `empujar`, `tarea`,
`equipar`, `tirar`, `bonus`, `revivir`, `hd`.

Recebimento: as mesmas tags + `hola`, `personajes`, `yo`, `error`, `pong`, `eresBot`.

### Movimento

```js
Red.enviar({ t: "ir", x, y });   // anda até o tile
Red.enviar({ t: "parar" });      // interrompe
Red.enviar({ t: "pc", k: "xd", d: { a } }); // gira (0..3)
```

`{t:"ir", x, y}` é **destino absoluto em tiles** — não é clique em pixel nem pathfinding
no cliente. Rotas de waypoints são viáveis mandando tile a tile.

### Anti-bot (idêntico ao do desktop)

Servidor manda `{t:"eresBot", id, b:[{tx,k}], seg, texto, ...}`. O cliente responde:

```js
Red.enviar({ t: "chat", canal: "local", texto: "/ebr " + id + " " + k });
```

É exatamente o `/ebr <id> <chave>` que o Olivia desktop já responde. O botão "Não" é um item
de `b` com `tx` = `No`/`Não`. `chat` **não** entra na lista de ações que o detector pondera.

### Integridade

`sello`: desafio HMAC-SHA256 (`{t:"sello", n, i}` → `{t:"sello", k, i, f}`) com chaves
embutidas no `red.js`. Não precisa reimplementar: o próprio cliente responde.

### Hunt Assist

`{t:"huntassist", ...}` configura no **servidor** auto-ataque, auto-cura e auto-loot. Ou seja:
combate/sustento já existem no jogo e **não precisam ser reescritos** no Olivia web.

## 4. `VersionWeb` (recarga automática)

O cliente compara os `?v=` dos scripts a cada 10 min e se recarrega quando o jogo atualiza.
Qualquer injeção precisa sobreviver a navegação/reload (`run-at document-start` ou
`evaluateJavascript` em cada `onPageStarted`).

## 5. `Calidad` — o detector (o verdadeiro escopo do projeto)

Fica no topo do `red.js`. Acumula um bitmask (`bits`) e envia em **todo ping**:

```js
{ t:"ping", n, ms?, q: bits, c: envios, w: descrição, f: teclas, h: hash do aparelho }
```

Ou seja: o servidor recebe um diagnóstico contínuo. Bits conhecidos:

| Bit | Dispara quando |
|---|---|
| 1 | UA com `Electron/`, `LowBot`, `engines-bot` |
| 2 | `window.process`, `require`, `module`, `__dirname`, `Buffer` (Electron/Node) |
| 4 | propriedades globais com `electron`, `ipcrenderer`, `lowbot`, `enginesbot` |
| 8 | elemento suspeito em `#menu-arriba`, painel com nome de bot, ou cor `#ECEE91` / `#1e1816` |
| 16 | **embrulho** em `WebSocket`, `WebSocket.send`, `JSON.stringify/parse`, `fillText/strokeText`, `Function.toString`, `addEventListener` ou em `Red.*` |
| 32 | **3+ eventos sintéticos** (`isTrusted === false`) |
| 64 | 15+ ações de `{skill,usar,recoger,ir}` **sem** tecla/toque nos últimos 2 s (razão ≥30%) |
| 128 | elemento no `body` com 2+ textos de painel de bot (`low bot`, `cavebot`, `waypoints`, `perfis/profiles`, `cambiar target`) |
| 256 | nome pintado diferente do nome que o servidor mandou |
| 512 | 5+ ações com a página **oculta** (`document.hidden`) por mais de 1,5 s |
| 1024 | fingerprint de navegador inconsistente (só desktop) |
| 2048 | 8+ teclas reais sem foco da página (só desktop) |

### Consequências de projeto

1. **Nada de monkey patch.** Não envolver `WebSocket`, `send`, `JSON`, canvas,
   `Function.prototype.toString`, `addEventListener` nem métodos de `Red`.
   Usar apenas `Red.al` e `Red.enviar` (API pública) — foi assim que o protótipo foi escrito.
2. **Nada de `dispatchEvent`.** Evento sintético conta e três já marcam. Ações devem ir por
   `Red.enviar`, ou por toque real (CDP/`Input.dispatchTouchEvent` gera `isTrusted: true`).
3. **Página visível.** Bit 512 exige tela acesa e browser em primeiro plano. Rodar em
   segundo plano no celular marca o bit.
4. **Ritmo.** Rotas longas mandam muitos `ir` sem input → bit 64. Precisa de estratégia
   (input confiável via CDP, ou manter um toque real ativo, ou lotes curtos com pausas).
5. **Interface discreta.** Painel fora de `#menu-arriba`, sem as cores do Olivia desktop,
   sem juntar 2+ palavras da lista de painéis (`waypoints`, `perfis`, `cavebot`...).
6. **Atualização é hostil.** O `red.js` muda quase toda semana (`?v=2026112x`). Cada deploy
   pode trazer regra nova; a auditoria do `Calidad` precisa ser repetível.

## 6. O que o Olivia desktop empresta

Reaproveitável como **conceito/regra**, não como código:

- formato de rota e os 72 waypoints já levantados;
- contador por sessão (resetar em "Resetar sessão" e troca de personagem);
- atraso aleatório de 700–1600 ms para responder o anti-bot;
- semântica do `/ebr` (idêntica);
- esquema de log de eventos (`events.jsonl`);
- layout do painel (métricas, status, contador).

Não reaproveitável: `PortableAttach`, `AgentBootstrap`, `agent.cpp`, `NavigatorAgent`,
`Pruebas`, `InputBridge`, `KeyChord`, todo o Swing e o build amarrado ao manifesto do LOW.
