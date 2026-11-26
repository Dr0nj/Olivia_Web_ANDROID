# Olivia Web (Android)

Projeto separado do Olivia desktop. Objetivo: operar o **LOW no cliente web** a partir do
**Android**, sem PC, sem JVM, sem `runtime.jar` e sem o launcher Windows.

> Estado: **funcionando em jogo real** (emulador + personagem logado): anti-bot armado,
> rota com laço, seguidor, sessão (xp/h, pontos, voltas, mortes), poções, painel nativo e
> retomada após reinjeção do driver. O `q` do detector fica em **16** (o embrulho que o
> próprio jogo instala); o bit 64 (ações sem entrada) não acende com a rota rodando.

## Por que é um projeto novo

O Olivia desktop é um **agente Java que se anexa à JVM do LOW** e conversa com classes
ofuscadas por reflexão. No navegador não existe JVM, nem `attach`, nem essas classes.

| Olivia desktop | Olivia web |
|---|---|
| Java + Swing + anexo na JVM | JavaScript na página + concha Android |
| Reflexão em classes ofuscadas | APIs públicas do cliente (`Red`, `J`, `Hud`) |
| Input via provedor de teclado do LOW | Mensagens JSON no WebSocket |
| Build amarrado ao hash do LOW | Amarrado à versão do `js/*.js` (muda toda semana) |
| Sem anti-cheat no caminho | **`Calidad`**: detector de automação embutido no `red.js` |

Zero linha de código reaproveitada. Reaproveitados: conceitos (rotas, waypoints, contadores
por sessão, humanização, painel) e o protocolo do anti-bot (`/ebr <id> <chave>`).

## O que o APK faz

- **WebView** em tela cheia, deitada, com serviço em primeiro plano e wake lock.
- **Driver JS** pequeno, injetado a cada navegação e reinjetado por watchdog; usa só
  `Red.enviar` e `Red.al` (nunca embrulha `WebSocket`, `JSON`, canvas, `addEventListener`
  nem métodos de `Red`).
- **Anti-bot**: responde “Não” na janela, com atraso de 0,7–1,6 s, contador por sessão e
  checkbox no painel. Modo ensaio disponível por console.
- **Rota**: waypoints em tiles (`[x,y]` ou `{x,y,pausaMs}`), chegada por posição real,
  timeout proporcional à distância, repetição ilimitada (“Repetir”), retomada após morte ou
  reinjeção (mesmo piso e mesmo personagem). **Rota** troca o hub por uma tela de rota no
  próprio painel: **Marcar aqui** enquanto anda, **Desfazer**, **Salvar…**, **Abrir…**
  (lista de rotas nomeadas), **Limpar**, **Iniciar** e **Voltar**.
- **Navegação** (regras trazidas do desktop):
  - ao **Iniciar**, começa pelo waypoint **mais próximo** da posição atual, não pelo ponto 0;
  - chegada exata; se parar a 1 tile e ficar parado ~0,6 s, conta como chegado;
  - depois de **2 tentativas** sem progresso, **pula** o waypoint e tenta o próximo;
  - **waypoint não andável** (checado em `mapa.caminable`) é pulado na hora;
  - se todos falharem, **espera 5 s e recomeça** (até 12 vezes) em vez de desistir;
  - **troca de piso** no meio da rota para o laço (o `ir` não sobe escada);
  - **progresso renova o prazo**: enquanto anda, não conta como travamento (só para de verdade);
  - a volta concluída limpa os pontos pulados e tenta todos de novo;
  - **Atraso…** no painel: pausa entre waypoints, **exata** ou **aleatória** (de/até, em
    segundos), com o `pausaMs` do ponto tendo prioridade.
- **Seguidor**: segue qualquer jogador (lista os visíveis por nome/ID), para a 1 tile e
  desiste se o alvo desaparecer por 5 s.
- **Sessão**: tempo, xp/h (XP absoluto, sem ficar negativo ao subir de nível), pontos,
  voltas, mortes, paradas, desafios respondidos/janelas.
- **Suprimentos**: poções de vida/mana, itens e ouro do inventário; consumo/hora e tempo
  restante estimado. “Itens” é a soma das quantidades na mochila (não os slots).
- **Repetir task/missões e coletar** (checkbox único):
  - **coleta** tarefas e missões concluídas (`cobrar` / `{t:"mision",id}`);
  - no popup **“Task complete”**, **repete a task que acabou de finalizar** (usa o `id` do
    popup), fecha o diálogo pela função interna (`_cerrar`, sem clique sintético) e envia
    `{t:"tarea", id, accion:"repetir"}`;
  - **aceita a missão bônus** (`{t:"bonus", accion:"aceptar", id}`) e fecha o popup;
  - desligado: a coleta e os popups ficam para você.
- **Humanização**: pausas longas de 8–20 s a cada 15–25 min (o seguidor não pausa).
- **Painel nativo** (fora do DOM, invisível para o detector): estado, contadores, vida,
  poções, botões Rota/Seguir/Parar, checkboxes “Responder «Não»” e “Repetir”, log de eventos.
- **Presença**: enquanto anda, o app envia pares de teclas Shift (eventos confiáveis) para
  o cliente ver entrada recente e não acender o bit 64.

## O que fica no servidor (de propósito)

Combate, cura e loot são do **Hunt Assist** do próprio LOW (`{t:"huntassist"}`).
Reimplementar seria retrabalho e mais exposição. O Olivia só anda, segue e responde.

## Estrutura

```
android/                      concha Android (Java puro, sem Gradle)
  app/src/main/AndroidManifest.xml
  app/src/main/java/web/olivia/MainActivity.java   WebView, ponte JS, watchdog, presença
  app/src/main/java/web/olivia/Painel.java         painel nativo + diálogos
  app/src/main/java/web/olivia/OliviaService.java  serviço em primeiro plano
  app/build/olivia-web.apk                         APK assinado (v2+v3)
driver/src/                   motor JS
  index.js                    entrada, persistência, retomada, ponte com o painel
  motor.js                    laço único (rota, seguidor, pausas, trechos de 6 tiles)
  rota.js                     waypoints, chegada, timeout, voltas
  seguidor.js                 seguir jogador
  sessao.js                   contadores por sessão
  humano.js                   pausas longas
  suprimentos.js              consumo de poções
  antibot.js                  resposta “Não” + contadores
  ponte.js                    único arquivo que conhece Red/J/Hud/EresBot
  painel.js                   painel DOM (modo userscript)
driver/tests/                 45 testes (node --test)
src/olivia-web.user.js        protótipo antigo (só anti-bot), superado por driver/ + dist/
tools/build.mjs               monta dist/olivia-web.user.js
tools/apk.ps1                 compila/assina o APK (aapt2 + javac + d8 + zipalign + apksigner)
tools/auditar-calidad.mjs     compara as regras do detector com o red.js publicado
tools/cdp-sessao.ps1           avalia JS no WebView via DevTools (PC + adb)
docs/ANALISE-CLIENTE-WEB.md   bits do Calidad, protocolo, consequências de projeto
docs/COMO-VALIDAR.md          roteiro de validação (q=16, rota, ensaio, retomada)
docs/PLANO-E-ESFORCO.md       arquitetura, fases e riscos
```

## Build

```powershell
node tools\build.mjs                     # gera dist/olivia-web.user.js
node --test driver\tests                 # 45 testes
powershell -ExecutionPolicy Bypass -File tools\apk.ps1
```

Requisitos do APK: JDK do Android Studio (`JAVA_HOME=...\Android Studio\jbr`),
`build-tools 36.1.0` e `platforms/android-36`. O APK sai em
`android/app/build/olivia-web.apk` (~53 KB), `minSdk 26`, `targetSdk 36`.

## Testar

1. Instale o APK e entre com usuário/senha (o cliente web não guarda a sessão).
2. Painel no canto superior esquerdo: marque **Repetir**, toque em **Rota** e cole os
   waypoints (ex.: `[[6,89],[12,89]]`).
3. Confira o log (`log`) e o `q` do detector com `Calidad.ping(Red.ws, Red)` — deve ficar
   em **16**.

Detalhes e diagnóstico em [docs/COMO-VALIDAR.md](docs/COMO-VALIDAR.md).

## Limites conhecidos

- O detector muda a cada deploy do jogo: rode `node tools/auditar-calidad.mjs` antes de
  cada sessão longa.
- `ir` só vale até 8 tiles no servidor; o motor anda em trechos de 6.
- O cliente web não persiste login: recarregar a página pede senha de novo (ele mesmo
  recarrega a cada ~10 min para atualizar versão e restaura a sessão por `sessionStorage`;
  o driver reinjeta e retoma a rota).
- Sem teste de seguidor com um segundo personagem real até agora (só testes de unidade).
- Rota é única e salva; ainda não há perfis nomeados como no desktop.
- Automação pode gerar banimento; o projeto trata o detector como requisito, não detalhe.
