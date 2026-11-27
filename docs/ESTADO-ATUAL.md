# Estado atual — Olivia Web Android

**Versão:** 0.9.1
**Data:** 2026-11-27
**Commit:** `e17460d`
**Release:** https://github.com/Dr0nj/Olivia_Web_ANDROID/releases/tag/v0.9.1
**APK:** `android/app/build/olivia-web.apk` (109 KB; cópia em
`C:\Users\Dron\Downloads\olivia-web.apk`)

## Validado

- **68 testes** (`node --test driver/tests`) e auditoria `Calidad` sem violações.
- **Seguir 0 = mesmo tile**: validado ao vivo no emulador; de `(90,105)` para `(85,105)`,
  o tile exato do alvo. `q=16`.
- **Área**: checkbox liga/desliga; Hunt Assist fica `{on:true,cerca:false,modo:2}`;
  log `area_otimizada`; `q=16`. **Falta validar a troca de alvo com monstros reais.**
- **Configurações roláveis**: corpo em `ScrollView`; Voltar acessível
  (`uiautomator`: `[1650,967][1777,1023]`).
- **Repetir task**: ação enviada antes de fechar o diálogo.
- APK 0.9.1 instalado e aberto no emulador (o emulador foi encerrado sem snapshot).

## Mudanças da 0.9.1

1. **Seguir 0**: `ir` não entra no piso ocupado por outro jogador; o último sqm usa
   `{t:"dir"}` (passo do joystick), com `parar` em 240 ms e novo passo a cada 650 ms.
2. **Área**: `driver/src/area.js` porta o `AreaAttack` do desktop (raio 2,5 = diâmetro 5;
   janela 7×5; +2 monstros; 3 s). Alvo via `Pelea.poner`/`{t:"objetivo"}`; Hunt Assist
   com `cerca=false`; skills/poções preservadas.
3. **Configurações**: `ScrollView` com altura limitada; o novo checkbox de área fez o
   Voltar sair da tela e isso foi corrigido.

## Pendências

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
