# Validação ao vivo — 26/11/2026

Emulador `Medium_Phone_API_36.1` (1080×2400, landscape), Android 16, WebView Chromium.
Conta: `Bugonovisk` (nível 1), servidor Calma. APK `android/app/build/olivia-web.apk`.

## 1. Concha e painel

| item | resultado |
|---|---|
| tela deitada | OK (`sensorLandscape`) |
| painel nativo atualizando | OK, sem "estado inválido" |
| vida/mana/nível | `nv 1 · vida 150/150 · mana 50/50` |
| poções | `15 vida · 30 mana · 1045 itens` (bate com `Hud.inv.mochila`) |
| botões Rota/Seguir/Parar + checkboxes | OK; "Repetir" marcado por padrão |
| log de eventos | abre lista com hora + evento (limpar/fechar) |

## 2. Estado do jogo (fonte certa)

- posição real vem de `J.ents.get("j"+J.miId)`; `J.yo` é o retrato do login e não anda.
- vida/mana/exp vêm de `Hud.yo`; `exp` é do nível, então o XP absoluto é
  `expNivel + exp` (`expSig` = próximo nível).
- inventário: `Hud.inv.mochila` com `{objeto, cant, nombre}`; poções por nome
  (`Small Health Potion`, `Small Mana Potion`).

## 3. Rota e laço

Rota de teste `[[6,89],[12,89]]`, repetir ligado, 150 s:

- **27 voltas**, `pontos 153 → 158`, `voltas` da sessão 75 → 80;
- painel: `ponto 2/2 · volta 29 · andando`;
- `ir` em trechos de 6 tiles (`6,89` → `12,89`), sem repetir o mesmo destino enquanto anda;
- descoberta ao vivo: **o servidor ignora `ir` a mais de 8 tiles** (Chebyshev). 8 anda, 9 não.
  Por isso o motor divide em trechos de 6.

## 4. Detector (`Calidad`)

- Baseline do cliente legítimo: **`q = 16`** (o próprio jogo embrulha `Red.enviar` em
  `js/aparatoid.js`).
- Antes da correção: depois de ~15 `ir` sem entrada, `q = 80` (bit 64 = ações sem
  tecla/clique/toque nos últimos 2 s).
- Correção: enquanto há rota/seguidor, o `MainActivity` envia um par de teclas **Shift**
  (evento confiável, ignorado pelo jogo) a cada ~1,2 s.
- Depois da correção: **150 s de rota contínua, 27 voltas, `q = 16` em todas as 50
  amostras** e 124 keydowns confiáveis (≈1 a cada 1,2 s).
- `q = 80` não apaga sozinho; o teste tem que ser em página recém-carregada.

## 5. Anti-bot em ensaio

```
Olivia.antibot.definirEnsaio(true)
Olivia.antibot.aoReceber({id:"teste-1", b:[{tx:"Sí",k:"1"},{tx:"No",k:"2"}]})
```

Resultado no log: `antibot_ensaio id=teste-1 k=2` — leu os botões e escolheu "No".
`janelas` subiu para 1 (a janela foi vista), `responsiveis` ficou 0 (ensaio não envia).
Ensaio desligado depois com `definirEnsaio(false)`.

## 6. Seguidor

`Olivia.seguir(123456)` (ID inexistente): `seguir_inicio` → `seguir_perdeu` em ~5 s →
`parada:alvo_perdido`. Caminho de perda validado; falta testar com um segundo personagem
real visível.

## 7. Persistência

- Rota, índice, volta e contadores da sessão são gravados em `localStorage`
  (`ovw.rota.estado`, `ovw.sessao`) a cada 3 s.
- Depois de recarregar o driver, `sessao_retomada` devolveu `duracaoMs`, pontos e voltas.
- **Parar de propósito não retoma** (`ativa:false` no armazenamento; conferido 5 s depois).
- Retomada exige mesmo personagem e mesmo piso; senão registra `rota_nao_retomada`.
- O próprio cliente web recarrega a página para atualizar versão (`js/versionweb.js`,
  `CADA = 10 min`) e guarda a sessão em `sessionStorage["low.vweb.llevar"]`. Durante os
  testes isso aconteceu de verdade: a página recarregou, o driver foi reinjetado sozinho,
  a sessão voltou e **a rota continuou da volta 20 para a 22** sem intervenção.

## 8. Segundo plano

- `onPause` → o driver suspende o laço; `onResume` → retoma (o alvo é reenviado).
- Teste: rota na volta 20 → HOME por 18 s → voltar → volta 22, `q = 16`.
  Nenhum bit 512 (página oculta com ações).

## 9. Waypoints e rotas nomeadas no painel

- **Rota** troca o hub pela **tela de rota** dentro do próprio painel (sem popup): o jogo
  continua visível e jogável, e dá para andar e tocar em **Marcar aqui** sem fechar nada.
- **Desfazer** remove o último ponto; **Salvar…** grava com nome; **Abrir…** lista as rotas
  com **Usar / Apagar / Cancelar**; **Limpar** zera; **Iniciar** volta ao hub já andando;
  **Voltar** volta ao hub sem iniciar.
- Verificado no emulador: marquei 2 pontos andando pelo mapa, iniciei a rota (3 pontos,
  `q=16`), parei e voltei ao hub.
- **Voltar** do Android minimiza o app em vez de sair do personagem (a sessão do cliente
  web não sobrevive a uma navegação para trás).

## 10. Prêmios (tarefas e missões) — histórico

> Histórico: a **coleta foi removida na 0.7.0** porque o `cobrar` competia com o popup de
> repetição e fechava a task. Hoje o Olivia só repete a task do popup e aceita o bônus.
> O texto abaixo registra o que foi validado antes da remoção.

- Tarefa concluída (`Hud.listaTareas` com `estado 2`) → `{t:"tarea", id, accion:"cobrar"}`.
- Missão concluída (`Hud.listaMisiones` com `estado 2`) → `{t:"mision", id}`.
- Coleta automática ligada por padrão (checkbox **Coletar prêmios**), 6 s entre lotes,
  até 3 tentativas por id.
- Ao vivo: 2 missões concluídas (Gold 250/250 e EXP 150/150) foram coletadas sozinhas;
  log `missao_coletada` ×2; ouro 766 → 1.094 e nível 6 → 7.
- “Itens” no painel = soma das quantidades na mochila (flechas contam), não slots.
- **Aceitar** missão nova não é automatizado: a oferta vem no diálogo do NPC; o Olivia
  só coleta o que já está completo.

## 11. Navegação (regras do desktop no web)

- **Começa pelo waypoint mais próximo**: rota `[[109,97],[89,117],[92,100]]` com o
  personagem em `(89,97)` → `rota_inicio` com `indice:2`, `proximo:92,100`.
- **Pula ponto inválido**: `(109,97)` não era andável na cave → `rota_ponto_invalido` e
  seguia para o próximo; `pulados:[0]`.
- **Laço e volta** continuaram (volta 1, 2...) e `q` ficou **16**.
- Regras no driver: chegada exata ou a 1 tile parado 0,6 s; pulo após 2 tentativas sem
  progresso; espera 5 s × 12 quando não há caminho; troca de piso para o laço; a volta
  limpa os pulados.
- Contador de coleta já marcava **4 coletados** na sessão depois da correção.

## 12. Atraso, progresso e popup de tarefa

- **Diagnóstico do “parado com status andando”**: o log mostrava `rota_repetir` a cada
  ~5 s mesmo com o personagem andando 10+ tiles (as posições mudavam entre os eventos).
  O prazo da perna era só por tempo; ao esgotar, o motor pulava pontos e podia cair em
  `rota_sem_caminho` (5 s parado, `esperas`). Correções: **progresso renova o prazo**
  (`desde`/`limite`), o estado `esperando` aparece no topo do painel e a linha `pausa`
  mostra o tempo restante da espera.
- **Atraso entre waypoints** (porta do `WaypointPauseSettings` do desktop): config no
  painel **Atraso…**, **exato** (`ms`) ou **aleatório** (`minMs`–`maxMs`), 0–60 s; o
  `pausaMs` do ponto vence. Validado com 1,5 s exato: `atrasoConfig` =
  `{modo:"exato", ms:1500}` e as voltas espaçadas no log.
- **Popup “Tarefa completa”**: simulei o evento `tareaRepetir` (id 999). O cliente criou o
  diálogo, o Olivia fechou (`#hud .lo-dlg` = 0), registrou `tarefa_completa` e enviou
  `{t:"tarea", id:999, accion:"repetir"}` (+1 envio). Checkbox **Repetir task completa**
  no painel; desmarcado envia `terminar`.
- **Pacote único “Repetir tasks e aceitar missões”** (0.7.0): a coleta foi **removida**.
  Motivo: o `cobrar` da coleta competia com o popup de conclusão e fechava a task em vez de
  repetir. Agora só existe `repetir` (task do popup) e `aceptar` (bônus). Ao vivo, o popup
  real “Task complete: Bats (3/9 today)” voltou para `estado 1` ao repetir; com o switch
  ligado, `tareaRepetir` → +1 envio e `bonusOferta` → +1 envio, diálogos fechados; desligado,
  0 envios. Nenhum `accion:"cobrar"` nem `{t:"mision",id}` é enviado pelo Olivia.
- **Anti-bot real**: o painel mostrou `desafio 1/1` com uma janela real do servidor,
  respondida sozinha. Logs: `tarefa_completa`, `bonus_aceito`, `antibot_resposta`.
- `q` continuou **16**.

## 13. Anti-bot: resposta real (não só ensaio)

Simulei a janela do servidor com `Red.recibir({t:"eresBot", id:"teste-olivia-...", seg:20, b:[Sí,No]})`.
Resultado: `Olivia.sessao.snapshot().antiBot` = 1, `janelas` = 1, log `antibot_resposta`,
`EresBot.esperando` = true e a janela sumiu (0 botões). O caminho é o do botão do jogo:
`EresBot.tocar("2")` → `{t:"chat", canal:"local", texto:"/ebr <id> 2"}`. Ou seja, o
“Responder «Não»” funciona de verdade, não só no ensaio.

## 14. Configurações, gráfico e ícone (0.8.0)

- **⚙ Configurações** substitui o hub (como no desktop): **Pausas humanas** (checkbox) e
  **Atraso entre waypoints…** (mesmo diálogo exato/aleatório), **Voltar**.
- Pausa humana: liga/desliga no driver (`Olivia.pausaHumana`), persistida em
  `localStorage.ovw.pausaHumana`; o motor deixa de pausar quando desligada.
- **Gráfico**: sparkline nativo de xp/h (5 min) no topo do hub, com cartão arredondado,
  degradê, grade e ponto atual. Sem DOM (o detector não vê).
- **Ícone**: `navigator-pixel.ico` do desktop (boneco no carrinho) convertido para as 5
  densidades (`mipmap-*`), confirmado no `aapt2 dump badging`.
- Validado no emulador: tela de configurações abriu, checkbox alternou e refletiu no estado,
  gráfico desenhou a curva da sessão.

## 15. Reorganização e novos recursos (0.9.0)

- **Hub**: Rota / Seguir jogador / Parar; **Resetar sessão** e **log**. Os interruptores
  saíram do hub para **⚙ Configurações** (anti-bot, repetir rota, tasks, pausas humanas,
  reconectar, atraso e otimizar área). “web” removido; “tempo” virou “sessão atual”.
- **Seguir jogador**: página com a lista real (na hora: `Javi (3000066 · 4 sqm)`),
  distância 0–8 sqm e botões Atualizar/Seguir/Parar. Teste ao vivo: alvo 3000066, sqm 2 →
  `modo:"seguir"`, `seguir_inicio`, personagem colado no alvo.
- **Reconexão**: watcher a cada 5 s (tenta a cada 15 s) com contador; estado inicial
  `{ligado:true,tentativas:0,sucessos:0}`. Não interfere no WS aberto.
- **Otimizar ataque em área**: enviou/ajustou o Hunt Assist; verificado no cliente:
  `Asistente.aa = {on:true, cerca:true, modo:2}` e log `area_otimizada`. Modo 2 = “mais
  juntos”, a mesma escolha do `AreaAttack` (alvo com mais monstros no círculo), preservando
  a lista de skills.
- **Repetir task**: a ação agora é enviada **antes** de fechar o diálogo (sem espera);
  log `tarefa_completa`.
- `q` continuou **16**.

## 16. Pendências

- Seguidor com segundo personagem real (posicionamento e parada a 1 tile).
- Morte no mesmo piso → retomada (teste de unidade cobre; falta ao vivo).

## 17. Ajustes 0.9.1 (seguir 0 e área)

- **Seguir 0 = em cima**: o `ir` do servidor não entra no tile ocupado por outro jogador
  (testado: `{t:"ir"}` para o tile do Javi não moveu). O último sqm passou a ser `{t:"dir"}`
  (o passo do joystick), um passo por vez, soltando com `parar` em 240 ms. Ao vivo: de
  (90,105) para (85,105), exatamente o tile do Javi; `q` continuou **16**.
- **Área com o círculo da skill**: `driver/src/area.js` porta o `AreaAttack` do desktop
  (raio 2,5 = diâmetro 5, centrado no alvo; janela 7x5; +2 monstros para trocar; 3 s de
  espera). Oito testes novos cobrem contagem no círculo, empate, janela e histerese. O alvo
  é aplicado por `Pelea.poner`/`objetivo` e o auto-alvo do Hunt Assist fica
  `cerca=false`; as skills continuam as do Hunt Assist. No emulador o checkbox ligou e
  desligou, `Asistente.aa` ficou `{on:true,cerca:false,modo:2}` e `q` seguiu **16**.
- **Configurações roláveis**: o conteúdo cresceu e o **Voltar** saía da tela; o corpo agora
  é um `ScrollView` com altura limitada. Testado com swipe: **Voltar** apareceu em
  `[1650,967][1777,1023]`.
- **Pendente ao vivo**: escolha de alvo em área com monstros reais (o mapa estava sem
  monstros no momento do teste); a lógica pura está coberta pelos testes.