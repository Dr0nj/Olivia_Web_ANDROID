# Estado atual — Olivia Web Android

**Versão:** 0.9.9
**Data:** 2026-11-27
**Commit:** release v0.9.9
**Release:** https://github.com/Dr0nj/Olivia_Web_ANDROID/releases/tag/v0.9.9
**APK:** `android/app/build/olivia-web.apk` (149 KB)

## Validado

- **143 testes** (`node --test driver/tests`) e auditoria `Calidad` sem violações.
- **Seguir 0 = mesmo tile**: validado ao vivo no emulador; de `(90,105)` para `(85,105)`,
  o tile exato do alvo. `q=16`.
- **Área**: checkbox liga/desliga; Hunt Assist fica `{on:true,cerca:false,modo:2}`;
  log `area_otimizada`; `q=16`. **Falta validar a troca de alvo com monstros reais.**
- **Configurações roláveis**: corpo em `ScrollView`; Voltar acessível
  (`uiautomator`: `[1650,967][1777,1023]`).
- **Repetir task**: envio do pacote oficial, fechamento do `#aviso-tarea` e contagem só
  depois da confirmação no `Hud.listaTareas`; handler reassinado após o `DOMContentLoaded`.
- APK 0.9.6 gerado e assinado; **falta o teste ao vivo no emulador/celular**.

## Mudanças da 0.9.9 (detalhe de suprimentos)

1. O cartão **SUPRIMENTOS** do hub virou clicável (`SUPRIMENTOS ›`) e abre uma aba com
   o mesmo visual.
2. A aba mostra a **previsão total** e, por item, o cálculo: quantidade, gasto/h,
   loot/h, saldo/h e tempo até acabar (ou `loot repõe`, `esgotado`, `sem gasto`).
3. O tempo da visão geral continua sendo o **menor** entre os itens consumidos.

## Mudanças da 0.9.8 (trem removido)

1. **Trem removido** do mobile, igual ao desktop em 27/11: parado no meio da rota, o
   cerco fechava em 2–3 s e causava mortes. O personagem continua andando; o ponto de
   caça marcado (`hunt`) segue funcionando normalmente.
2. Campo **“Trem: N+ monstros”** saiu do dialog **Caça…** do APK e do painel da página.
   Configurações antigas com `cacaTremMobs`/`tremMobs` são ignoradas.
3. Visão geral mantém **Level** e **Waypoint** da 0.9.7.

## Mudanças da 0.9.7 (suprimentos)

1. **Estimativa por item**: vida e mana são medidas separadamente, com saída
   (gasto) e entrada (loot) acumuladas na janela de 10 min.
2. **Tempo restante pelo saldo líquido**: se o loot repõe o gasto, o card mostra
   `loot repõe` em vez de ficar eternamente em `coletando`; se sobrar consumo
   líquido, mostra a previsão de término.
3. **Quantidade visível**: o detalhe do card mostra `V <vida> · M <mana>`.
4. Compra/depósito grande (>20 de uma vez) reinicia a medição daquele item.
5. **Re-target por distância** (desligado por padrão): se o alvo atual passar de X sqm,
   escolhe o monstro mais próximo. A otimização de área tem prioridade quando as duas
   estão ligadas.
6. Visão geral: `nv` virou **Level** e `ponto` virou **Waypoint**.
7. Ainda **não instalado nos emuladores**; aguardando teste ao vivo.

## Mudanças da 0.9.6 (repetição de task)

1. **Assinatura robusta**: o driver espera o `DOMContentLoaded` (quando os scripts
   síncronos já rodaram) e usa `garantirHandler` para recolocar
   `tareaRepetir`/`bonusOferta` sem duplicar. O `vb03.js` substitui o array inteiro de
   `Red.manejadores.tareaRepetir`; a assinatura feita antes dele não vale.
2. **Popup correto**: o cliente atual usa `#aviso-tarea` (`_quitar`), não `.lo-dlg`
   (`_cerrar`). O Olivia fecha o aviso e só cai para `.lo-dlg` se o aviso não existir.
3. **Confirmação**: a task só entra no contador quando volta para estado 1/3, o
   contador de vezes aumenta ou o progresso de mortes zera. Sem confirmação em 5 s,
   registra `tarefa_nao_confirmada` e não conta.
4. **Sem duplicidade**: a mesma conclusão recebida de novo dentro do prazo é fechada
   sem um segundo `{t:"tarea", accion:"repetir"}`.
5. **Falha de envio**: se `Red.enviar` falhar, o aviso fica aberto, não conta e registra
   `tarefa_repetir_falhou`.
6. **Menu**: `#aviso-tarea` também pausa os comandos enquanto estiver aberto.

## Mudanças da 0.9.1

1. **Seguir 0**: `ir` não entra no piso ocupado por outro jogador; o último sqm usa
   `{t:"dir"}` (passo do joystick), com `parar` em 240 ms e novo passo a cada 650 ms.
2. **Área**: `driver/src/area.js` porta o `AreaAttack` do desktop (raio 2,5 = diâmetro 5;
   janela 7×5; +2 monstros; 3 s). Alvo via `Pelea.poner`/`{t:"objetivo"}`; Hunt Assist
   com `cerca=false`; skills/poções preservadas.
3. **Configurações**: `ScrollView` com altura limitada; o novo checkbox de área fez o
   Voltar sair da tela e isso foi corrigido.

## Mudanças da 0.9.2

1. **Ponto de caça**: porta do `HuntSpotSettings` + `LongRouteSession` do desktop.
   Waypoint marcado (`hunt`) exige o sqm exato, para, segura até sobrar até N monstros
   no raio e a mana mínima, confirma por 1,5–3 s, respeita mínimo/teto e sai sem pular.
2. **Trecho de caça**: caminho travado depois do ponto espera abrir no lugar (até 4
   esperas). **Trem**: removido na 0.9.8, como no desktop (parado, o cerco fechava).
3. **UI**: botão **Ponto de caça** e dialog **Caça…** no APK; marcação/config no painel
   da página. Configuração fica em `ovw.caca` / prefs `caca*`.

## Mudanças da 0.9.5

1. **RTC sempre ligado** (opcional): religa o Hunt Assist via `Asistente.aa.on` +
   `Asistente.mandarAA()`. Só age quando o RTC está desligado, respeita menus abertos
   e entra em backoff após 3 recusas.
2. **Automação suspensa com a página oculta** (`visibilitychange`): para `ir`, área e
   demais ações, retomando ao voltar à tela. Logs `automacao_suspensa`/`automacao_retomada`.
3. Opção no APK e no painel de página; configuração persistente.

## Mudanças da 0.9.4 (desvio de monstro)

1. **`desvio.js`**: quando o personagem fica ~1 s sem sair do sqm, procura um passo
   lateral andável (`mapa.caminable`) que aproxime do waypoint, evitando monstros
   próximos e células já tentadas. Ainda é um passo por vez, não uma rota completa.
2. **Motor**: o desvio reinicia o prazo do trecho (`destravar`) e não deixa o caminho
   virar duas tentativas e `rota_pulou`. Logs `rota_desvio`/`rota_desvio_fim`.
3. **Limite**: sem passo lateral seguro (corredor fechado), continua valendo o
   comportamento antigo de esperar/pular. O port completo do `WallMemory` do desktop
   ainda não foi feito.
4. **UI do hub**: status grande (`ANDANDO`/`PAUSA`/`STOPPED`/`CAÇANDO`), ponto atual
   com posição, nível, volta e tempo; cartões de XP/h, XP da sessão, gold coletado,
   previsão de suprimentos, tasks, anti-bot, stamina e voltas. Vida/mana e gráfico
   removidos do hub; Rota/Seguir jogador/Iniciar rota/Parar ficam na mesma linha e o
   **Log** fica no rodapé fixo. O painel ocupa toda a lateral útil do celular deitado,
   mantendo o fundo e os contornos arredondados.
5. **RTC sempre ligado** (opcional): se `Asistente.aa.on` estiver falso, usa
   `Asistente.mandarAA()` (mesma API do botão RTC) para religar. Respeita menu aberto,
   não reenvia se já está ligado e entra em backoff após 3 recusas do servidor.

## Mudanças da 0.9.3 (performance)

1. **Watchdog sem reinjeção em menu**: o APK só reinjeta o driver depois de 15 s sem
   estado **e** de uma sonda barata (`window.Olivia` + `data-ovw`). Antes, um menu
   pesado que segurava o JS por >6 s fazia o app jogar ~100 KB de driver na thread
   principal, piorando o travamento em cascata.
2. **Pausa de interface**: opções/inventário/RTC/task abertos (`MenuLow`, `Hud.ventanaTipo`,
   `#ventana`, `#vmenu`, `.lo-dlg`, `#aviso-tarea`) pausam comandos, presença Shift,
   varredura de área e persistência. Ao fechar, retoma o mesmo ponto; caça reinicia o relógio.
3. **Menos trabalho periódico**: `passoArea` e `guardarRota` não rodam com menu aberto;
   a presença Shift só é enviada enquanto existe `ir` recente.
4. **Voltar do segundo plano** (`onPause`/`onResume`) reinicia o prazo do trecho: o tempo
   minimizado não conta como “sem progresso” e não dispara `rota_pulou`. O APK também
   religa o laço se o estado chegar com `rodando=false` em primeiro plano.

## Seguir knight (onda)

- Checkbox **Seguir knight (onda 4 sqm)** na tela **Seguir jogador** do APK e no painel da
  página. Fica ligado/desligado na hora, sem reiniciar o seguir.
- Posição fixa a **4 sqm** do alvo, na mesma linha/coluna: o knight fica no centro do 3x3
  da área real `1,1,3,3,3`; os dois sqm retos ficam atrás dele, entre o knight e o Olivia.
- O lado é escolhido pela última direção do knight (fica atrás) e pelos monstros que o
  feixe acerta; troca com **+2 monstros** de vantagem, no máximo 1x/s.
- Ao chegar na vaga, vira para o alvo com `{t:"pc",k:"xd",d:{a}}` (a mesma tecla
  Ctrl+seta do cliente). A vaga bloqueada em `mapa.caminable` é descartada.
- Código: `driver/src/onda.js` (geometria + escolha), `seguidor.js` (modo), `motor.js`
  (giro), `ponte.js` (`girar`) e os dois painéis. Testes: `onda.test.mjs`,
  `seguidor.test.mjs`, `motor.test.mjs` e integração do bundle.
- **Não dispara magia.** O Hunt Assist/Energy Surge continua sendo quem ataca.

## Pendências

- Validar o **ponto de caça** em hunt real: chegada exata, limpeza, mana e teto.
- Validar a escolha de alvo da **área** em um hunt real (log `area_alvo`).
- Testar no **celular** do usuário.
- Testar a **reconexão** com uma queda real de WebSocket.
- Portar os **cartões grandes** do painel desktop (XP ganho, gold, tasks, reconexões,
  stamina, “task atual”).
- **Piso por rota** no Android (hoje para na troca de piso).
- O modo PvP do jogo ficou em “Attack none and ignore click on players” após um teste;
  reverter se o usuário usava outro. O Hunt Assist ficou desligado; a área o liga ao ser
  marcada.

## Como validar

```powershell
cd projects\Olivia_Web_ANDROID
node --test driver\tests
node tools\auditar-calidad.mjs
powershell -ExecutionPolicy Bypass -File tools\apk.ps1
```

Roteiro completo: `docs/COMO-VALIDAR.md`. Evidências da sessão 0.9.0/0.9.1:
`docs/VALIDACAO-2026-11-26.md` (seção 17).

## Memória operacional (Repo_IA)

- Contexto: `memory/projects/Olivia_Web_ANDROID/project-context.md`
- Handoff: `memory/projects/Olivia_Web_ANDROID/handoff.md`
- Notas de build/emulador/CDP: `memory/projects/Olivia_Web_ANDROID/working-notes.md`
- Releases: `memory/projects/Olivia_Web_ANDROID/releases.md`
- Sessão: `memory/conversations/2026-11-27-olivia-web-android-0.9.1.md`
- Decisão seguir 0/área:
  `memory/decisions/2026-11-27-olivia-web-android-seguir-0-e-area.md`
- Know-how: `memory/knowledge/olivia-web-android-operacao.md`
