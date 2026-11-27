# Olivia Web (Android)

Projeto separado do Olivia desktop. Objetivo: operar o **LOW no cliente web** a partir do
**Android**, sem PC, sem JVM, sem `runtime.jar` e sem o launcher Windows.

> Estado: **funcionando em jogo real** (emulador + personagem logado): anti-bot armado,
> rota com laço, seguidor, sessão (xp/h, pontos, voltas, mortes), poções, painel nativo e
> retomada após reinjeção do driver. O `q` do detector fica em **16** (o embrulho que o
> próprio jogo instala); o bit 64 (ações sem entrada) não acende com a rota rodando.
>
> **Estado detalhado:** `docs/ESTADO-ATUAL.md`. **Memória operacional no Repo_IA:**
> `../../memory/projects/Olivia_Web_ANDROID/` (contexto, handoff, build/emulador e
> releases).

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
- **Ponto de caça** (mesmas regras do `HuntSpotSettings`/`LongRouteSession` do desktop):
  - marque um waypoint como **Ponto de caça** (objeto `{x,y,hunt:true}` ou `[x,y,"h"]`);
  - ao chegar, **pisa no sqm exato**, para e segura até sobrar até **“sair com”** monstros
    no raio configurado, com a **mana mínima**; depois espera 1,5–3 s para confirmar;
  - respeita o **mínimo parado** e o **teto de segurança** (sai mesmo sem limpar);
  - ao sair, o trecho até o próximo waypoint é **trecho de caça**: caminho travado
    **espera abrir no lugar** em vez de pular (até 4 esperas);
  - a regra antiga de **“trem”** foi **removida** (como no desktop em 27/11): parado, o
    cerco fechava em 2–3 s;
  - configuração em **Caça…** (APK) ou **Ponto de caça** (modo página): livre em sqm,
    mínimo, teto, mana e sair com N monstros.
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
- **Seguidor (Seguir jogador)**: página própria com a lista dos jogadores por perto
  (nome, id e distância) e a **distância em sqm** (0 = mesmo tile, até 8). O personagem
  acompanha o alvo e para na distância escolhida; desiste se o alvo sumir por 5 s.
  **Distância 0 sobe no mesmo tile**: o `ir` do servidor não entra no piso ocupado por outro
  jogador, então o último sqm é feito com `{t:"dir"}` (o mesmo passo do joystick), um passo
  curto de cada vez, soltando com `parar` antes do tile seguinte. Testado ao vivo: o
  personagem ficou exatamente em cima do alvo (`85,105` = `85,105`).
- **Seguir knight (onda)**: checkbox no seguir. Em vez de ir até o alvo, fica **4 sqm**
  dele na mesma linha/coluna, com o knight no **centro do 3x3** da onda (`1,1,3,3,3`).
  Escolhe o lado pela última direção do knight (fica atrás) e pelos monstros que o feixe
  acerta; troca de lado com **+2 monstros** de vantagem e vira para o alvo com
  `{t:"pc",k:"xd"}`. Só posiciona: **não dispara magia**. Liga/desliga sem reiniciar o
  seguir e a escolha é refeita no máximo 1x/s.
- **Sessão**: “sessão atual” (tempo), xp/h (XP absoluto, sem ficar negativo ao subir de
  nível), pontos, voltas, mortes, paradas, desafios respondidos/janelas. **Resetar sessão**
  zera os contadores.
- **Suprimentos**: poções, runas e outros consumíveis da mochila; consumo/hora e tempo
  restante estimado pelo **saldo líquido** (gasto menos loot). O cartão do hub mostra
  apenas a previsão até o **primeiro supply acabar**; **toque nele** para abrir a aba
  **Suprimentos**, com a mesma tabela do desktop: **Supply**, **Restantes**,
  **Saídas/min** e **Duração**. “Itens” é a soma das quantidades na mochila (não os slots).
- **Repetir tasks e aceitar missões** (checkbox único):
  - no popup **“Task complete”**, **repete a task que acabou de finalizar** (usa o `id` do
    popup), fecha o popup pela função interna e envia
    `{t:"tarea", id, accion:"repetir"}` — o mesmo pacote do botão oficial, sem clique
    sintético;
  - fecha tanto o aviso compacto atual (`#aviso-tarea`, `_quitar`) quanto o diálogo
    antigo (`.lo-dlg`, `_cerrar`);
  - **só conta a task depois que o servidor confirma** que ela voltou para “em andamento”
    (estado 1/3) ou que o contador de vezes/progresso mudou; se não confirmar em 5 s,
    registra `tarefa_nao_confirmada` e não infla o painel;
  - o handler é reassinado depois do `DOMContentLoaded` e no ciclo periódico, porque o
    cliente substitui `Red.manejadores.tareaRepetir` no `vb03.js`;
  - **aceita a missão bônus** (`{t:"bonus", accion:"aceptar", id}`) e fecha o popup;
  - **não coleta nada**: sem `cobrar` e sem resgatar missão (o resgate competia com a
    repetição e fechava a task);
  - desligado: os popups ficam para você.
- **Desvio de monstro**: se ficar ~1 s sem sair do sqm enquanto tenta andar, testa um
  passo lateral andável evitando os monstros próximos, reinicia o prazo do trecho e
  continua; não pula o waypoint só porque um mob está na frente. Logs `rota_desvio`/`rota_desvio_fim`.
- **Hub**: status da rota (`ANDANDO`/`PAUSA`/`STOPPED`/`CAÇANDO`) com waypoint e posição,
  nível, volta e tempo; cartões de XP/h, XP da sessão, gold coletado, previsão de
  suprimentos (**clique para o detalhe por item**), tasks repetidas, anti-bot, stamina e
  voltas. Vida/mana e gráfico saíram da tela principal.
- **RTC sempre ligado** (opcional em ⚙): se o jogo desligar o Hunt Assist, o Olivia
  religa usando `Asistente.aa.on` + `Asistente.mandarAA()` — a mesma API do botão RTC.
  Não interfere com o menu do jogo aberto e entra em backoff se o servidor recusar.
- **Re-target por distância** (desligado por padrão): se o alvo atual passar de X sqm,
  escolhe o monstro mais próximo. A **otimização de área tem prioridade** quando as duas
  estão ligadas.
- **Menus do jogo**: ao abrir opções/inventário/RTC/task, o Olivia **pausa os comandos**
  e para de varrer monstros/persistir estado; ao fechar, retoma o mesmo ponto. O watchdog
  do APK **não reinjeta mais o driver** enquanto a thread JS está ocupada num menu — era
  isso que transformava menus pesados em travamento.
- **Humanização**: pausas longas de 8-20 s a cada 15-25 min (o seguidor não pausa).
- **Configurações (⚙ no cabeçalho)**: tela separada com os interruptores **Responder
  «Não»**, **Repetir a rota (laço)**, **Repetir tasks e aceitar missões**, **Pausas
  humanas**, **Reconectar automaticamente**, **Atraso entre waypoints…** (exato/aleatório),
  **Caça…** (ponto de caça), **Manter RTC ligado**, **Re-target por distância** e
  **Otimizar ataque em área**. **Voltar** retorna ao hub.
- **Reconexão**: se o WebSocket cair em jogo, tenta `Red.conectar()` a cada 15 s e conta
  tentativas/sucessos (mesma ideia do AutoReconnect do desktop).
- **Ataque em área**: **Otimizar ataque em área** (checkbox em ⚙) é a mesma lógica do
  `AreaAttack` do desktop: o círculo de **5 sqm (raio 2,5)** é medido em volta de cada
  monstro candidato, não do personagem. Escolhe o alvo que cobre mais monstros, só considera
  alvos na janela **7×5** que o jogo segura, exige **+2 monstros** para trocar e **segura o
  alvo por 3 s**; empate não troca. O alvo é aplicado pelo próprio cliente
  (`Pelea.poner`/`{t:"objetivo",monstruo:id}`) e o auto-alvo do Hunt Assist fica desligado
  (`cerca=false`) para não sobrescrever a escolha. As skills/poções do Hunt Assist seguem
  intactas.
- **Recolher (≡)**: minimizado fica só **“Olivia ≡”** numa pílula no canto; tocar de novo
  restaura o painel completo (252 dp na lateral).
- **Arrastar**: segure a faixa do cabeçalho (onde está “Olivia”) e arraste para qualquer
  canto, aberto ou recolhido; a posição fica salva e é restaurada ao abrir.
- **Gráfico**: sparkline nativo de **XP/h dos últimos 5 min** no topo do hub (cartão
  arredondado, área com degradê, grade e ponto atual).
- **Ícone**: o mesmo do Olivia desktop (o boneco no carrinho), em todas as densidades.
- **Painel nativo** (fora do DOM, invisível para o detector): estado, contadores, vida,
  poções, gráfico, botões **Rota / Seguir jogador / Parar**, **Resetar sessão** e **log**.
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
  rota.js                     waypoints, chegada, timeout, voltas, ponto de caça
  caca.js                     regras do ponto de caça (HuntSpotSettings do desktop)
  onda.js                     seguir knight: área 1,1,3,3,3 e escolha da vaga
  seguidor.js                 seguir jogador / seguir knight
  sessao.js                   contadores por sessão
  humano.js                   pausas longas
  suprimentos.js              consumo de poções
  antibot.js                  resposta “Não” + contadores
  ponte.js                    único arquivo que conhece Red/J/Hud/EresBot
  tarefas.js                  repetição de task + confirmação no HUD
  painel.js                   painel DOM (modo userscript)
driver/tests/                 144 testes (node --test)
dist/olivia-web.user.js       userscript gerado (única versão suportada)
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
node --test driver\tests                 # 144 testes
powershell -ExecutionPolicy Bypass -File tools\apk.ps1
```

Requisitos do APK: JDK do Android Studio (`JAVA_HOME=...\Android Studio\jbr`),
`build-tools 36.1.0` e `platforms/android-36`. O APK sai em
`android/app/build/olivia-web.apk` (~137 KB), `minSdk 26`, `targetSdk 36`.

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
