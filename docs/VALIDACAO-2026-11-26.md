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

- Diálogo **Rota** agora tem **“Adicionar a posição atual”**: ande com o joystick e vá
  anexando `[x,y]` à lista.
- **Salvar como…** grava a rota com nome (ex.: `teste1`); **Abrir…** lista as rotas salvas
  com **Usar / Apagar / Cancelar**; **Limpar** zera o campo e a última rota.
- Verificado no emulador: montar `[[8,89]]`, salvar como `teste1`, limpar, abrir a lista,
  usar e **Iniciar** — a rota rodou em laço (66 voltas rápidas de 1 ponto, `q=16`) e
  **Parar** encerrou.
- **Voltar** do Android minimiza o app em vez de sair do personagem (a sessão do cliente
  web não sobrevive a uma navegação para trás).

## 10. Pendências

- Seguidor com segundo personagem real (posicionamento e parada a 1 tile).
- Morte no mesmo piso → retomada (teste de unidade cobre; falta ao vivo).
