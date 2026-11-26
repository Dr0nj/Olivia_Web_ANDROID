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

Painel deve mostrar: tempo, xp/h, pontos, voltas, mortes, nível, vida, mana, poções, desafio.

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
4. **Iniciar** volta ao hub e começa a andar em trechos de até 6 tiles (o servidor ignora
   `ir` a mais de 8). Ao chegar no último ponto, começa a volta de novo (`volta` sobe).

**Guardar e escolher rotas**

- **Salvar…** → dá um nome (ex.: `scorpion`), grava no aparelho e volta ao hub.
- **Abrir…** → lista as rotas salvas; toque numa para **Usar**, **Apagar** ou **Cancelar**.
- **Limpar** esvazia o campo e a última rota.
- **Desfazer** remove o último ponto marcado.
- A última rota usada também é recarregada ao abrir a tela de rota.

Esperado no painel: `desafio 0/0 · ponto i/N · volta n · andando`; `pontos` sobe a cada
waypoint e `voltas` a cada laço.

Medir o `q` no fim (não em laço, cada chamada consome `f`/`w`):

```js
Calidad.ping(Red.ws, Red)
```

Esperado: `{"q":16,...}`. Se vier 80, ver §0.

---

## 4. Prêmios: tarefas e missões (2 min)

O painel tem **Coletar prêmios** (ligado por padrão) e a linha `N prontos · M coletados`.

- **Tarefas** (as barras no topo): `estado 2` = concluída → o Olivia envia
  `{t:"tarea", id, accion:"cobrar"}`.
- **Missões** (`Hud.listaMisiones`): `estado 2` → `{t:"mision", id}`.
- Espera 6 s entre lotes, tenta até 3 vezes por id e não insiste depois disso.
- O log mostra `tarefa_coletada` / `missao_coletada`.

Para conferir: complete uma tarefa/missão, deixe parado e veja o ouro/exp subir e o
contador `coletados` aumentar. **Aceitar** missão nova continua sendo falar com o NPC
(a oferta vem no diálogo dele); o Olivia só coleta o que já está concluído.

## 5. Anti-bot em ensaio (2 min)

Sem esperar o servidor perguntar:

```js
Olivia.antibot.definirEnsaio(true);
Olivia.antibot.aoReceber({ id: "teste-1", seg: 30,
  b: [{ tx: "Sí", k: "1" }, { tx: "No", k: "2" }] });
```

Esperado em ~1 s: evento `antibot_ensaio` no **log** do painel e no console
(`[Olivia] ensaio: responderia id=teste-1 chave=2`).

Para valer de novo: `Olivia.antibot.definirEnsaio(false)`.

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
