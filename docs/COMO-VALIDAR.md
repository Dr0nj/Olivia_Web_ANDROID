# Como validar o Olivia (APK Android)

Objetivo: provar três coisas.

1. O driver responde à janela anti-bot (e só a ela).
2. As ações do bot **não acendem** o bit 64 do detector (`q` fica em 16).
3. Rota, laço, seguidor, sessão e painel contam certo.

Use **conta de teste** se possível.

---

## 0. Baseline do `q` (importante)

O próprio jogo instala um embrulho em `Red.enviar` (`js/aparatoid.js`), então **`q = 16`
é o estado normal de um cliente legítimo** neste mapa. Não é flag nossa.

| bit | valor | significado |
|---|---|---|
| 16 | 16 | embrulho em `Red.*` (o do próprio jogo) — esperado |
| 32 | 32 | eventos sintéticos (JS) — **nunca deve aparecer** |
| 64 | 64 | 15+ ações (`ir`/`skill`/`usar`/`recoger`) sem tecla/clique nos últimos 2 s |
| 128 | 128 | texto/cores de painel de bot no DOM (o painel nativo não entra) |
| 512 | 512 | página oculta >1,5 s durante ações |
| 1024 | 1024 | parecer Electron/Chromium sem marca |
| 2048 | 2048 | teclas reais com a página sem foco |

Aceite da rota: **`q === 16`** do começo ao fim. Se virar **80** (64 + 16), o bit 64
acendeu — o bot está mandando `ir` sem entrada confiável. O bit não apaga até recarregar
a página, então o teste precisa de uma sessão limpa.

Como o APK mantém a janela: enquanto há rota/seguidor ativo, o `MainActivity` envia um
par de teclas **Shift** (evento confiável) a cada ~1,2 s. O jogo ignora Shift sozinho e o
detector passa a ver entrada recente. Sem isso, 15 `ir` seguidos acendem o 64.

---

## 1. Instalar (2 min)

1. `android/app/build/olivia-web.apk` (assinado v2+v3, minSdk 26).
2. `adb install -r android/app/build/olivia-web.apk` ou copie para o aparelho e instale.
3. Abra **Olivia**. O jogo abre em tela deitada; o painel nativo fica no canto superior
   esquerdo (não é DOM: o detector não vê).
4. Entre com usuário e senha. O cliente web **não guarda a sessão**: recarregar a página
   pede login de novo (o botão `web` do painel avisa antes).

---

## 2. Conferir estado e contadores (1 min)

Painel deve mostrar: “sessão atual”, xp/h, pontos, voltas, mortes, nível, vida, mana, poções,
desafio e o **gráfico de xp/h dos últimos 5 min**. No cabeçalho: **⚙** (Configurações) e
**≡** (recolher). O hub tem **Rota**, **Seguir jogador**, **Parar**, **Resetar sessão** e
**log**.

Em **⚙**:
- **Responder «Não»**, **Repetir a rota (laço)**, **Repetir tasks e aceitar missões**;
- **Pausas humanas** (8–20 s a cada 15–25 min; não vale no seguir);
- **Reconectar automaticamente** (WebSocket, tenta a cada 15 s);
- **Atraso entre waypoints…**: exato ou aleatório, `de`/`até` em segundos (0–60);
- **Otimizar ataque em área**: Hunt Assist em “mais juntos” + alvo próximo;
- **Voltar**.

**Seguir jogador** (página): lista os jogadores por perto com id e distância; escolha um,
defina a **distância em sqm** (0 = mesmo tile) e toque em **Seguir**. **Parar** encerra.

**Seguir knight (onda)**: marque o checkbox na mesma página. A distância vira **4 sqm** e
o Olivia fica na vaga da onda, com o knight no centro do 3x3. Para conferir: o log mostra
`seguir_onda`; ao chegar, o estado fica `seguindo <id> · onda` e o cliente recebe
`{t:"pc",k:"xd",d:{a:...}}` uma vez a cada ~1,2 s. Com monstros em volta do knight, o
lado escolhido deve apontar o feixe para o bando; o log `area_alvo` continua sendo do
Hunt Assist, não deste modo. Desmarque para voltar ao seguir normal.

Pelo PC, com o WebView depurável (já habilitado):

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$sock = (& $adb shell cat /proc/net/unix | Select-String 'webview_devtools_remote').ToString()
$nome = [regex]::Match($sock,'@(webview_devtools_remote_\d+)').Groups[1].Value
& $adb forward tcp:9222 localabstract:$nome
```

```powershell
$u = ((Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:9222/json').Content |
      ConvertFrom-Json | Where-Object { $_.type -eq 'page' })[0].webSocketDebuggerUrl
powershell -ExecutionPolicy Bypass -File tools\cdp-sessao.ps1 -WsUrl $u -Expr "JSON.stringify(Olivia.estado())"
```

---

## 3. Rota em laço (5 min)

No painel: **Rota** — o painel troca para a **tela de rota** (não é popup; o jogo continua
visível e jogável). Para voltar, **Voltar**.

**Montar os pontos**

1. Ande com o joystick/tap e toque em **Marcar aqui** a cada canto.
2. O contador no topo mostra quantos pontos já tem; o campo mostra o JSON (`[x,y]`).
3. O último ponto deve ficar perto do primeiro para a volta fechar; para pausa num ponto,
   edite-o como `{"x":123,"y":96,"pausaMs":5000}`.
4. Para **ponto de caça**, toque em **Ponto de caça** (marca o sqm atual) ou edite como
   `{"x":123,"y":96,"hunt":true}`. Em **Caça…** ajuste raio livre, mínimo, teto, mana,
   “sair com” monstros e trem. Ao chegar, o personagem para e só sai depois de limpar
   (ou do teto), sem pular o waypoint.
5. **Iniciar** volta ao hub e começa a andar em trechos de até 6 tiles (o servidor ignora
   `ir` a mais de 8). Ao chegar no último ponto, começa a volta de novo (`volta` sobe).

**Guardar e escolher rotas**

- **Salvar…** → dá um nome (ex.: `scorpion`), grava no aparelho e volta ao hub.
- **Abrir…** → lista as rotas salvas; toque numa para **Usar**, **Apagar** ou **Cancelar**.
- **Limpar** esvazia o campo e a última rota.
- **Desfazer** remove o último ponto marcado.
- A última rota usada também é recarregada ao abrir a tela de rota.

Esperado no painel: `desafio 0/0 · ponto i/N · volta n · andando`; `pontos` sobe a cada
waypoint e `voltas` a cada laço.

**Regras de navegação (iguais às do desktop, adaptadas ao `ir`)**

- **Iniciar** escolhe o waypoint **mais próximo** da posição atual. O log mostra
  `rota_inicio` com `indice` e `proximo:`.
- Chegada exata; se parar a 1 tile e ficar parado ~0,6 s, também conta (`chegou perto`).
- **2 tentativas** sem progresso → **pula** o ponto (`rota_pulou`) e vai ao próximo.
- Ponto **não andável** (`mapa.caminable`) é pulado na hora (`rota_ponto_invalido`).
- Se **todos** falharem: `rota_sem_caminho`, espera 5 s e recomeça a volta (até 12 vezes).
- Se o personagem **mudar de piso** no meio, para (`rota_piso_mudou`) — `ir` não sobe escada.
- Volta concluída limpa os pulados e tenta todos de novo.
- **Ponto de caça** (`hunt`) exige o sqm exato, para (`parar`) e segura até o raio ficar
  livre/mana ok, confirma 1,5–3 s e respeita mínimo/teto. Log: `caca_inicio`/`caca_fim`.
- **Trecho de caça** travado espera no lugar (até 4 vezes) em vez de pular; **trem**
  (N+ monstros a até 4 sqm por 1,5 s) também caça no lugar.

**Atraso entre waypoints**

- **Atraso…** (na tela de rota) → **Ativar atraso** → escolha **Aleatório** ou deixe exato.
- No modo exato vale o campo **de**; no aleatório, sorteia entre **de** e **até** (0 a 60 s).
- O `pausaMs` do ponto (ex.: `{"x":10,"y":10,"pausaMs":5000}`) vence a config global.
- O resumo aparece ao lado do botão: `1,5 s fixo` ou `1,0–3,0 s`.

Medir o `q` no fim (não em laço, cada chamada consome `f`/`w`):

```js
Calidad.ping(Red.ws, Red)
```

Esperado: `{"q":16,...}`. Se vier 80, ver §0.

---

## 4. Prêmios: tarefas e missões (2 min)

O painel tem **Repetir tasks e aceitar missões** (ligado por padrão). Esse único switch:
repete a task que finalizou (popup) e aceita a missão bônus. **Não coleta nada** — de
propósito: o `cobrar` competia com a repetição e fechava a task.

Para conferir a coleta manual, use o próprio jogo (Tarefas/Missões); o Olivia não mexe.

**Popup “Tarefa completa” (Repetir/Terminar)**

Com **Repetir tasks e aceitar missões** ligado, quando o cliente abre o popup o Olivia
**repete a task que acabou de finalizar** (usa o `id` do popup), fecha o diálogo pela função
interna e envia `{t:"tarea", id, accion:"repetir"}` — sem clique sintético (não acende o
bit 32). O log mostra `tarefa_completa`.

O popup de **missão bônus** também é aceito sozinho (`{t:"bonus", accion:"aceptar", id}`) e
o log mostra `bonus_aceito`. Com o switch desligado, os popups ficam para você.

## 5. Anti-bot em ensaio (2 min) — e o teste real

Ensaio (não envia):

Sem esperar o servidor perguntar:

```js
Olivia.antibot.definirEnsaio(true);
Olivia.antibot.aoReceber({ id: "teste-1", seg: 30,
  b: [{ tx: "Sí", k: "1" }, { tx: "No", k: "2" }] });
```

Esperado em ~1 s: evento `antibot_ensaio` no **log** do painel e no console
(`[Olivia] ensaio: responderia id=teste-1 chave=2`).

Para valer de novo: `Olivia.antibot.definirEnsaio(false)`.

**Teste real (mesmo caminho do botão “No”)**

Simule uma janela do servidor e veja a resposta sair de verdade:

```js
Red.recibir({ t: "eresBot", id: "teste-olivia-1", seg: 20,
  b: [{ tx: "Sí", k: "1" }, { tx: "No", k: "2" }] });
```

Esperado em 0,7–1,6 s:

- o Olivia chama o próprio `EresBot.tocar("2")` → envia `{t:"chat", canal:"local", texto:"/ebr teste-olivia-1 2"}`;
- `Olivia.sessao.snapshot().antiBot` sobe 1 e `janelas` sobe 1;
- log `antibot_resposta` com `id` e `chave=2`;
- a janela some (sem botões).

Teste real: deixe rodando até aparecer a janela; o painel deve mostrar
`desafio 1/1` (respondidas/janelas) sem você tocar em nada.

---

## 6. Persistência e retomada (3 min)

1. Com a rota rodando, espere ~5 s e derrube o driver sem recarregar a página:
   no console, `Olivia.motor.encerrar()` — o painel para de atualizar e o `vigiar()`
   reinjeta em até ~6 s.
2. Esperado: log `sessao_retomada` + `rota_inicio` com `origem: "retomada"`; a rota
   continua do ponto salvo e os contadores não zeram.
3. Se você apertar **Parar** de propósito, a rota **não** volta sozinha.

Teste de morte: se o personagem morrer no mesmo piso, a rota é retomada quando ele volta
a viver. Em outro piso o driver registra `rota_nao_retomada` (motivo `piso`) e não anda
às cegas.

---

## 7. O que me mandar

```
q no início:      16
q no fim:         16
pontos/voltas:    ...
janelas/contador: ...
log do painel:    últimas linhas
aparelho:         Android xx / WebView xxx
```

## 8. Sintomas → causa provável

| Sintoma | Causa provável |
|---|---|
| Painel não aparece | driver não injetado; espere 6 s (o `vigiar` reinjeta) ou toque em `web` |
| Rota para e log diz `rota_repetir`/`rota_desistiu` | waypoint bloqueado ou fora do alcance de 8 tiles; ajuste o ponto |
| `q = 80` | bit 64: `ir` sem entrada confiável (janela do WebView sem foco?); recarregue e refaça |
| `q` com 32 | algum evento sintético (JS) no caminho — não use `dispatchEvent` |
| "estado inválido" no painel | JSON malformado da ponte; veja o log |
