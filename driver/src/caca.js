// Ponto de caça: a mesma ideia do HuntSpotSettings/LongRouteSession do desktop
// (25/11/2026). Chegou no sqm marcado: para, segura até "limpar" (poucos monstros
// no raio e mana suficiente), espera um instante para confirmar e só então sai.
// A regra de "trem" (preso com N+ monstros → caçar no lugar) foi removida em
// 27/11/2026, igual ao desktop: parado, o cerco fechava em 2–3 s.
//
// A lógica é pura: não conhece jogador, jogo nem teclado. O motor da rota decide
// quando entrar/sair e o motor de comandos manda `parar`/`ir`.
export const ACOMODAR_MIN_MS = 1500;
export const ACOMODAR_MAX_MS = 3000;
// Esperas por caminho livre num trecho de caça; depois disso, a rota volta ao normal.
export const MAX_ESPERAS = 4;

export const CACA_PADRAO = Object.freeze({
  raioLimpo: 3,
  minParadoMs: 3000,
  tetoMs: 180000,
  manaMinPct: 30,
  sairComMobs: 0,
});

function inteiro(valor, padrao, min, max) {
  const n = Math.round(Number(valor));
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

/** Aceita valores parciais e devolve a configuração completa, dentro dos limites do desktop. */
export function normalizarCaca(config) {
  const c = config || {};
  let minParadoMs = inteiro(c.minParadoMs, CACA_PADRAO.minParadoMs, 0, 60000);
  const tetoMs = inteiro(c.tetoMs, CACA_PADRAO.tetoMs, 10000, 900000);
  if (minParadoMs > tetoMs) minParadoMs = tetoMs;
  return {
    raioLimpo: inteiro(c.raioLimpo, CACA_PADRAO.raioLimpo, 1, 7),
    minParadoMs: minParadoMs,
    tetoMs: tetoMs,
    manaMinPct: inteiro(c.manaMinPct, CACA_PADRAO.manaMinPct, 0, 100),
    sairComMobs: inteiro(c.sairComMobs, CACA_PADRAO.sairComMobs, 0, 10),
  };
}

/** Monstros vivos a até `raio` sqm (Chebyshev, como o desktop). */
export function contarMobs(pos, monstros, raio) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return 0;
  const lista = Array.isArray(monstros) ? monstros : [];
  let n = 0;
  for (const m of lista) {
    if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    if (Math.max(Math.abs(m.x - pos.x), Math.abs(m.y - pos.y)) <= raio) n += 1;
  }
  return n;
}

/**
 * Controlador do ponto de caça.
 *  - iniciar(agora, { noPonto, motivo }): no ponto marcado (noPonto=true) ou
 *    esperando o caminho abrir/caçando no lugar (noPonto=false).
 *  - passo({ agora, pos, mobs, manaPct, movendo }): { ativo:true, ... } enquanto
 *    segura; { ativo:false, motivo } quando é hora de sair.
 */
export function criarCaca(opcoes) {
  const cfg = Object.assign({ aleatorio: Math.random, config: null }, opcoes || {});
  const aleatorio = typeof cfg.aleatorio === "function" ? cfg.aleatorio : Math.random;
  let regras = normalizarCaca(cfg.config);

  let ativo = false;
  let inicio = 0;
  let limpoDesde = null;
  let acomodarMs = 0;
  let noPonto = false;
  let motivo = "";
  let ultimoPerto = 0;
  let ultimoLimpo = false;
  let ultimaManaOk = true;

  function configurar(novo) {
    regras = normalizarCaca(novo);
    return Object.assign({}, regras);
  }

  function sortearAcomodar() {
    const r = Math.min(0.999999, Math.max(0, Number(aleatorio()) || 0));
    return Math.round(ACOMODAR_MIN_MS + r * (ACOMODAR_MAX_MS - ACOMODAR_MIN_MS));
  }

  function iniciar(agora, dados) {
    const d = dados || {};
    ativo = true;
    inicio = Number.isFinite(agora) ? agora : 0;
    limpoDesde = null;
    acomodarMs = 0;
    noPonto = !!d.noPonto;
    motivo = d.motivo || "";
    ultimoPerto = 0;
    ultimoLimpo = false;
    ultimaManaOk = true;
    return info(agora);
  }

  function passo(entrada) {
    const e = entrada || {};
    const agora = Number.isFinite(e.agora) ? e.agora : 0;
    if (!ativo) return { ativo: false, noPonto: noPonto, motivo: "parado", tempoMs: 0, perto: 0 };

    const perto = contarMobs(e.pos, e.mobs, regras.raioLimpo);
    const mana = e.manaPct == null ? NaN : Number(e.manaPct);
    const manaOk = !Number.isFinite(mana) || mana >= regras.manaMinPct;
    const movendo = !!e.movendo;

    if (perto > regras.sairComMobs || !manaOk || movendo) {
      limpoDesde = null;
    } else if (limpoDesde === null) {
      limpoDesde = agora;
      acomodarMs = sortearAcomodar();
    }

    const limpo = limpoDesde !== null && agora - limpoDesde >= acomodarMs;
    const tempoMs = Math.max(0, agora - inicio);
    const minimo = noPonto ? regras.minParadoMs : 0;
    const teto = tempoMs >= regras.tetoMs;

    ultimoPerto = perto;
    ultimoLimpo = limpo;
    ultimaManaOk = manaOk;

    if (!movendo && ((limpo && tempoMs >= minimo) || teto)) {
      ativo = false;
      motivo = teto
        ? "teto de " + Math.round(regras.tetoMs / 1000) + " s atingido; saindo"
        : "limpo; saindo";
      return {
        ativo: false,
        noPonto: noPonto,
        motivo: motivo,
        tempoMs: tempoMs,
        perto: perto,
        limpo: limpo,
        manaOk: manaOk,
      };
    }

    motivo = perto > regras.sairComMobs
      ? perto + " monstro(s) a até " + regras.raioLimpo + " sqm"
      : !manaOk
        ? "aguardando mana (" + Math.round(mana) + "%)"
        : limpoDesde !== null
          ? "limpo; confirmando"
          : "aguardando";

    return {
      ativo: true,
      noPonto: noPonto,
      motivo: motivo,
      tempoMs: tempoMs,
      perto: perto,
      limpo: limpo,
      manaOk: manaOk,
      esperando: !noPonto,
    };
  }

  function info(agora) {
    const quando = Number.isFinite(agora) ? agora : 0;
    return {
      ativo: ativo,
      noPonto: noPonto,
      tempoMs: ativo ? Math.max(0, quando - inicio) : 0,
      perto: ultimoPerto,
      limpo: ultimoLimpo,
      manaOk: ultimaManaOk,
      motivo: motivo,
    };
  }

  function reset() {
    ativo = false;
    inicio = 0;
    limpoDesde = null;
    acomodarMs = 0;
    noPonto = false;
    motivo = "";
    ultimoPerto = 0;
    ultimoLimpo = false;
    ultimaManaOk = true;
  }

  return {
    iniciar,
    passo,
    info,
    reset,
    configurar,
    config: () => Object.assign({}, regras),
    ativa: () => ativo,
  };
}
