// ==UserScript==
// @name         Olivia Web
// @namespace    olivia.web
// @version      0.9.10
// @description  Olivia no cliente web do LOW: desafio, rotas, ponto de caça, seguidor e sessão.
// @match        https://lowmmorpg.com/juego/*
// @match        https://*.lowmmorpg.com/juego/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
// Registro de eventos em memória, com saída opcional (console, ponte nativa, storage).
function criarLog(registrar, limite = 500) {
  const eventos = [];

  function evento(nome, dados) {
    const registro = Object.assign({ t: Date.now(), nome }, dados || {});
    eventos.push(registro);
    if (eventos.length > limite) eventos.shift();
    if (typeof registrar === "function") {
      try { registrar(registro); } catch (e) { /* log nunca derruba o motor */ }
    }
    return registro;
  }

  return {
    evento,
    ultimos: (n) => eventos.slice(-(n || 10)),
    todos: () => eventos.slice(),
  };
}


// Contadores por sessão. Reinicia em "zerar sessão" e na troca de personagem.
function criarSessao(opcoes) {
  const cfg = Object.assign({ agora: Date.now }, opcoes || {});
  let estado = novo();

  function novo() {
    return {
      inicio: cfg.agora(),
      xpVisto: null,
      xpGanho: 0,
      ouroVisto: null,
      ouroGanho: 0,
      tasks: 0,
      pontos: 0,
      voltas: 0,
      antiBot: 0,
      janelas: 0,
      mortes: 0,
      paradas: 0,
      personagem: null,
    };
  }

  function duracaoMs() { return Math.max(0, cfg.agora() - estado.inicio); }

  // `exp` é o XP dentro do nível: zera ao subir de nível. Somamos os ganhos para
  // o xp/h não ficar negativo nem dar saltos.
  function xpAtual(valor) {
    if (!Number.isFinite(valor)) return;
    if (estado.xpVisto === null) {
      estado.xpVisto = valor;
      return;
    }
    if (valor >= estado.xpVisto) estado.xpGanho += valor - estado.xpVisto;
    else estado.xpGanho += valor;
    estado.xpVisto = valor;
  }

  // Gold de loot: conta só aumentos. Compra/depósito diminui o saldo e não vira
  // "gold coletado" negativo; o próximo aumento volta a contar a partir do novo saldo.
  function ouroAtual(valor) {
    if (!Number.isFinite(valor)) return;
    if (estado.ouroVisto === null) {
      estado.ouroVisto = valor;
      return;
    }
    if (valor > estado.ouroVisto) estado.ouroGanho += valor - estado.ouroVisto;
    estado.ouroVisto = valor;
  }

  function xpHora() {
    const horas = duracaoMs() / 3600000;
    if (horas <= 0) return 0;
    return Math.round(estado.xpGanho / horas);
  }

  function personagem(nome) {
    if (nome && estado.personagem && nome !== estado.personagem) reset(nome);
    else if (nome && !estado.personagem) estado.personagem = nome;
  }

  function reset(nome) {
    const anterior = nome || estado.personagem;
    estado = novo();
    estado.personagem = anterior || null;
  }

  function exportar() {
    return Object.assign({}, estado);
  }

  function importar(obj) {
    if (!obj || typeof obj !== "object") return false;
    estado = Object.assign(novo(), obj);
    return true;
  }

  return {
    xpAtual,
    ouroAtual,
    xpHora,
    personagem,
    reset,
    duracaoMs,
    pontoConcluido: () => { estado.pontos += 1; },
    voltaConcluida: () => { estado.voltas += 1; },
    tarefaConcluida: () => { estado.tasks += 1; },
    janelaVista: () => { estado.janelas += 1; },
    antiBotRespondida: () => { estado.antiBot += 1; },
    morte: () => { estado.mortes += 1; },
    parada: () => { estado.paradas += 1; },
    exportar,
    importar,
    snapshot: () => ({
      personagem: estado.personagem,
      inicio: estado.inicio,
      duracaoMs: duracaoMs(),
      xp: estado.xpGanho,
      xpHora: xpHora(),
      ouro: estado.ouroGanho,
      ouroAtual: estado.ouroVisto,
      tasks: estado.tasks,
      pontos: estado.pontos,
      voltas: estado.voltas,
      antiBot: estado.antiBot,
      janelas: estado.janelas,
      mortes: estado.mortes,
      paradas: estado.paradas,
    }),
  };
}


// Humanização: pausas longas periódicas e atrasos aleatórios.
function criarHumano(opcoes) {
  const cfg = Object.assign({
    aleatorio: Math.random,
    agora: Date.now,
    intervaloMinMs: 15 * 60000,
    intervaloMaxMs: 25 * 60000,
    pausaMinMs: 8000,
    pausaMaxMs: 20000,
    ligado: true,
  }, opcoes || {});

  let proxima = null;

  function definirLigado(v) {
    cfg.ligado = !!v;
    if (!cfg.ligado) {
      proxima = null;
      return cfg.ligado;
    }
    reiniciar();
    return cfg.ligado;
  }

  function entre(min, max) {
    const r = Math.min(0.999999, Math.max(0, cfg.aleatorio()));
    return Math.round(min + r * (max - min));
  }

  function reiniciar() {
    proxima = cfg.agora() + entre(cfg.intervaloMinMs, cfg.intervaloMaxMs);
  }

  function devePausar() {
    if (!cfg.ligado) return 0;
    if (proxima === null) reiniciar();
    if (cfg.agora() < proxima) return 0;
    const ms = entre(cfg.pausaMinMs, cfg.pausaMaxMs);
    reiniciar();
    return ms;
  }

  return {
    devePausar,
    reiniciar,
    definirLigado,
    ligado: () => cfg.ligado,
    atraso: (min, max) => entre(min, max),
    proximaEm: () => proxima,
  };
}


// Ponto de caça: a mesma ideia do HuntSpotSettings/LongRouteSession do desktop
// (25/11/2026). Chegou no sqm marcado: para, segura até "limpar" (poucos monstros
// no raio e mana suficiente), espera um instante para confirmar e só então sai.
// A regra de "trem" (preso com N+ monstros → caçar no lugar) foi removida em
// 27/11/2026, igual ao desktop: parado, o cerco fechava em 2–3 s.
//
// A lógica é pura: não conhece jogador, jogo nem teclado. O motor da rota decide
// quando entrar/sair e o motor de comandos manda `parar`/`ir`.
const ACOMODAR_MIN_MS = 1500;
const ACOMODAR_MAX_MS = 3000;
// Esperas por caminho livre num trecho de caça; depois disso, a rota volta ao normal.
const MAX_ESPERAS = 4;

const CACA_PADRAO = Object.freeze({
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
function normalizarCaca(config) {
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
function contarMobs(pos, monstros, raio) {
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
function criarCaca(opcoes) {
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


// Motor de rota: pontos em tiles, chegada por proximidade, timeout, pulo de ponto,
// espera quando não há caminho e repetição de volta.
//
// Regras trazidas do Olivia desktop:
//  - começa pelo waypoint MAIS PRÓXIMO da posição atual (não sempre o ponto 0);
//  - chegada com raio (não precisa pisar exatamente no tile);
//  - depois de N tentativas sem progresso, pula o ponto e tenta o próximo alcançável;
//  - se todos os pontos falharem, espera 5 s e recomeça a volta (até 12 vezes);
//  - a volta concluída limpa os pontos pulados;
//  - ponto de caça: pisa EXATAMENTE no sqm marcado, para e segura até limpar (caca.js).

// Janela em que uma mudança de posição ainda conta como "andando" (o estado do
// cliente chega a cada ~250 ms; 500 ms evita piscar parado entre dois passos).
const MOVENDO_JANELA_MS = 500;

function criarRota(opcoes) {
  const cfg = Object.assign({
    timeoutMs: 2500,
    // Tentativas antes de pular o waypoint (desktop: SKIP_AFTER=2).
    pularApos: 2,
    // Chegou a <= raioChegada tiles (Chebyshev) e ficou parado: conta como chegado.
    raioChegada: 1,
    settleMs: 600,
    pausaPadraoMs: 0,
    // Perna longa não é falha: o limite cresce com a distância até o alvo.
    msPorTile: 350,
    timeoutMaxMs: 15000,
    // Rota fechada: ao chegar no último ponto, volta ao primeiro.
    repetir: false,
    voltasMax: 0, // 0 = sem limite
    // Sem caminho: espera e tenta de novo (desktop: 5 s x 12).
    // Pausa depois de cada waypoint (porta do WaypointPauseSettings do desktop).
    atraso: { modo: "off", ms: 0, minMs: 0, maxMs: 0 },
    aleatorio: Math.random,
    esperaMs: 5000,
    esperasMax: 12,
    // Configuração do ponto de caça (HuntSpotSettings do desktop).
    caca: null,
  }, opcoes || {});

  const caca = criarCaca({ aleatorio: cfg.aleatorio, config: cfg.caca });
  let pontos = [];
  let indice = 0;
  let situacao = "parada"; // parada | andando | pausada | esperando | cacando | concluida | desistiu
  let tentativas = 0;
  let desde = 0;
  let pausaAte = 0;
  let finalizando = false;
  let volta = 0;
  let limite = null; // prazo da perna atual
  let pulados = new Set();
  let esperas = 0;
  let ultimaPos = null;
  let paradoDesde = 0;
  let atraso = { modo: "off", ms: 0, minMs: 0, maxMs: 0 };

  // ---- Ponto de caça (mesmas regras do LongRouteSession/HuntSpotSettings) ----
  let cacaEsperas = 0;
  // Trecho saindo de um ponto de caça: caminho travado espera em vez de pular.
  let pernaCaca = false;
  let posMovel = null;
  let mudouEm = 0;

  function limparCaca() {
    caca.reset();
    cacaEsperas = 0;
    pernaCaca = false;
    posMovel = null;
    mudouEm = -Infinity;
  }

  function atualizarMovimento(agora, pos) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    if (!posMovel) {
      posMovel = { x: pos.x, y: pos.y };
      // Primeira posição conhecida: não inventa que está andando. Se o personagem
      // estiver em movimento, o próximo sqm atualiza o relógio normalmente.
      if (!Number.isFinite(mudouEm)) mudouEm = agora - MOVENDO_JANELA_MS;
      return;
    }
    if (posMovel.x !== pos.x || posMovel.y !== pos.y) {
      posMovel = { x: pos.x, y: pos.y };
      mudouEm = agora;
    }
  }

  function movendo(agora) {
    return posMovel !== null && agora - mudouEm < MOVENDO_JANELA_MS;
  }

  function pontoDeCaca(alvo) {
    return !!(alvo && alvo.hunt);
  }

  function cacaRelacionada(alvo) {
    return (pernaCaca || pontoDeCaca(alvo)) && cacaEsperas < MAX_ESPERAS;
  }

  function iniciarCaca(agora, noPonto, motivo) {
    if (noPonto) {
      cacaEsperas = 0;
      pernaCaca = false;
    } else {
      cacaEsperas += 1;
    }
    const info = caca.iniciar(agora, { noPonto: noPonto, motivo: motivo });
    situacao = "cacando";
    pausaAte = 0;
    limite = null;
    ultimaPos = null;
    return {
      acao: "cacar",
      emPonto: !!noPonto,
      motivo: motivo,
      perto: info.perto,
      tempoMs: 0,
      esperas: cacaEsperas,
    };
  }

  function fimCaca(agora, r) {
    const noPonto = r.noPonto;
    situacao = "andando";
    limite = null;
    ultimaPos = null;
    // Recomeça o relógio de "preso" só depois de sair da caça.
    posMovel = null;
    mudouEm = agora;
    if (!noPonto) {
      desde = agora;
      return {
        acao: "caca_fim",
        fimCaca: true,
        cacaMotivo: r.motivo,
        emPonto: false,
        tempoMs: r.tempoMs,
        perto: r.perto,
      };
    }
    pernaCaca = true;
    cacaEsperas = 0;
    indice += 1;
    tentativas = 0;
    desde = agora;
    if (indice >= pontos.length) {
      const fecho = fecharVolta(agora);
      return Object.assign({}, fecho, {
        fimCaca: true,
        cacaMotivo: r.motivo,
        emPonto: true,
        tempoMs: r.tempoMs,
      });
    }
    return {
      acao: "avancar",
      fimCaca: true,
      cacaMotivo: r.motivo,
      emPonto: true,
      tempoMs: r.tempoMs,
      indice: indice,
      alvo: pontos[indice],
      pos: null,
    };
  }

  function processarCaca(entrada) {
    const agora = entrada.agora;
    const r = caca.passo({
      agora: agora,
      pos: entrada.pos,
      mobs: entrada.mobs,
      manaPct: entrada.manaPct,
      movendo: movendo(agora),
    });
    if (r.ativo) {
      return {
        acao: "cacar",
        emPonto: r.noPonto,
        motivo: r.motivo,
        perto: r.perto,
        tempoMs: r.tempoMs,
        limpo: r.limpo,
        esperando: r.esperando,
        esperas: cacaEsperas,
      };
    }
    return fimCaca(agora, r);
  }

  function definirAtraso(c) {
    if (!c || c.modo === "off" || c.ligado === false) {
      atraso = { modo: "off", ms: 0, minMs: 0, maxMs: 0 };
      return atraso;
    }
    const modo = c.modo === "aleatorio" ? "aleatorio" : "exato";
    const ms = Math.max(0, Math.round(Number(c.ms) || 0));
    const minMs = Math.max(0, Math.round(Number(c.minMs != null ? c.minMs : ms) || 0));
    const maxMs = Math.max(minMs, Math.round(Number(c.maxMs != null ? c.maxMs : minMs) || 0));
    atraso = {
      modo: modo,
      ms: ms,
      minMs: minMs,
      maxMs: maxMs,
    };
    return atraso;
  }

  // Quanto esperar depois deste waypoint. O `pausaMs` do ponto vence a config global.
  function atrasoDe(ponto) {
    if (ponto && Number.isFinite(ponto.pausaMs) && ponto.pausaMs > 0) return ponto.pausaMs;
    if (atraso.modo === "off") return 0;
    if (atraso.modo === "aleatorio") {
      const r = Math.min(0.999999, Math.max(0, Number(cfg.aleatorio()) || 0));
      return Math.round(atraso.minMs + r * (atraso.maxMs - atraso.minMs));
    }
    return atraso.ms;
  }

  function cheb(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  function normalizar(lista) {
    if (!Array.isArray(lista) || lista.length === 0) throw new Error("rota vazia");
    return lista.map(function (p, i) {
      const x = Number(Array.isArray(p) ? p[0] : p && p.x);
      const y = Number(Array.isArray(p) ? p[1] : p && p.y);
      if (!Number.isInteger(x) || !Number.isInteger(y)) {
        throw new Error("ponto " + i + " sem x/y inteiros");
      }
      const pausa = !Array.isArray(p) && Number.isFinite(p && p.pausaMs)
        ? Math.max(0, p.pausaMs)
        : cfg.pausaPadraoMs;
      // Marca de caça: {x,y,hunt:true}, {x,y,caca:true}, [x,y,"h"] ou [x,y,true].
      const hunt = Array.isArray(p)
        ? p[2] === "h" || p[2] === true || p[3] === "h"
        : !!(p && (p.hunt === true || p.hunt === "h" || p.caca === true || p.caca === "h" || p.h === "h" || p.h === true));
      return { x: x, y: y, pausaMs: pausa, hunt: hunt };
    });
  }

  function carregar(lista) {
    pontos = normalizar(lista);
    indice = 0;
    situacao = "parada";
    tentativas = 0;
    finalizando = false;
    volta = 0;
    pulados = new Set();
    esperas = 0;
    limparCaca();
    return pontos.length;
  }

  function maisProximo(pos) {
    let melhor = 0;
    let dist = Infinity;
    pontos.forEach(function (p, i) {
      const d = cheb(pos, p);
      if (d < dist) {
        dist = d;
        melhor = i;
      }
    });
    return melhor;
  }

  // Prazo de uma perna: cresce com a distância em tiles, com teto.
  function prazoDe(pos, alvo) {
    const distancia = cheb(pos, alvo);
    return Math.min(cfg.timeoutMaxMs, Math.max(cfg.timeoutMs, distancia * cfg.msPorTile));
  }

  function iniciar(agora, pos) {
    if (!pontos.length) return false;
    indice = pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) ? maisProximo(pos) : 0;
    tentativas = 0;
    desde = agora;
    pausaAte = 0;
    finalizando = false;
    limite = null;
    pulados = new Set();
    esperas = 0;
    ultimaPos = null;
    limparCaca();
    situacao = "andando";
    return true;
  }

  function pausar() {
    if (situacao === "andando") situacao = "pausada";
  }

  function retomar(agora) {
    if (situacao !== "pausada") return false;
    desde = agora;
    pausaAte = 0;
    situacao = "andando";
    return true;
  }

  function parar() {
    situacao = "parada";
    pausaAte = 0;
    finalizando = false;
    limparCaca();
  }

  function posicionar(i) {
    if (!pontos.length) return false;
    indice = Math.min(Math.max(0, Number(i) || 0), pontos.length - 1);
    desde = 0;
    tentativas = 0;
    limite = null;
    pulados = new Set();
    ultimaPos = null;
    limparCaca();
    return true;
  }

  function repetir(v) {
    if (v === undefined) return cfg.repetir;
    cfg.repetir = !!v;
    return cfg.repetir;
  }

  function definirVolta(n) {
    volta = Math.max(0, Number(n) || 0);
    return volta;
  }

  // Avança para o próximo ponto ainda não pulado nesta volta.
  function proximoNaoPulado() {
    for (let n = 1; n <= pontos.length; n += 1) {
      const i = (indice + n) % pontos.length;
      if (!pulados.has(i)) {
        indice = i;
        return true;
      }
    }
    return false;
  }

  function entrarEspera(agora) {
    esperas += 1;
    if (esperas > cfg.esperasMax) {
      situacao = "desistiu";
      return { acao: "desistir", motivo: "sem_caminho", esperas: esperas - 1 };
    }
    pulados = new Set();
    tentativas = 0;
    situacao = "esperando";
    pausaAte = agora + cfg.esperaMs;
    return { acao: "sem_caminho", esperaMs: cfg.esperaMs, esperas: esperas };
  }

  // Pula o ponto atual (usado também quando o tile não é andável).
  function pularAtual(agora) {
    const alvo = pontos[indice] || { x: 0, y: 0 };
    pulados.add(indice);
    tentativas = 0;
    if (proximoNaoPulado()) {
      desde = agora;
      limite = null;
      return {
        ok: true,
        acao: "pular",
        alvo: alvo,
        indice: indice,
        restantes: pontos.length - pulados.size,
      };
    }
    const espera = entrarEspera(agora);
    return Object.assign({ ok: espera.acao === "sem_caminho", alvo: alvo }, espera);
  }

  // Fecha a volta: repete do primeiro ponto ou conclui a rota.
  function fecharVolta(agora) {
    volta += 1;
    pulados = new Set();
    esperas = 0;
    ultimaPos = null;
    const podeRepetir = cfg.repetir && (cfg.voltasMax === 0 || volta < cfg.voltasMax);
    if (!podeRepetir) {
      situacao = "concluida";
      return { acao: "concluir", total: pontos.length, voltas: volta };
    }
    indice = 0;
    tentativas = 0;
    desde = agora;
    pausaAte = 0;
    limite = null;
    return { acao: "volta", volta: volta, total: pontos.length };
  }

  // Quanto falta da espera por falta de caminho (ms).
  function esperaRestante(agora) {
    return situacao === "esperando" ? Math.max(0, pausaAte - agora) : 0;
  }

  // Pausa configurada depois de um waypoint (Atraso...), usada no status do painel.
  function pausaRestante(agora) {
    return pausaAte > agora ? pausaAte - agora : 0;
  }

  function definirCaca(config) {
    return caca.configurar(config);
  }

  // Pausa por interface do jogo: o tempo parado não conta como travamento nem
  // como "preso"; a caça recomeça o relógio no ponto em que estava.
  // Desvio de monstro: reinicia o prazo do trecho para o desvio não virar
  // "2 tentativas" e pular o waypoint.
  function destravar(agora) {
    if (situacao !== "andando") return false;
    tentativas = 0;
    desde = agora;
    limite = null;
    ultimaPos = null;
    return true;
  }

  function retomarAposInterface(agora) {
    if (situacao === "cacando") {
      const info = caca.info(agora);
      caca.iniciar(agora, { noPonto: info.noPonto, motivo: "retomando após interface" });
    }
    pausaAte = 0;
    desde = agora;
    limite = null;
    ultimaPos = null;
    posMovel = null;
    mudouEm = agora;
    finalizando = false;
  }

  function cacaInfo(agora) {
    const quando = Number.isFinite(agora) ? agora : 0;
    return Object.assign({}, caca.info(quando), {
      situacao: situacao,
      esperas: cacaEsperas,
      pernaCaca: pernaCaca,
    });
  }

  // Decisão do tick: ir | repetir | pular | sem_caminho | esperar | avancar | volta | concluir | desistir | cacar | caca_fim
  function passo(entrada) {
    const agora = entrada.agora;
    const pos = entrada.pos;
    const mobs = Array.isArray(entrada.mobs) ? entrada.mobs : [];

    if (situacao === "esperando") {
      if (agora < pausaAte) return { acao: "esperar", motivo: "sem-caminho" };
      situacao = "andando";
      pausaAte = 0;
      desde = agora;
      limite = null;
      return { acao: "esperar", motivo: "recomeco" };
    }

    if (situacao === "cacando") {
      if (!pos) return { acao: "esperar", motivo: "sem-posicao" };
      atualizarMovimento(agora, pos);
      return processarCaca(entrada);
    }

    if (situacao !== "andando") return null;
    if (!pos) return { acao: "esperar", motivo: "sem-posicao" };
    atualizarMovimento(agora, pos);
    if (pausaAte !== 0) {
      if (agora < pausaAte) return { acao: "esperar", motivo: "pausa" };
      // Pausa terminou: o prazo da próxima perna começa agora.
      pausaAte = 0;
      desde = agora;
      limite = null;
    }
    if (finalizando) {
      finalizando = false;
      return fecharVolta(agora);
    }

    const alvo = pontos[indice];
    if (limite === null) limite = prazoDe(pos, alvo);

    const mudou = !ultimaPos || ultimaPos.x !== pos.x || ultimaPos.y !== pos.y;
    if (mudou) {
      paradoDesde = agora;
      ultimaPos = { x: pos.x, y: pos.y };
      // Progresso renova o prazo da perna: só conta travamento de verdade.
      desde = agora;
      limite = prazoDe(pos, alvo);
    }
    const parado = !mudou && agora - paradoDesde >= cfg.settleMs;

    const exato = pos.x === alvo.x && pos.y === alvo.y;
    // Ponto de caça só "chega" pisando no sqm exato (como o desktop): aceitar o
    // raio deixava o personagem parado dois sqm antes e caçando longe do ponto.
    const perto = !exato && !pontoDeCaca(alvo) && cheb(pos, alvo) <= cfg.raioChegada && parado;

    if (exato || perto) {
      if (exato && pontoDeCaca(alvo)) {
        return iniciarCaca(agora, true, "chegou no ponto de caça " + alvo.x + "," + alvo.y);
      }
      pernaCaca = false;
      cacaEsperas = 0;
      indice += 1;
      tentativas = 0;
      desde = agora;
      limite = null;
      ultimaPos = null;
      const espera = atrasoDe(alvo);
      if (espera > 0) pausaAte = agora + espera;

      if (indice >= pontos.length) {
        if (agora < pausaAte) {
          finalizando = true;
          return { acao: "esperar", motivo: "pausa" };
        }
        return fecharVolta(agora);
      }
      // A pausa configurada é aplicada no próximo tick (o ponto já conta como concluído).
      return { acao: "avancar", indice: indice, alvo: pontos[indice], perto: perto, pos: pos };
    }

    if (agora - desde > limite) {
      tentativas += 1;
      if (tentativas < cfg.pularApos) {
        desde = agora;
        limite = prazoDe(pos, alvo);
        return { acao: "repetir", x: alvo.x, y: alvo.y, indice: indice, tentativa: tentativas };
      }
      // Trecho de caça travado: espera o caminho abrir no lugar em vez de pular
      // (o pulo de waypoint levava a beco no desktop). Depois de MAX_ESPERAS, normal.
      if (cacaRelacionada(alvo)) {
        return iniciarCaca(agora, false, pontoDeCaca(alvo)
          ? "caminho travado no ponto de caça " + alvo.x + "," + alvo.y + "; esperando abrir"
          : "caminho travado no trecho de caça; esperando abrir");
      }
      return pularAtual(agora);
    }

    return { acao: "ir", x: alvo.x, y: alvo.y, indice: indice };
  }

  return {
    carregar,
    iniciar,
    pausar,
    retomar,
    parar,
    passo,
    posicionar,
    pularAtual,
    definirAtraso,
    atrasoConfig: () => Object.assign({}, atraso),
    definirCaca,
    destravar,
    retomarAposInterface,
    cacaConfig: () => caca.config(),
    cacaInfo,
    repetir,
    definirVolta,
    pontos: () => pontos.map((p) => ({ x: p.x, y: p.y, pausaMs: p.pausaMs, hunt: !!p.hunt })),
    total: () => pontos.length,
    indice: () => indice,
    situacao: () => situacao,
    volta: () => volta,
    pulados: () => Array.from(pulados),
    esperas: () => esperas,
    esperaRestante,
    pausaRestante,
    alvo: () => (pontos[indice] ? { x: pontos[indice].x, y: pontos[indice].y } : null),
  };
}


// Seguir knight: mantém o personagem na vaga da onda, com o alvo no centro do 3x3.
//
// Área real da Energy Surge vista no jogo: 2 pisos retos e depois 3 fileiras de 3
// (1,1,3,3,3), na direção em que o personagem está virado. A 4 sqm do alvo, a
// fileira 3x3 fica centrada no alvo: o knight ocupa o centro dos 9 e os dois pisos
// retos ficam atrás dele, entre o knight e quem está seguindo.
//
// Isto só escolhe a vaga e a direção. Nenhuma magia é disparada daqui.
const DISTANCIA_ONDA = 4;

// Lados do eixo em volta do alvo: 0=leste(+x), 1=oeste(-x), 2=sul(+y), 3=norte(-y).
const EIXOS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Direção para olhar da vaga até o alvo, no formato do cliente web:
// 0=baixo, 1=cima, 2=esquerda, 3=direita (o mesmo `a` de {t:"pc",k:"xd"}).
const FACE_ALVO = [2, 3, 1, 0];

function passoDaFace(face) {
  if (face === 0) return [0, 1];
  if (face === 1) return [0, -1];
  if (face === 2) return [-1, 0];
  if (face === 3) return [1, 0];
  return [0, 0];
}

/** A área 1,1,3,3,3 saindo de (px,py) virada para `face` acerta (mx,my)? */
function ondaAcerta(px, py, face, mx, my) {
  const passo = passoDaFace(face);
  const dx = passo[0];
  const dy = passo[1];
  if (!dx && !dy) return false;
  const along = (mx - px) * dx + (my - py) * dy;
  const lado = Math.abs((mx - px) * dy - (my - py) * dx);
  return along >= 1 && along <= 5 && (along <= 2 ? lado === 0 : lado <= 1);
}

/** Vaga de um lado do alvo, a `distancia` sqm (4 = 3x3 centrado no alvo). */
function vaga(alvo, lado, distancia) {
  const d = EIXOS[lado];
  const n = Number.isFinite(distancia) ? distancia : DISTANCIA_ONDA;
  return { x: alvo.x + d[0] * n, y: alvo.y + d[1] * n };
}

function faceDoLado(lado) {
  return Number.isInteger(lado) && lado >= 0 && lado < FACE_ALVO.length ? FACE_ALVO[lado] : -1;
}

/** Monstros vivos que a onda acerta saindo desta vaga, virada para o alvo. */
function contarAcertos(posicao, face, monstros) {
  const lista = Array.isArray(monstros) ? monstros : [];
  let total = 0;
  for (const m of lista) {
    if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    if (ondaAcerta(posicao.x, posicao.y, face, m.x, m.y)) total += 1;
  }
  return total;
}

/** Quantos monstros ficam de cada lado da linha do feixe (o menor dos lados). */
function equilibrio(alvo, lado, monstros) {
  const d = EIXOS[lado];
  const lista = Array.isArray(monstros) ? monstros : [];
  let esquerda = 0;
  let direita = 0;
  for (const m of lista) {
    if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    const rx = m.x - alvo.x;
    const ry = m.y - alvo.y;
    if (Math.abs(rx) > 5 || Math.abs(ry) > 5) continue;
    const perpendicular = rx * d[1] - ry * d[0];
    if (perpendicular > 0) esquerda += 1;
    else if (perpendicular < 0) direita += 1;
  }
  return Math.min(esquerda, direita);
}

/** Vaga atrás do alvo conforme a última direção em que ele andou. */
function ladoAtras(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return -1;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 : 0;
  return dy > 0 ? 3 : 2;
}

function podeAndar(caminavel, casa) {
  return !caminavel || caminavel(casa.x, casa.y);
}

/** Vaga válida mais perto de mim (desempate quando não há monstro na onda). */
function ladoMaisPerto(alvo, pos, distancia, caminavel) {
  let melhor = -1;
  let custo = Infinity;
  for (let lado = 0; lado < EIXOS.length; lado += 1) {
    const casa = vaga(alvo, lado, distancia);
    if (!podeAndar(caminavel, casa)) continue;
    const d = Math.abs(casa.x - pos.x) + Math.abs(casa.y - pos.y);
    if (d < custo) {
      custo = d;
      melhor = lado;
    }
  }
  if (melhor >= 0) return melhor;
  // Todas as vagas parecem bloqueadas: escolhe a mais perto mesmo assim.
  custo = Infinity;
  for (let lado = 0; lado < EIXOS.length; lado += 1) {
    const casa = vaga(alvo, lado, distancia);
    const d = Math.abs(casa.x - pos.x) + Math.abs(casa.y - pos.y);
    if (d < custo) {
      custo = d;
      melhor = lado;
    }
  }
  return melhor;
}

/** Melhor lado para a onda: mais monstros no feixe. Se o alvo tem direção
 *  conhecida, a vaga de trás (preferido) ganha, a não ser que outro lado acerte
 *  pelo menos 2 monstros a mais. Sem monstros, usa a vaga de trás. */
function melhorLado(alvo, pos, monstros, preferido, caminavel, distancia) {
  let melhor = -1;
  let melhorAcertos = 0;
  let melhorEquilibrio = -1;
  let melhorCusto = Infinity;

  for (let lado = 0; lado < EIXOS.length; lado += 1) {
    const casa = vaga(alvo, lado, distancia);
    if (!podeAndar(caminavel, casa)) continue;
    const acertos = contarAcertos(casa, FACE_ALVO[lado], monstros);
    if (acertos === 0) continue;
    const bal = equilibrio(alvo, lado, monstros);
    const custo = Math.abs(casa.x - pos.x) + Math.abs(casa.y - pos.y);
    if (acertos > melhorAcertos
      || (acertos === melhorAcertos && (bal > melhorEquilibrio
        || (bal === melhorEquilibrio && custo < melhorCusto)))) {
      melhor = lado;
      melhorAcertos = acertos;
      melhorEquilibrio = bal;
      melhorCusto = custo;
    }
  }

  if (preferido >= 0) {
    const casa = vaga(alvo, preferido, distancia);
    if (podeAndar(caminavel, casa)) {
      const acertos = contarAcertos(casa, FACE_ALVO[preferido], monstros);
      if (melhor < 0 || melhorAcertos < acertos + 2) return preferido;
    }
  }

  if (melhor >= 0) return melhor;
  return ladoMaisPerto(alvo, pos, distancia, caminavel);
}

/** Escolhe o lado com histerese: troca com +2 monstros de vantagem; se o lado
 *  atual não acerta ninguém e outro acerta, troca na hora. */
function decidirLado(opcoes) {
  const cfg = opcoes || {};
  const alvo = cfg.alvo;
  const pos = cfg.pos;
  const monstros = Array.isArray(cfg.monstros) ? cfg.monstros : [];
  const ladoAtual = Number.isInteger(cfg.ladoAtual) ? cfg.ladoAtual : -1;
  const preferido = Number.isInteger(cfg.preferido) ? cfg.preferido : -1;
  const caminavel = cfg.caminavel;
  const distancia = cfg.distancia;

  const melhor = melhorLado(alvo, pos, monstros, preferido, caminavel, distancia);
  if (ladoAtual < 0 || melhor < 0 || ladoAtual === melhor) return melhor;

  // O alvo mudou de direção e a melhor vaga agora é a de trás: acompanha sem
  // esperar vantagem, para o feixe voltar a apontar para onde ele está indo.
  if (preferido >= 0 && melhor === preferido) return melhor;

  const casaAtual = vaga(alvo, ladoAtual, distancia);
  if (!podeAndar(caminavel, casaAtual)) return melhor;

  const acertosAtual = contarAcertos(casaAtual, FACE_ALVO[ladoAtual], monstros);
  const acertosMelhor = contarAcertos(vaga(alvo, melhor, distancia), FACE_ALVO[melhor], monstros);
  if (acertosMelhor === 0) return melhor;
  if (acertosAtual === 0 || acertosMelhor >= acertosAtual + 2) return melhor;
  return ladoAtual;
}


// Seguidor: mantém o personagem colado a um alvo (jogador) e desiste se o alvo sumir.
// Com "seguir knight" (onda) ligado, fica a 4 sqm do alvo, na mesma linha/coluna,
// escolhendo o lado que a área 1,1,3,3,3 acerta mais monstros e virando para o alvo.

function criarSeguidor(opcoes) {
  const cfg = Object.assign({
    alcance: 1,
    perdaMs: 5000,
    onda: false,
    distanciaOnda: DISTANCIA_ONDA,
    intervaloOndaMs: 1000,
  }, opcoes || {});

  let alvoId = null;
  let vistoEm = 0;
  let situacao = "parada"; // parada | seguindo | perdeu
  let passoEm = 0;

  // Estado do seguir knight.
  let ladoOnda = -1;
  let avaliadoEm = 0;
  let posAlvoAnterior = null;
  let direcaoAlvo = null;

  function seguir(id, agora) {
    alvoId = String(id);
    vistoEm = agora;
    situacao = "seguindo";
    passoEm = 0;
    ladoOnda = -1;
    avaliadoEm = 0;
    posAlvoAnterior = null;
    direcaoAlvo = null;
    return true;
  }

  function parar() {
    alvoId = null;
    situacao = "parada";
    passoEm = 0;
    ladoOnda = -1;
    avaliadoEm = 0;
    posAlvoAnterior = null;
    direcaoAlvo = null;
  }

  function definirAlcance(v) {
    const n = Number(v);
    cfg.alcance = Number.isFinite(n) ? Math.max(0, Math.min(8, Math.round(n))) : cfg.alcance;
    return cfg.alcance;
  }

  function definirOnda(v) {
    cfg.onda = !!v;
    ladoOnda = -1;
    avaliadoEm = 0;
    return cfg.onda;
  }

  function distancia(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  function alcanceEfetivo() {
    return cfg.onda ? cfg.distanciaOnda : cfg.alcance;
  }

  // Atualiza a direção do alvo a partir do último passo dele. Passos diagonais
  // usam o eixo dominante para não perder a referência de "atrás".
  function lembrarDirecao(alvo) {
    if (posAlvoAnterior
      && (posAlvoAnterior.x !== alvo.x || posAlvoAnterior.y !== alvo.y)) {
      const dx = alvo.x - posAlvoAnterior.x;
      const dy = alvo.y - posAlvoAnterior.y;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx || dy)) {
        direcaoAlvo = { dx: dx, dy: dy };
      }
    }
    posAlvoAnterior = { x: alvo.x, y: alvo.y };
  }

  function passoOnda(alvo, pos, entrada, agora) {
    lembrarDirecao(alvo);

    const preferido = direcaoAlvo ? ladoAtras(direcaoAlvo.dx, direcaoAlvo.dy) : -1;
    const ocupadas = new Set();
    if (Array.isArray(entrada.mobs)) {
      for (const m of entrada.mobs) {
        if (m && Number.isFinite(m.x) && Number.isFinite(m.y)) ocupadas.add(m.x + "," + m.y);
      }
    }
    const podeAndar = function (x, y) {
      if (entrada.caminavel && !entrada.caminavel(x, y)) return false;
      return !ocupadas.has(x + "," + y);
    };

    if (ladoOnda < 0 || agora >= avaliadoEm) {
      avaliadoEm = agora + cfg.intervaloOndaMs;
      ladoOnda = decidirLado({
        alvo: alvo,
        pos: pos,
        monstros: entrada.mobs,
        ladoAtual: ladoOnda,
        preferido: preferido,
        caminavel: podeAndar,
        distancia: cfg.distanciaOnda,
      });
    }

    if (ladoOnda < 0) return { acao: "esperar", motivo: "sem-vaga" };

    const casa = vaga(alvo, ladoOnda, cfg.distanciaOnda);
    const face = faceDoLado(ladoOnda);
    if (pos.x === casa.x && pos.y === casa.y) {
      return {
        acao: "esperar",
        motivo: "vaga-onda",
        face: face,
        lado: ladoOnda,
        vaga: casa,
        preferido: preferido,
      };
    }
    return {
      acao: "ir",
      x: casa.x,
      y: casa.y,
      alvo: alvoId,
      onda: true,
      lado: ladoOnda,
      face: face,
    };
  }

  // Retorna: ir | esperar | passo | perdeu | null
  function passo(entrada) {
    if (situacao !== "seguindo") return null;
    const agora = entrada.agora;
    const alvo = entrada.alvo;
    const pos = entrada.pos;

    if (alvo && Number.isFinite(alvo.x) && Number.isFinite(alvo.y)) {
      vistoEm = agora;
      if (!pos) return { acao: "esperar", motivo: "sem-posicao" };
      if (cfg.onda) return passoOnda(alvo, pos, entrada, agora);

      const dist = distancia(pos, alvo);
      if (dist <= cfg.alcance) return { acao: "esperar", motivo: "colado" };

      // Distância 0 = no MESMO tile do alvo. O `ir` do servidor não entra no tile
      // ocupado por outro jogador (testado ao vivo), então o último sqm é por `dir`
      // (o mesmo passo do joystick/teclado), um passo curto de cada vez.
      if (cfg.alcance === 0 && dist === 1) {
        if (passoEm !== 0 && agora - passoEm < 650) return { acao: "esperar", motivo: "subindo" };
        passoEm = agora;
        return {
          acao: "passo",
          dx: Math.sign(alvo.x - pos.x),
          dy: Math.sign(alvo.y - pos.y),
          alvo: alvoId,
        };
      }

      return { acao: "ir", x: alvo.x, y: alvo.y, alvo: alvoId };
    }

    if (agora - vistoEm > cfg.perdaMs) {
      situacao = "perdeu";
      return { acao: "perdeu", alvo: alvoId };
    }
    return { acao: "esperar", motivo: "alvo-fora-de-vista" };
  }

  return {
    seguir,
    parar,
    passo,
    definirAlcance,
    definirOnda,
    alcance: () => cfg.alcance,
    alcanceEfetivo: alcanceEfetivo,
    onda: () => cfg.onda,
    distanciaOnda: () => cfg.distanciaOnda,
    lado: () => ladoOnda,
    alvo: () => alvoId,
    situacao: () => situacao,
  };
}


// Escolha de alvo para ataque em área: a mesma ideia do AreaAttack do desktop.
//
// O círculo de 5 SQM (raio 2,5) é a área válida da magia, centrada no ALVO, não no
// personagem. Dá para ficar mais longe que esse círculo. O jogo, porém, só segura um
// alvo dentro de 7 SQM na horizontal e 5 na vertical; fora disso o auto-alvo dele
// desfaz a troca. A lógica é pura: não chama nada do jogo.
const RAIO = 2.5;
const KEEP_X = 7;
const KEEP_Y = 5;
// Ganho mínimo para trocar: com +1 os monstros andando faziam trocar a cada 0,6 s.
const GANHO_MIN = 2;
// Depois de uma troca, segura o alvo escolhido por esse tempo antes de reavaliar.
const HOLD_MS = 3000;

function distancia(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Pontua todos os monstros conhecidos, do melhor para o pior.
 *  O círculo é sempre em volta do candidato, mesmo que ele esteja longe do personagem. */
function pontuar(jogador, monstros) {
  const lista = (Array.isArray(monstros) ? monstros : []).filter(function (m) {
    return m && Number.isFinite(m.x) && Number.isFinite(m.y);
  });
  const pontos = [];
  for (const candidato of lista) {
    let count = 0;
    for (const outro of lista) {
      if (distancia(candidato, outro) <= RAIO) count += 1;
    }
    pontos.push({
      id: candidato.id,
      count: count,
      distance: jogador ? distancia(jogador, candidato) : 0,
    });
  }
  pontos.sort(function (a, b) {
    if (b.count !== a.count) return b.count - a.count;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.id - b.id;
  });
  return pontos;
}

/** O jogo mantém o alvo nesta janela 7x5 a partir do personagem. */
function mantem(jogador, monstros, id) {
  if (!jogador) return false;
  const alvo = (Array.isArray(monstros) ? monstros : []).find(function (m) {
    return m && m.id === id;
  });
  if (!alvo) return false;
  return Math.abs(alvo.x - jogador.x) <= KEEP_X && Math.abs(alvo.y - jogador.y) <= KEEP_Y;
}

/** Melhor alvo que o jogo vai segurar, ou null se não melhora o atual.
 *  Empate de contagem não troca. Alvo fora da janela 7x5 não é candidato: o jogo
 *  colocaria outro no lugar. Vizinhos fora da janela ainda contam no círculo. */
function escolher(jogador, monstros, atualId) {
  if (!jogador) return null;
  const pontos = pontuar(jogador, monstros);
  if (!pontos.length) return null;
  const atual = atualId == null ? null : pontos.find(function (p) { return p.id === atualId; }) || null;
  const melhor = pontos.find(function (p) { return mantem(jogador, monstros, p.id); }) || null;
  if (!melhor) return null;
  if (atual && melhor.count < atual.count + GANHO_MIN) return null;
  return melhor;
}

/** Controlador com histerese: troca no máximo uma vez a cada HOLD_MS. */
function criarArea(opcoes) {
  const cfg = Object.assign({ agora: () => Date.now(), holdMs: HOLD_MS }, opcoes || {});
  let alvo = null;
  let trocadoEm = 0;

  function passo(jogador, monstros, atualId, agora) {
    const quando = Number.isFinite(agora) ? agora : cfg.agora();
    if (atualId == null) {
      alvo = null;
    } else {
      alvo = atualId;
      if (trocadoEm !== 0 && quando - trocadoEm < cfg.holdMs) return null;
    }
    const escolha = escolher(jogador, monstros, alvo);
    if (!escolha) return null;
    if (escolha.id === alvo) return null;
    alvo = escolha.id;
    trocadoEm = quando;
    return escolha;
  }

  function reset() {
    alvo = null;
    trocadoEm = 0;
  }

  return {
    passo,
    reset,
    alvo: () => alvo,
    segurando: (agora) => trocadoEm !== 0 && (Number.isFinite(agora) ? agora : cfg.agora()) - trocadoEm < cfg.holdMs,
  };
}


// Re-target por distância: se o alvo atual ficou a mais de N sqm, escolhe o
// monstro mais próximo. A otimização de área tem prioridade e desliga esta regra
// no index (areaLigada vence).
const RETARGET_SQM_PADRAO = 6;

function cheb(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Retorna null quando não deve trocar; ou {id,x,y,distancia,antes}.
 * `atual` precisa ter x/y além do id. `limite` é em sqm (Chebyshev).
 */
function escolherRetarget(pos, atual, monstros, limite) {
  if (!pos || !atual || !Number.isFinite(atual.x) || !Number.isFinite(atual.y)) return null;
  const lim = Number.isFinite(Number(limite)) ? Number(limite) : RETARGET_SQM_PADRAO;
  if (lim <= 0) return null;
  const antes = cheb(pos, atual);
  if (antes <= lim) return null;

  let melhor = null;
  let melhorDist = Infinity;
  for (const m of Array.isArray(monstros) ? monstros : []) {
    if (!m || m.id === atual.id || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    const d = cheb(pos, m);
    if (d < melhorDist || (d === melhorDist && melhor && m.id < melhor.id)) {
      melhor = m;
      melhorDist = d;
    }
  }
  if (!melhor || melhorDist >= antes) return null;
  return {
    id: melhor.id,
    x: melhor.x,
    y: melhor.y,
    distancia: melhorDist,
    antes: antes,
  };
}


// Desvio local de monstro, inspirado no "occupied_detour" do WaypointController
// do desktop: quando o personagem não sai do lugar, a célula da frente está
// ocupada. Em vez de pular o waypoint, procura um vizinho andável que aproxime
// do destino e manda o `ir` para ele. A próxima leitura do estado reavalia.
//
// É puro: recebe `caminhavel(x,y)` e a lista de monstros. Não conhece Red/J.

const DIRECOES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function chave(x, y) {
  return x + "," + y;
}

function cheb(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Retorna o primeiro sqm de um desvio curto até um vizinho que aproxime do
 * destino, ou null se não há desvio melhor.
 * opcoes: { raio=5, passos=4, bloqueados=Set }
 */
function planejarDesvio(pos, destino, caminhavel, monstros, opcoes) {
  if (!pos || !destino || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)
      || !Number.isFinite(destino.x) || !Number.isFinite(destino.y)) return null;
  const cfg = Object.assign({ raio: 5, passos: 4, raioMonstros: 3, bloqueados: null }, opcoes || {});
  const bloqueados = cfg.bloqueados instanceof Set ? cfg.bloqueados : new Set();
  const ocupados = new Set();
  for (const m of Array.isArray(monstros) ? monstros : []) {
    if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    if (Math.max(Math.abs(m.x - pos.x), Math.abs(m.y - pos.y)) <= cfg.raioMonstros) {
      ocupados.add(chave(m.x, m.y));
    }
  }

  const inicio = { x: Math.round(pos.x), y: Math.round(pos.y) };
  const alvo = { x: Math.round(destino.x), y: Math.round(destino.y) };
  const pode = function (x, y) {
    if (Math.abs(x - inicio.x) > cfg.raio || Math.abs(y - inicio.y) > cfg.raio) return false;
    if (x === inicio.x && y === inicio.y) return true;
    const k = chave(x, y);
    if (bloqueados.has(k) || ocupados.has(k)) return false;
    try {
      return caminhavel ? !!caminhavel(x, y) : true;
    } catch (e) {
      return true;
    }
  };

  const fila = [inicio];
  const anterior = new Map([[chave(inicio.x, inicio.y), null]]);
  const passos = new Map([[chave(inicio.x, inicio.y), 0]]);
  let melhor = null;
  let melhorNota = null;
  const nota = function (c) {
    return [cheb(c, alvo), manhattan(c, alvo), passos.get(chave(c.x, c.y))];
  };
  const menor = function (a, b) {
    if (!b) return true;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return a[i] < b[i];
    }
    return false;
  };

  while (fila.length) {
    const atual = fila.shift();
    const d = passos.get(chave(atual.x, atual.y));
    if (!(atual.x === inicio.x && atual.y === inicio.y)) {
      const n = nota(atual);
      if (menor(n, melhorNota)) {
        melhor = atual;
        melhorNota = n;
      }
    }
    if (d >= cfg.passos) continue;
    for (const [dx, dy] of DIRECOES) {
      const nx = atual.x + dx;
      const ny = atual.y + dy;
      const k = chave(nx, ny);
      if (!pode(nx, ny) || anterior.has(k)) continue;
      anterior.set(k, chave(atual.x, atual.y));
      passos.set(k, d + 1);
      fila.push({ x: nx, y: ny });
    }
  }

  if (!melhor) return null;
  const notaInicio = [cheb(inicio, alvo), manhattan(inicio, alvo), 0];
  if (!menor(melhorNota, notaInicio)) return null;

  // Reconstrói do melhor até o início e devolve o primeiro passo.
  let atual = melhor;
  let pai = anterior.get(chave(atual.x, atual.y));
  while (pai && pai !== chave(inicio.x, inicio.y)) {
    const [px, py] = pai.split(",").map(Number);
    atual = { x: px, y: py };
    pai = anterior.get(pai);
  }
  return { x: atual.x, y: atual.y };
}


// Mantém o RTC (Hunt Assist / auto-ataque) ligado usando exatamente o mesmo
// caminho do botão RTC do cliente:
//   Asistente.aa.on = true; Asistente.mandarAA();
// Não embrulha Red/WebSocket/JSON e não cria pacote novo.
function criarRtcSempre(opcoes) {
  const cfg = Object.assign({
    ligado: false,
    obter: () => null,
    pedir: null,
    interfaceAberta: null,
    agora: () => Date.now(),
    log: null,
    maxFalhas: 3,
    backoffMs: 60000,
    pedidoMs: 8000,
  }, opcoes || {});

  let ativo = !!cfg.ligado;
  let falhas = 0;
  let bloqueadoAte = 0;
  let pedidoEm = -1;
  let ultimaTentativa = 0;

  function logar(nome, dados) {
    if (cfg.log) cfg.log(nome, Object.assign({}, dados || {}));
  }

  function definirLigado(v) {
    ativo = !!v;
    falhas = 0;
    bloqueadoAte = 0;
    pedidoEm = -1;
    return ativo;
  }

  // Devolve { acao: desligado|interface|sem-cliente|pedindo|ativo|backoff|reativado|erro }
  function passo() {
    if (!ativo) return { acao: "desligado" };

    // RTC/menu abertos: deixa o jogador mexer sem o watchdog religar por baixo.
    if (cfg.interfaceAberta) {
      try {
        if (cfg.interfaceAberta()) return { acao: "interface" };
      } catch (e) { /* segue */ }
    }

    let assistente = null;
    try {
      assistente = cfg.obter ? cfg.obter() : null;
    } catch (e) {
      assistente = null;
    }
    if (!assistente) return { acao: "sem-cliente" };

    const agora = cfg.agora();
    const aa = assistente.aa;
    if (!aa) {
      // Ainda não recebeu a configuração do Hunt Assist: pede uma vez e espera.
      if (cfg.pedir && (pedidoEm < 0 || agora - pedidoEm >= cfg.pedidoMs)) {
        pedidoEm = agora;
        try { cfg.pedir(); } catch (e) { /* tenta de novo */ }
        logar("rtc_pedido", {});
      }
      return { acao: "pedindo" };
    }

    if (aa.on === true) {
      if (falhas !== 0 || bloqueadoAte !== 0) {
        falhas = 0;
        bloqueadoAte = 0;
      }
      return { acao: "ativo" };
    }

    if (agora < bloqueadoAte) {
      return { acao: "backoff", restanteMs: bloqueadoAte - agora };
    }

    // O servidor pode recusar (sem suporte/energia). Não martela a cada 2 s.
    if (falhas >= cfg.maxFalhas) {
      bloqueadoAte = agora + cfg.backoffMs;
      falhas = 0;
      logar("rtc_recusado", { esperaMs: cfg.backoffMs });
      return { acao: "backoff", restanteMs: cfg.backoffMs };
    }

    try {
      aa.on = true;
      if (typeof assistente.mandarAA !== "function") {
        return { acao: "sem-mandar" };
      }
      assistente.mandarAA();
      falhas += 1;
      ultimaTentativa = agora;
      logar("rtc_reativado", { tentativa: falhas });
      return { acao: "reativado", tentativa: falhas };
    } catch (e) {
      falhas += 1;
      logar("rtc_erro", { erro: String(e) });
      return { acao: "erro" };
    }
  }

  function estado() {
    return {
      ligado: ativo,
      falhas: falhas,
      bloqueadoAte: bloqueadoAte,
      ultimaTentativa: ultimaTentativa,
    };
  }

  return { passo, definirLigado, estado };
}


// Estimativa de consumo de suprimentos por item, como o SupplyEstimator do
// desktop. O total sozinho engana: poções de vida caem enquanto as de mana sobem
// com loot, e o saldo agregado parece "sem consumo" para sempre.
//
// Cada amostra guarda o acumulado de saída (gasto) e entrada (loot). O tempo
// restante usa o saldo líquido; se o loot repõe tudo, mostramos "loot repõe".
const JANELA_MS = 10 * 60000;
const MINIMO_MS = 30000;
const MINIMO_CONSUMO = 3;
const RECENTE_MS = 120000;
const LOOT_MAX = 20;

function criarSuprimentos(opcoes) {
  const cfg = Object.assign({
    janelaMs: JANELA_MS,
    minimoMs: MINIMO_MS,
    minimoConsumo: MINIMO_CONSUMO,
    recenteMs: RECENTE_MS,
    lootMax: LOOT_MAX,
  }, opcoes || {});

  let modo = "total";
  let totalAmostras = [];
  let ultimo = new Map();
  const registros = new Map();

  function chave(item) {
    return String(item && item.id != null ? item.id : item && item.nome ? item.nome : "item");
  }

  function registrarTotal(contagem, agora) {
    if (!Number.isFinite(contagem)) return;
    modo = "total";
    totalAmostras.push({ t: agora, v: contagem });
    const corte = agora - cfg.janelaMs * 2;
    while (totalAmostras.length && totalAmostras[0].t < corte) totalAmostras.shift();
  }

  // lista: [{id,nome,tipo,quantidade}] do inventário (poções).
  function registrarItens(lista, agora) {
    modo = "itens";
    const atual = new Map();
    (Array.isArray(lista) ? lista : []).forEach(function (item) {
      if (!item) return;
      const k = chave(item);
      const q = Math.max(0, Number(item.quantidade) || 0);
      const anterior = atual.get(k);
      if (anterior) {
        anterior.quantidade += q;
      } else {
        atual.set(k, {
          id: item.id,
          nome: item.nome || "",
          tipo: item.tipo || "outro",
          quantidade: q,
        });
      }
    });

    // Item que sumiu do inventário entra com 0 para detectar esgotamento.
    for (const [k, h] of registros) {
      if (!atual.has(k)) {
        atual.set(k, { id: h.id, nome: h.nome, tipo: h.tipo, quantidade: 0 });
      }
    }

    for (const [k, item] of atual) {
      let h = registros.get(k);
      if (!h) {
        h = {
          id: item.id,
          nome: item.nome,
          tipo: item.tipo,
          quantidade: 0,
          out: 0,
          in: 0,
          used: false,
          lastLoss: 0,
          samples: [],
        };
        registros.set(k, h);
      }
      const antes = ultimo.get(k);
      if (antes != null) {
        if (item.quantidade > antes) {
          const delta = item.quantidade - antes;
          if (delta > cfg.lootMax) {
            // Compra/depósito: recomeça a medição desse item.
            h.out = 0;
            h.in = 0;
            h.used = false;
            h.lastLoss = 0;
            h.samples = [];
          } else {
            h.in += delta;
          }
        } else if (item.quantidade < antes) {
          h.out += antes - item.quantidade;
          h.used = true;
          h.lastLoss = agora;
        }
      }
      h.id = item.id;
      h.nome = item.nome || h.nome;
      h.tipo = item.tipo || h.tipo;
      h.quantidade = item.quantidade;
      h.samples.push({ t: agora, out: h.out, in: h.in });
      const corte = agora - cfg.janelaMs * 2;
      while (h.samples.length && h.samples[0].t < corte) h.samples.shift();
    }

    ultimo = new Map();
    for (const [k, item] of atual) ultimo.set(k, item.quantidade);
  }

  function registrar(valor, agora) {
    if (typeof valor === "number") registrarTotal(valor, agora);
    else registrarItens(valor, agora);
  }

  function resumo(agora) {
    if (modo === "total") {
      const taxa = porHoraTotal(agora);
      return {
        itens: [],
        quantidade: totalAmostras.length ? totalAmostras[totalAmostras.length - 1].v : 0,
        consumoHora: taxa,
        gastaHora: taxa,
        repoeHora: 0,
        gastaMin: taxa / 60,
        repoeMin: 0,
        saidas: 0,
        entradas: 0,
        janelaMin: 0,
        restanteMin: restanteTotal(agora),
        status: taxa > 0 ? "estimado" : "coletando dados",
      };
    }

    const itens = [];
    let quantidade = 0;
    let limite = null;
    let gasto = 0;
    let reposto = 0;
    let saidas = 0;
    let entradas = 0;
    let janelaMax = 0;
    let temLoot = false;
    let temEsgotado = false;
    let temColetando = false;

    for (const h of registros.values()) {
      const janela = h.samples.filter((a) => a.t >= agora - cfg.janelaMs);
      const primeiro = janela[0];
      const ultimoItem = janela[janela.length - 1];
      const elapsed = primeiro && ultimoItem ? ultimoItem.t - primeiro.t : 0;
      const spent = primeiro && ultimoItem ? h.out - primeiro.out : 0;
      const gained = primeiro && ultimoItem ? h.in - primeiro.in : 0;
      const net = spent - gained;
      const gastoMin = elapsed > 0 ? spent * 60000 / elapsed : 0;
      const repoeMin = elapsed > 0 ? gained * 60000 / elapsed : 0;
      const gastoHora = gastoMin * 60;
      const repoeHora = repoeMin * 60;

      let status;
      let restanteMin = null;
      if (h.quantidade === 0 && h.used) {
        status = "esgotado";
        restanteMin = 0;
        temEsgotado = true;
      } else if (h.used && agora - h.lastLoss > cfg.recenteMs) {
        status = "sem gasto recente";
      } else if (elapsed < cfg.minimoMs || spent < cfg.minimoConsumo) {
        status = "coletando dados";
        temColetando = true;
      } else if (net <= 0) {
        status = "loot repõe";
        temLoot = true;
      } else {
        status = "estimado";
        const porMinuto = net / (elapsed / 60000);
        restanteMin = porMinuto > 0 ? h.quantidade / porMinuto : null;
        if (restanteMin !== null && (limite === null || restanteMin < limite)) {
          limite = restanteMin;
        }
      }

      quantidade += h.quantidade;
      gasto += gastoHora;
      reposto += repoeHora;
      saidas += spent;
      entradas += gained;
      janelaMax = Math.max(janelaMax, elapsed / 60000);
      itens.push({
        id: h.id,
        nome: h.nome,
        tipo: h.tipo,
        quantidade: h.quantidade,
        status: status,
        gastaHora: gastoHora,
        repoeHora: repoeHora,
        gastaMin: gastoMin,
        repoeMin: repoeMin,
        saidas: spent,
        entradas: gained,
        janelaMin: elapsed / 60000,
        restanteMin: restanteMin,
      });
    }

    let status = "coletando dados";
    if (temEsgotado) status = "esgotado";
    else if (limite !== null) status = "estimado";
    else if (temLoot) status = "loot repõe";
    else if (!temColetando && itens.length && itens.every((i) => i.status === "sem gasto recente")) {
      status = "sem gasto recente";
    }

    return {
      itens: itens,
      quantidade: quantidade,
      consumoHora: Math.max(0, gasto - reposto),
      gastaHora: gasto,
      repoeHora: reposto,
      gastaMin: gasto / 60,
      repoeMin: reposto / 60,
      saidas: saidas,
      entradas: entradas,
      janelaMin: janelaMax,
      restanteMin: limite,
      status: status,
    };
  }

  function porHoraTotal(agora) {
    const j = totalAmostras.filter((a) => a.t >= agora - cfg.janelaMs);
    if (j.length < 2) return 0;
    const span = j[j.length - 1].t - j[0].t;
    const consumo = j[0].v - j[j.length - 1].v;
    if (span < cfg.minimoMs || consumo < cfg.minimoConsumo) return 0;
    return (consumo / span) * 3600000;
  }

  function restanteTotal(agora) {
    const taxa = porHoraTotal(agora);
    if (!(taxa > 0)) return null;
    const q = totalAmostras.length ? totalAmostras[totalAmostras.length - 1].v : 0;
    return (q / taxa) * 60;
  }

  // Compatibilidade com o painel antigo e com testes numéricos.
  function porHora(agora) {
    return modo === "total" ? porHoraTotal(agora) : resumo(agora).consumoHora;
  }

  function restanteMin(quantidade, agora) {
    if (modo !== "total") return resumo(agora).restanteMin;
    const taxa = porHoraTotal(agora);
    if (!(taxa > 0)) return null;
    return ((Number(quantidade) || 0) / taxa) * 60;
  }

  function reset() {
    modo = "total";
    totalAmostras = [];
    ultimo = new Map();
    registros.clear();
  }

  function amostras() {
    return modo === "total" ? totalAmostras.slice() : [];
  }

  return {
    registrar,
    porHora,
    restanteMin,
    resumo,
    reset,
    amostras,
  };
}


// Anti-bot: responde "Não" na janela do servidor, com atraso aleatório e contagem.
function criarAntiBot(opcoes) {
  const cfg = Object.assign({
    ponte: null,
    ensaio: false,
    atrasoMin: 700,
    atrasoMax: 1600,
    aleatorio: Math.random,
    agendar: (fn, ms) => setTimeout(fn, ms),
    aoVer: null,
    aoResponder: null,
    aoEnsaio: null,
  }, opcoes || {});

  let ligado = true;
  let respondidas = 0;
  const vistos = new Set();

  function escolherNao(mensagem) {
    const botoes = Array.isArray(mensagem && mensagem.b) ? mensagem.b : [];
    for (let i = 0; i < botoes.length; i += 1) {
      const b = botoes[i];
      if (/^(no|não|nao)$/i.test(String((b && b.tx) || "").trim())) return b;
    }
    return null;
  }

  function aoReceber(mensagem) {
    if (!ligado || !mensagem || mensagem.cerrar || !mensagem.id) return;
    if (vistos.has(mensagem.id)) return;
    const botao = escolherNao(mensagem);
    if (!botao) return;

    vistos.add(mensagem.id);
    if (cfg.aoVer) cfg.aoVer(mensagem);

    const espera = cfg.atrasoMin + Math.floor(cfg.aleatorio() * (cfg.atrasoMax - cfg.atrasoMin));
    cfg.agendar(function () {
      if (!ligado) return;
      if (cfg.ensaio) {
        if (cfg.aoEnsaio) cfg.aoEnsaio(mensagem.id, botao.k);
        return;
      }
      if (!cfg.ponte || !cfg.ponte.responderEresBot(mensagem.id, botao.k)) return;
      respondidas += 1;
      if (cfg.aoResponder) cfg.aoResponder(mensagem.id, botao.k);
    }, espera);
  }

  function assinar() {
    if (!cfg.ponte) return false;
    return cfg.ponte.aoReceber("eresBot", aoReceber);
  }

  return {
    assinar,
    aoReceber,
    ligado: () => ligado,
    definirLigado: (v) => { ligado = !!v; },
    ensaio: () => !!cfg.ensaio,
    definirEnsaio: (v) => { cfg.ensaio = !!v; },
    respondidas: () => respondidas,
    zerar: () => { respondidas = 0; },
  };
}


// Ponte com o cliente web. É o único arquivo que conhece `Red`, `J`, `Hud` e `EresBot`.
//
// Atenção: `J.yo` é o retrato do login e NÃO acompanha o personagem. A posição real
// está na entidade `J.ents.get("j" + J.miId)`; vida/mana/exp vivos estão em `Hud.yo`
// (o próprio `Hud.ponerYo` copia os campos para lá).
function criarPonteNavegador() {
  // IDs fixos do cliente: 4101-4105 = mana, 4201-4205/4251/4252 = vida.
  // A tabela `Hud.datos.objetos` dá o nome real; os IDs evitam depender do idioma.
  const POCOES_MANA = new Set([4101, 4102, 4103, 4104, 4105]);
  const POCOES_VIDA = new Set([4201, 4202, 4203, 4204, 4205, 4251, 4252]);

  function cru() {
    return {
      Red: window.Red,
      J: window.J,
      Hud: window.Hud,
      EresBot: window.EresBot,
      Pelea: window.Pelea,
      MenuLow: window.MenuLow,
    };
  }

  function pronto() {
    const w = cru();
    return !!(w.Red && w.J);
  }

  function entidadeDe(chave) {
    const w = cru();
    const mapa = w.J && w.J.ents;
    if (!mapa || typeof mapa.get !== "function") return null;
    return mapa.get(chave) || null;
  }

  function eu() {
    const w = cru();
    const j = w.J || {};
    return (w.Hud && w.Hud.yo) || j.yo || null;
  }

  function minhaEntidade() {
    const w = cru();
    const j = w.J;
    if (!j || !j.ents || j.miId == null) return null;
    return entidadeDe("j" + j.miId);
  }

  function estado() {
    const w = cru();
    const j = w.J || {};
    const yo = eu();
    const ent = minhaEntidade();

    const x = ent && Number.isFinite(ent.x) ? ent.x : yo && Number.isFinite(yo.x) ? yo.x : null;
    const y = ent && Number.isFinite(ent.y) ? ent.y : yo && Number.isFinite(yo.y) ? yo.y : null;
    const piso = ent && Number.isFinite(ent.piso) ? ent.piso : yo && Number.isFinite(yo.piso) ? yo.piso : null;
    const vida = yo && Number.isFinite(yo.vida) ? yo.vida : null;
    // O painel do cliente guarda a stamina em segundos em `MenuLow.energia.a`.
    const energiaSeg = w.MenuLow && w.MenuLow.energia
      && Number.isFinite(w.MenuLow.energia.a) ? w.MenuLow.energia.a : null;

    // `exp` é o XP dentro do nível; `expNivel` é o XP acumulado até o nível atual.
    const expNivel = yo && Number.isFinite(yo.expNivel) ? yo.expNivel : 0;
    const exp = yo && Number.isFinite(yo.exp) ? yo.exp : null;

    return {
      emJogo: !!j.enJuego,
      pos: x !== null && y !== null ? { x: x, y: y, z: piso } : null,
      vivo: !(yo && yo.muerto) && (vida === null || vida > 0),
      nome: (yo && (yo.nombre || yo.nome)) || (ent && ent.nombre) || null,
      nivel: yo && Number.isFinite(yo.nivel) ? yo.nivel : null,
      xp: exp === null ? null : expNivel + exp,
      xpNivel: exp,
      xpProximo: yo && Number.isFinite(yo.expSig) ? yo.expSig : null,
      estamina: energiaSeg !== null
        ? energiaSeg / 3600
        : yo && Number.isFinite(yo.estamina) ? yo.estamina : null,
      vida: vida,
      vidaMax: yo && Number.isFinite(yo.vidaMax) ? yo.vidaMax : null,
      mana: yo && Number.isFinite(yo.mana) ? yo.mana : null,
      manaMax: yo && Number.isFinite(yo.manaMax) ? yo.manaMax : null,
    };
  }

  function entidade(id) {
    const e = entidadeDe("j" + id) || entidadeDe("m" + id);
    if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y)) return null;
    return {
      x: e.x,
      y: e.y,
      nome: e.nombre || e.nome || null,
      piso: Number.isFinite(e.piso) ? e.piso : null,
      mundo: Number.isFinite(e.mundo) ? e.mundo : null,
      morto: !!e.muerto,
    };
  }

  // Jogadores visíveis (entidades "j..."), do mais perto para o mais longe.
  function jogadores() {
    const w = cru();
    const j = w.J;
    if (!j || !j.ents || typeof j.ents[Symbol.iterator] !== "function") return [];
    const meu = minhaEntidade();
    const lista = [];
    for (const [chave, e] of j.ents) {
      if (!chave || chave[0] !== "j") continue;
      const id = Number(chave.slice(1));
      if (!Number.isFinite(id) || id === j.miId) continue;
      if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      const dist = meu ? Math.max(Math.abs(e.x - meu.x), Math.abs(e.y - meu.y)) : null;
      lista.push({ id: id, nome: e.nombre || e.nome || "", x: e.x, y: e.y, dist: dist });
    }
    lista.sort(function (a, b) {
      if (a.dist === null) return 1;
      if (b.dist === null) return -1;
      return a.dist - b.dist;
    });
    return lista;
  }

  function enviar(msg) {
    const w = cru();
    if (!w.Red || typeof w.Red.enviar !== "function") return false;
    return w.Red.enviar(msg) !== false;
  }

  // Monstros vivos visíveis (entidades "m..."), para a escolha de alvo em área.
  function monstros() {
    const w = cru();
    const j = w.J;
    if (!j || !j.ents || typeof j.ents[Symbol.iterator] !== "function") return [];
    const eu = minhaEntidade();
    const lista = [];
    for (const [chave, e] of j.ents) {
      if (!chave || chave[0] !== "m") continue;
      const id = Number(chave.slice(1));
      if (!Number.isFinite(id)) continue;
      if (!e || e.muerto || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      if (eu) {
        if (eu.mundo != null && e.mundo != null && e.mundo !== eu.mundo) continue;
        if (eu.piso != null && e.piso != null && e.piso !== eu.piso) continue;
      }
      lista.push({ id: id, x: e.x, y: e.y });
    }
    return lista;
  }

  // Alvo atual do cliente quando é monstro (a UI guarda em `Pelea.obj`).
  function objetivo() {
    const w = cru();
    const p = w.Pelea;
    if (!p || !p.obj || p.obj.tipo !== "m") return null;
    const id = Number(p.obj.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  // Mesmo caminho da interface (`Pelea.poner`); cai para o envio direto se mudar.
  function mirar(id) {
    const w = cru();
    try {
      if (w.Pelea && typeof w.Pelea.poner === "function") {
        w.Pelea.poner("m", id, true);
        return true;
      }
    } catch (e) {
      // sem Pelea: manda a mesma mensagem
    }
    return enviar({ t: "objetivo", monstruo: id });
  }

  // Gira sem andar. Formato da tecla Ctrl+seta do cliente:
  // a = 0 baixo, 1 cima, 2 esquerda, 3 direita.
  function girar(face) {
    const a = Number(face);
    if (!Number.isInteger(a) || a < 0 || a > 3) return false;
    return enviar({ t: "pc", k: "xd", d: { a: a } });
  }

  // Assina sem duplicar. O cliente pode trocar `Red.manejadores[tipo]` inteiro
  // (o `vb03.js` faz isso com `tareaRepetir`), então o chamador pode repetir
  // esta função depois do `load` e a cada ciclo para recolocar o handler.
  function garantirHandler(tipo, fn) {
    const w = cru();
    const manejadores = w.Red && w.Red.manejadores;
    if (!manejadores || typeof manejadores !== "object") return false;
    const lista = manejadores[tipo] || (manejadores[tipo] = []);
    if (!Array.isArray(lista)) return false;
    if (!lista.includes(fn)) lista.push(fn);
    return true;
  }

  function aoReceber(tipo, fn) {
    if (garantirHandler(tipo, fn)) return true;
    const w = cru();
    if (!w.Red || typeof w.Red.al !== "function") return false;
    w.Red.al(tipo, fn);
    return true;
  }

  // Estado atual da task no HUD do cliente. O `Hud.tareas` substitui o item
  // inteiro em cada mensagem `tarea`/`tareas`.
  function tarefa(id) {
    const w = cru();
    const lista = w.Hud && Array.isArray(w.Hud.listaTareas) ? w.Hud.listaTareas : null;
    if (!lista) return null;
    const alvo = Number(id);
    for (const t of lista) {
      if (!t || Number(t.id) !== alvo) continue;
      const numero = function (v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      return {
        id: alvo,
        estado: Number.isFinite(Number(t.estado)) ? Number(t.estado) : null,
        vezes: numero(t.vezes),
        matados: numero(t.matados),
        meta: numero(t.meta),
        nombre: t.nombre || null,
      };
    }
    return null;
  }

  // O popup atual do `tareaRepetir` é o aviso compacto `#aviso-tarea`; a versão
  // antiga do cliente usava um `.lo-dlg`. Fecha pelo método interno, sem clique
  // sintético. Se o aviso existe, não fecha outro diálogo por engano.
  function fecharAvisoTarefa() {
    try {
      if (typeof document.getElementById !== "function") return false;
      const aviso = document.getElementById("aviso-tarea");
      if (aviso) {
        if (typeof aviso._quitar === "function") aviso._quitar();
        return "aviso";
      }
    } catch (e) { /* sem aviso */ }
    try {
      if (typeof document.querySelectorAll !== "function") return false;
      const dialogos = document.querySelectorAll("#hud .lo-dlg");
      const ultimo = dialogos.length ? dialogos[dialogos.length - 1] : null;
      if (ultimo && typeof ultimo._cerrar === "function") {
        ultimo._cerrar();
        return "dialogo";
      }
    } catch (e) { /* sem diálogo */ }
    return false;
  }

  // Mesmo caminho da interface; cai para o envio direto se a janela já mudou.
  function responderEresBot(id, chave) {
    const w = cru();
    if (!w.Red) return false;
    if (w.EresBot && typeof w.EresBot.tocar === "function" && w.EresBot.m && w.EresBot.m.id === id) {
      w.EresBot.tocar(chave);
      return true;
    }
    return enviar({ t: "chat", canal: "local", texto: "/ebr " + id + " " + chave });
  }

  function inventario() {
    const w = cru();
    const inv = (w.Hud && w.Hud.inv) || {};
    const somar = function (lista) {
      const mapa = {};
      (Array.isArray(lista) ? lista : []).forEach(function (o) {
        if (!o || !o.objeto) return;
        mapa[o.objeto] = (mapa[o.objeto] || 0) + (o.cant || 1);
      });
      return mapa;
    };
    return {
      mochila: somar(inv.mochila),
      botin: somar(inv.botin),
      oro: Number(inv.oro) || 0,
    };
  }

  // Poções e afins: usa o nome do item (Hud preenche `nombre`) ou a tabela do jogo.
  function suprimentos() {
    const w = cru();
    const inv = (w.Hud && w.Hud.inv) || {};
    const tabela = (w.Hud && w.Hud.datos && w.Hud.datos.objetos) || {};
    let vida = 0;
    let mana = 0;
    let itens = 0;
    const pocoes = new Map();

    (Array.isArray(inv.mochila) ? inv.mochila : []).forEach(function (o) {
      if (!o) return;
      const qtd = Number(o.cant) || 0;
      itens += qtd;
      const idNum = Number(o.objeto);
      const daTabela = tabela[o.objeto] && tabela[o.objeto][0];
      const nome = o.nombre || daTabela || ("#" + o.objeto);
      let tipo = null;
      if (POCOES_VIDA.has(idNum)) {
        vida += qtd;
        tipo = "vida";
      } else if (POCOES_MANA.has(idNum)) {
        mana += qtd;
        tipo = "mana";
      } else if (/health potion|poci[oó]n de vida|po[cç][aã]o de vida/i.test(nome)) {
        vida += qtd;
        tipo = "vida";
      } else if (/mana potion|poci[oó]n de man[aá]|po[cç][aã]o de man[aá]/i.test(nome)) {
        mana += qtd;
        tipo = "mana";
      }
      if (!tipo) return;
      const chave = String(o.objeto != null ? o.objeto : nome);
      const atual = pocoes.get(chave);
      if (atual) {
        atual.quantidade += qtd;
      } else {
        pocoes.set(chave, {
          id: o.objeto != null ? o.objeto : nome,
          nome: nome,
          tipo: tipo,
          quantidade: qtd,
        });
      }
    });

    return {
      vida: vida,
      mana: mana,
      itens: itens,
      oro: Number(inv.oro) || 0,
      pocoes: Array.from(pocoes.values()),
    };
  }

  function caminavel(x, y) {
    const w = cru();
    let m = null;
    try {
      if (typeof mapa !== "undefined") m = mapa;
    } catch (e) {
      m = null;
    }
    if (!m) m = w.mapa || null;
    if (!m || typeof m.caminable !== "function") return true;
    try {
      return !!m.caminable(x, y);
    } catch (e) {
      return true;
    }
  }

  // Interface do jogo aberta (inventário, opções, task, RTC etc). É só leitura de
  // estado/DOM: não envolve função nenhuma do cliente e não altera a página.
  // O objetivo é parar o laço enquanto o jogador mexe na interface e evitar que o
  // watchdog reinjete o driver durante um menu pesado.
  function interfaceAberta() {
    const w = cru();
    try {
      if (w.MenuLow && typeof w.MenuLow.abierto === "function" && w.MenuLow.abierto()) return true;
    } catch (e) { /* sem menu */ }
    try {
      if (w.Hud && w.Hud.ventanaTipo) return true;
      const ventana = document.getElementById("ventana");
      if (ventana && ventana.hidden === false) return true;
      const menu = document.getElementById("vmenu");
      if (menu && menu.hidden === false) return true;
      // Aviso compacto de task completa (versão atual do cliente).
      if (document.getElementById("aviso-tarea")) return true;
      // Diálogos do próprio cliente (NPC, banco, task, RTC...). A coleção é viva
      // e só o tamanho é consultado; não força layout.
      if (document.getElementsByClassName("lo-dlg").length > 0) return true;
    } catch (e) { /* DOM ainda carregando */ }
    return false;
  }

  return {
    pronto, estado, entidade, jogadores, enviar, aoReceber, garantirHandler,
    responderEresBot, inventario, suprimentos, caminavel, monstros, objetivo,
    mirar, girar, tarefa, fecharAvisoTarefa, interfaceAberta,
  };
}


// Repetição de tasks: envia o mesmo pacote do botão oficial do cliente e só
// conta a task depois que o servidor confirma que ela voltou a ficar ativa.
//
// O cliente publica o popup `tareaRepetir`, mas o array de handlers pode ser
// substituído por outro script do jogo. Quem assina (`index.js`) usa
// `ponte.garantirHandler` e recoloca este handler sem duplicar.
function criarTarefas(opcoes) {
  const cfg = Object.assign({
    confirmarMs: 5000,
    agora: Date.now,
  }, opcoes || {});
  const pendentes = new Map();

  function ligado() {
    return typeof cfg.ligado === "function" ? !!cfg.ligado() : true;
  }

  function logar(nome, dados) {
    if (!cfg.log || typeof cfg.log.evento !== "function") return;
    try { cfg.log.evento(nome, dados); } catch (e) { /* log nunca derruba a task */ }
  }

  function lerTarefa(id) {
    if (typeof cfg.tarefa !== "function") return null;
    try { return cfg.tarefa(id) || null; } catch (e) { return null; }
  }

  function fechar() {
    if (typeof cfg.fechar !== "function") return false;
    try { return cfg.fechar(); } catch (e) { return false; }
  }

  function enviar(msg) {
    if (typeof cfg.enviar !== "function") return false;
    try { return cfg.enviar(msg) !== false; } catch (e) { return false; }
  }

  // A task repetida volta para "em andamento" (1) ou "falta o chefe" (3), ou
  // então o contador de vezes sobe / o progresso de mortes zera.
  function confirmou(antes, depois) {
    if (!depois) return false;
    if (!antes) return depois.estado === 1 || depois.estado === 3;
    if (antes.estado === 2 && (depois.estado === 1 || depois.estado === 3)) return true;
    if (depois.vezes > antes.vezes) return true;
    if (depois.matados < antes.matados) return true;
    return false;
  }

  function contar(id, antes, depois) {
    pendentes.delete(id);
    if (cfg.sessao && typeof cfg.sessao.tarefaConcluida === "function") {
      cfg.sessao.tarefaConcluida();
    }
    logar("tarefa_repetida", { id: id, antes: antes, depois: depois });
  }

  // Popup "Tarefa completa": uma ação por conclusão. Se a mesma conclusão
  // chegar de novo enquanto a anterior não confirmou, não envia outra.
  function aoConcluir(m) {
    if (!m || !m.id) return;
    if (!ligado()) return;
    const id = Number(m.id);
    if (!Number.isFinite(id) || id <= 0) return;

    const agora = cfg.agora();
    const pendente = pendentes.get(id);
    if (pendente && agora < pendente.deadline) {
      const fechou = fechar();
      logar("tarefa_repetir_duplicada", { id: id, fechou: fechou });
      return;
    }

    const antes = lerTarefa(id);
    pendentes.set(id, {
      id: id,
      antes: antes,
      em: agora,
      deadline: agora + cfg.confirmarMs,
    });

    if (!enviar({ t: "tarea", id: id, accion: "repetir" })) {
      pendentes.delete(id);
      logar("tarefa_repetir_falhou", { id: id, motivo: "envio" });
      return;
    }

    const fechou = fechar();
    logar("tarefa_completa", { id: id, accion: "repetir", antes: antes, fechou: fechou });
  }

  // `tarea` e `tareas` chegam depois da repetição. O `Hud` do cliente já
  // atualizou a lista quando este handler roda (ele assina antes do Olivia).
  function aoAtualizar() {
    if (!pendentes.size) return;
    for (const [id, p] of Array.from(pendentes.entries())) {
      const depois = lerTarefa(id);
      if (confirmou(p.antes, depois)) contar(id, p.antes, depois);
    }
  }

  // Rede de segurança: confirma pelo estado atual e, se o prazo passou sem
  // confirmação, não conta. O painel nunca mostra uma repetição que não houve.
  function passo(agora) {
    if (!pendentes.size) return;
    const t = Number.isFinite(agora) ? agora : cfg.agora();
    for (const [id, p] of Array.from(pendentes.entries())) {
      if (t < p.deadline) continue;
      const depois = lerTarefa(id);
      if (confirmou(p.antes, depois)) {
        contar(id, p.antes, depois);
        continue;
      }
      pendentes.delete(id);
      logar("tarefa_nao_confirmada", { id: id, antes: p.antes, depois: depois });
    }
  }

  function zerar() {
    pendentes.clear();
  }

  function info() {
    return Array.from(pendentes.values()).map(function (p) {
      return { id: p.id, em: p.em, deadline: p.deadline, antes: p.antes };
    });
  }

  return {
    aoConcluir,
    aoAtualizar,
    passo,
    zerar,
    info,
    confirmou,
  };
}


// Motor: laço único que junta estado, rota/seguidor, humanização, sessão e anti-bot.

function criarMotor(opcoes) {
  const cfg = Object.assign({
    ponte: null,
    intervaloMs: 250,
    reenvioMs: 1200,
    // O servidor ignora `ir` para destinos a mais de 8 tiles (medido ao vivo).
    // Andamos em trechos de 6 para folga.
    passoTiles: 6,
    intervaloMinimoMs: 400,
    // Tempo parado antes de tratar a célula da frente como ocupada por monstro.
    paradoDesvioMs: 1000,
    desvioDuracaoMs: 2200,
    agora: () => Date.now(),
  }, opcoes || {});

  const registro = cfg.log || criarLog();
  const sessao = cfg.sessao || criarSessao({ agora: cfg.agora });
  const humano = cfg.humano || criarHumano({ agora: cfg.agora });
  const rota = cfg.rota || criarRota();
  const seguidor = cfg.seguidor || criarSeguidor();
  const suprimentos = cfg.suprimentos || criarSuprimentos();

  let modo = "parada"; // parada | rota | seguir
  let timer = null;
  let ultimoEnvio = 0;
  let ultimoAlvo = "";
  let pausadoAte = 0;
  let seguindoId = null;
  let ultimoGiro = 0;
  let ultimoPersonagem = null;
  let ultimoMotivoParada = null;
  let trecho = null; // trecho atual: { destino, alvo }
  let pisoRota = null;
  let emCaca = false;
  // Interface aberta: pausa comandos e atualizações pesadas até o jogador fechar.
  let pausaInterface = false;
  // Desvio de monstro: um passo lateral por vez, sem pular o waypoint.
  let desvio = null;
  let ultimaPosDesvio = null;
  let paradoDesde = 0;
  let alvoRotaPedido = "";
  const desvioBloqueado = new Map();

  function enviarIr(x, y, forcar) {
    const agora = cfg.agora();
    const chave = x + "," + y;
    if (!forcar && chave === ultimoAlvo) return false;
    if (!forcar && ultimoAlvo !== "" && agora - ultimoEnvio < cfg.intervaloMinimoMs) return false;
    ultimoAlvo = chave;
    ultimoEnvio = agora;
    // O relógio de "parado" começa no comando, não enquanto o Olivia espera
    // parado num ponto de caça/pausa.
    paradoDesde = agora;
    return cfg.ponte.enviar({ t: "ir", x: x, y: y });
  }

  // O servidor recusa um `ir` longe demais: manda um ponto intermediário
  // sobre a reta até o waypoint e continua no próximo tick.
  function trechoAte(destino, pos) {
    if (!pos || !Number.isInteger(pos.x) || !Number.isInteger(pos.y)) return destino;
    const dx = destino.x - pos.x;
    const dy = destino.y - pos.y;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d <= cfg.passoTiles) return destino;
    return {
      x: pos.x + Math.round((dx * cfg.passoTiles) / d),
      y: pos.y + Math.round((dy * cfg.passoTiles) / d),
    };
  }

  // Mantém o trecho atual até alcançá-lo: um `ir` a cada 6 tiles, não a cada tile.
  function proximoTrecho(destino, pos) {
    const chave = destino.x + "," + destino.y;
    if (!trecho || trecho.destino !== chave) {
      trecho = { destino: chave, alvo: trechoAte(destino, pos) };
    } else if (pos && trecho.alvo.x === pos.x && trecho.alvo.y === pos.y) {
      trecho.alvo = trechoAte(destino, pos);
    }
    return trecho.alvo;
  }

  function limparDesvio() {
    desvio = null;
    desvioBloqueado.clear();
  }

  function atualizarParado(pos, agora) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    if (!ultimaPosDesvio || ultimaPosDesvio.x !== pos.x || ultimaPosDesvio.y !== pos.y) {
      ultimaPosDesvio = { x: pos.x, y: pos.y };
      paradoDesde = agora;
    }
  }

  // Um passo lateral que aproxime do waypoint, evitando monstros e células já
  // tentadas. Não pula waypoint: só reinicia o prazo e tenta de novo pelo lado.
  function tentarDesvio(pos, destino, mobs, agora) {
    if (!cfg.ponte.caminavel || !pos || !destino) return null;
    for (const [k, ate] of desvioBloqueado) {
      if (ate <= agora) desvioBloqueado.delete(k);
    }
    const passo = planejarDesvio(pos, destino, cfg.ponte.caminavel, mobs, {
      bloqueados: new Set(desvioBloqueado.keys()),
    });
    if (!passo) return null;
    desvioBloqueado.set(passo.x + "," + passo.y, agora + 3000);
    desvio = {
      x: passo.x,
      y: passo.y,
      ate: agora + cfg.desvioDuracaoMs,
      alvo: destino.x + "," + destino.y,
      enviadoEm: 0,
    };
    rota.destravar(agora);
    registro.evento("rota_desvio", {
      de: pos.x + "," + pos.y,
      passo: passo.x + "," + passo.y,
      alvo: destino.x + "," + destino.y,
      mobs: Array.isArray(mobs) ? mobs.length : 0,
    });
    return passo;
  }

  function iniciarRota(pontos, origem, opcoes) {
    const total = rota.carregar(pontos);
    if (opcoes && opcoes.repetir !== undefined) rota.repetir(opcoes.repetir);
    rota.definirAtraso(opcoes ? opcoes.atraso : null);
    if (opcoes && opcoes.caca) rota.definirCaca(opcoes.caca);
    const st = cfg.ponte.estado ? cfg.ponte.estado() : null;
    const pos = st && st.pos ? st.pos : null;
    if (!rota.iniciar(cfg.agora(), pos)) return 0;
    if (opcoes && Number.isInteger(opcoes.indice)) rota.posicionar(opcoes.indice);
    if (opcoes && Number.isInteger(opcoes.volta)) rota.definirVolta(opcoes.volta);
    modo = "rota";
    ultimoAlvo = "";
    trecho = null;
    pisoRota = pos && Number.isInteger(pos.z) ? pos.z : null;
    ultimoMotivoParada = null;
    emCaca = false;
    pausaInterface = false;
    limparDesvio();
    ultimaPosDesvio = null;
    paradoDesde = cfg.agora();
    alvoRotaPedido = "";
    const alvo = rota.alvo();
    registro.evento("rota_inicio", {
      total: total,
      origem: origem || "api",
      repetir: rota.repetir(),
      indice: rota.indice(),
      proximo: alvo ? alvo.x + "," + alvo.y : "",
      maisProximo: !(opcoes && Number.isInteger(opcoes.indice)),
      atraso: rota.atrasoConfig(),
      caca: rota.cacaConfig(),
      pontos: rota.pontos().map((p) => p.x + "," + p.y + (p.hunt ? "h" : "")).join(";"),
    });
    return total;
  }

  function seguir(id, alcance, opcoes) {
    const o = opcoes || {};
    if (alcance !== undefined) seguidor.definirAlcance(alcance);
    if (o.onda !== undefined) seguidor.definirOnda(o.onda);
    seguindoId = String(id);
    seguidor.seguir(seguindoId, cfg.agora());
    modo = "seguir";
    ultimoAlvo = "";
    trecho = null;
    ultimoGiro = 0;
    pausaInterface = false;
    limparDesvio();
    registro.evento("seguir_inicio", {
      alvo: seguindoId,
      sqm: seguidor.alcanceEfetivo(),
      onda: seguidor.onda(),
    });
    return true;
  }

  function definirOnda(ligado) {
    const estado = seguidor.definirOnda(ligado);
    ultimoAlvo = "";
    trecho = null;
    ultimoGiro = 0;
    registro.evento("seguir_onda", { ligado: estado, sqm: seguidor.alcanceEfetivo() });
    return estado;
  }

  function parar(motivo) {
    modo = "parada";
    rota.parar();
    seguidor.parar();
    seguindoId = null;
    ultimoAlvo = "";
    trecho = null;
    ultimoGiro = 0;
    pisoRota = null;
    emCaca = false;
    pausaInterface = false;
    limparDesvio();
    ultimaPosDesvio = null;
    paradoDesde = 0;
    alvoRotaPedido = "";
    ultimoEnvio = 0;
    ultimoMotivoParada = motivo || "pedido";
    cfg.ponte.enviar({ t: "parar" });
    sessao.parada();
    registro.evento("parada", { motivo: ultimoMotivoParada });
  }

  function tick() {
    const agora = cfg.agora();
    const st = cfg.ponte.estado();
    if (st.nome) sessao.personagem(st.nome);
    if (st.xp !== null) sessao.xpAtual(st.xp);

    if (st.nome && ultimoPersonagem && st.nome !== ultimoPersonagem) {
      sessao.reset(st.nome);
      registro.evento("sessao_reset", { motivo: "personagem", personagem: st.nome });
    }
    if (st.nome) ultimoPersonagem = st.nome;

    if (modo === "parada") return;
    if (!st.emJogo || !st.vivo) {
      registro.evento("sessao_parada", { motivo: !st.emJogo ? "fora" : "morto", pos: st.pos });
      sessao.morte();
      parar(!st.emJogo ? "fora" : "morto");
      return;
    }

    // Menu/inventário/task/RTC abertos: para os comandos e não compete com a
    // interface do jogo. Ao fechar, a rota retoma do mesmo ponto sem pular.
    const interfaceAberta = cfg.ponte.interfaceAberta ? cfg.ponte.interfaceAberta() : false;
    if (interfaceAberta) {
      if (!pausaInterface) {
        pausaInterface = true;
        ultimoAlvo = "";
        trecho = null;
        cfg.ponte.enviar({ t: "parar" });
        registro.evento("pausa_interface", { modo: modo });
      }
      return;
    }
    if (pausaInterface) {
      pausaInterface = false;
      ultimoAlvo = "";
      trecho = null;
      ultimoGiro = 0;
      if (modo === "rota") {
        rota.retomarAposInterface(agora);
      } else if (modo === "seguir" && seguindoId) {
        seguidor.seguir(seguindoId, agora);
      }
      registro.evento("retomada_interface", { modo: modo });
    }

    if (agora < pausadoAte) return;
    // O seguidor não pausa: o alvo anda e a pausa humana perderia o alvo.
    if (modo !== "seguir") {
      const pausa = humano.devePausar();
      if (pausa > 0) {
        pausadoAte = agora + pausa;
        cfg.ponte.enviar({ t: "parar" });
        registro.evento("pausa_humana", { ms: pausa });
        return;
      }
    }

    if (modo === "rota") {
      // Escada/mapa mudou no meio da rota: o `ir` não atravessa piso.
      if (st.pos && Number.isInteger(st.pos.z)) {
        if (pisoRota === null) pisoRota = st.pos.z;
        else if (st.pos.z !== pisoRota) {
          registro.evento("rota_piso_mudou", { de: pisoRota, para: st.pos.z, pos: st.pos });
          parar("piso");
          return;
        }
      }

      const mobs = cfg.ponte.monstros ? cfg.ponte.monstros() : [];
      const manaPct = st.mana != null && st.manaMax
        ? (st.mana / st.manaMax) * 100
        : null;

      atualizarParado(st.pos, agora);
      if (desvio) {
        const chegou = st.pos && st.pos.x === desvio.x && st.pos.y === desvio.y;
        if (chegou || agora >= desvio.ate) {
          const antigo = desvio;
          desvio = null;
          ultimoAlvo = "";
          trecho = null;
          rota.destravar(agora);
          registro.evento("rota_desvio_fim", {
            passo: antigo.x + "," + antigo.y,
            chegou: !!chegou,
            alvo: antigo.alvo,
            pos: st.pos,
          });
        } else {
          if (agora - desvio.enviadoEm >= 1000) {
            desvio.enviadoEm = agora;
            enviarIr(desvio.x, desvio.y, true);
          }
          return;
        }
      }

      const d = rota.passo({ pos: st.pos, agora: agora, mobs: mobs, manaPct: manaPct });
      if (!d) return;

      // Alvo novo (ou retomada após pausa/caça) reinicia o relógio do desvio.
      if (d.acao === "ir" || d.acao === "repetir") {
        const chaveAlvo = d.x + "," + d.y;
        if (chaveAlvo !== alvoRotaPedido) {
          alvoRotaPedido = chaveAlvo;
          paradoDesde = agora;
        }
      } else {
        alvoRotaPedido = "";
      }

      // Não saiu do sqm por ~1 s enquanto tentava andar: provavelmente um monstro
      // na célula da frente. Dá um passo lateral em vez de esperar e pular.
      if ((d.acao === "ir" || d.acao === "repetir") && st.pos
          && agora - paradoDesde >= cfg.paradoDesvioMs) {
        const passo = tentarDesvio(st.pos, { x: d.x, y: d.y }, mobs, agora);
        if (passo) {
          enviarIr(passo.x, passo.y, true);
          desvio.enviadoEm = agora;
          return;
        }
      }

      // Ponto de caça: para o personagem e fica segurando até a rota mandar sair.
      if (d.acao === "cacar") {
        if (!emCaca) {
          emCaca = true;
          ultimoAlvo = "";
          trecho = null;
          cfg.ponte.enviar({ t: "parar" });
          registro.evento("caca_inicio", {
            emPonto: !!d.emPonto,
            motivo: d.motivo,
            perto: d.perto,
            pos: st.pos,
          });
        }
        return;
      }
      if (emCaca) {
        emCaca = false;
        registro.evento("caca_fim", {
          motivo: d.cacaMotivo || d.motivo || "",
          emPonto: !!d.emPonto,
          tempoMs: d.tempoMs,
          perto: d.perto,
          pos: st.pos,
        });
      }

      if (d.acao === "ir" && cfg.ponte.caminavel && !cfg.ponte.caminavel(d.x, d.y)) {
        const r = rota.pularAtual(agora);
        registro.evento("rota_ponto_invalido", { alvo: d.x + "," + d.y, restantes: r.restantes });
        if (!r.ok) {
          registro.evento("rota_sem_caminho", { motivo: "invalido" });
          cfg.ponte.enviar({ t: "parar" });
        }
        return;
      }

      if (d.acao === "ir" || d.acao === "repetir") {
        const alvo = proximoTrecho({ x: d.x, y: d.y }, st.pos);
        enviarIr(alvo.x, alvo.y, d.acao === "repetir");
        if (d.acao === "repetir") registro.evento("rota_repetir", { indice: d.indice, tentativa: d.tentativa, alvo: d.x + "," + d.y, pos: st.pos });
        return;
      }
      if (d.acao === "avancar") {
        sessao.pontoConcluido();
        registro.evento("rota_avancar", { indice: d.indice, alvo: d.alvo, pos: st.pos });
        return;
      }
      if (d.acao === "pular") {
        registro.evento("rota_pulou", { alvo: d.alvo ? d.alvo.x + "," + d.alvo.y : "", indice: d.indice, restantes: d.restantes });
        return;
      }
      if (d.acao === "sem_caminho") {
        registro.evento("rota_sem_caminho", { esperaMs: d.esperaMs, esperas: d.esperas });
        cfg.ponte.enviar({ t: "parar" });
        ultimoAlvo = "";
        trecho = null;
        return;
      }
      if (d.acao === "volta") {
        sessao.pontoConcluido();
        sessao.voltaConcluida();
        registro.evento("rota_volta", { volta: d.volta, total: d.total, pos: st.pos });
        return;
      }
      if (d.acao === "concluir") {
        sessao.pontoConcluido();
        sessao.voltaConcluida();
        registro.evento("rota_concluida", { total: d.total, voltas: d.voltas, pos: st.pos });
        parar("rota_concluida");
        return;
      }
      if (d.acao === "desistir") {
        registro.evento("rota_desistiu", { indice: d.indice, motivo: d.motivo || "", alvo: rota.alvo(), pos: st.pos });
        parar(d.motivo === "sem_caminho" ? "sem_caminho" : "rota_desistiu");
      }
      return;
    }

    if (modo === "seguir") {
      const alvo = cfg.ponte.entidade(seguindoId);
      const mobs = cfg.ponte.monstros ? cfg.ponte.monstros() : [];
      const d = seguidor.passo({
        alvo: alvo,
        pos: st.pos,
        agora: agora,
        mobs: mobs,
        caminavel: cfg.ponte.caminavel,
      });
      if (!d) return;
      if (d.acao === "ir") {
        const alvo = proximoTrecho({ x: d.x, y: d.y }, st.pos);
        enviarIr(alvo.x, alvo.y, false);
        return;
      }
      if (d.acao === "esperar" && Number.isInteger(d.face)) {
        // Na vaga da onda: vira para o alvo para o feixe atravessar o 3x3.
        // `pc` só gira; repete devagar porque o cliente não informa a direção atual.
        if (agora - ultimoGiro >= 1200) {
          ultimoGiro = agora;
          if (cfg.ponte.girar) cfg.ponte.girar(d.face);
        }
        return;
      }
      if (d.acao === "passo") {
        // Último sqm no mesmo tile: `ir` não entra no piso do jogador, `dir` entra.
        // Um passo por vez: solta a direção antes do próximo tile para não ultrapassar.
        trecho = null;
        ultimoAlvo = "";
        cfg.ponte.enviar({ t: "dir", dx: d.dx, dy: d.dy });
        setTimeout(function () {
          if (modo === "seguir") cfg.ponte.enviar({ t: "parar" });
        }, 240);
        return;
      }
      if (d.acao === "perdeu") {
        registro.evento("seguir_perdeu", { alvo: d.alvo });
        parar("alvo_perdido");
      }
    }
  }

  function iniciar() {
    if (timer) return;
    timer = setInterval(tick, cfg.intervaloMs);
  }

  function encerrar() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  // Volta do segundo plano: reenvia o alvo atual em vez de ficar parado no cache.
  // O tempo em segundo plano não pode contar como "sem progresso", senão a rota
  // acorda já no limite e pula waypoint por causa do `onPause` do APK.
  function retomar() {
    ultimoAlvo = "";
    trecho = null;
    pausadoAte = 0;
    ultimoEnvio = 0;
    pausaInterface = false;
    limparDesvio();
    ultimaPosDesvio = null;
    const agora = cfg.agora();
    paradoDesde = agora;
    alvoRotaPedido = "";
    if (modo === "rota") {
      rota.retomarAposInterface(agora);
    } else if (modo === "seguir" && seguindoId) {
      seguidor.seguir(seguindoId, agora);
    }
    iniciar();
  }

  return {
    iniciar,
    encerrar,
    retomar,
    tick,
    iniciarRota,
    seguir,
    definirOnda,
    parar,
    modo: () => modo,
    pausadoAte: () => pausadoAte,
    pausaInterface: () => pausaInterface,
    rodando: () => timer !== null,
    // Presença (tecla Shift) só é necessária enquanto existe `ir` recente.
    // 8 s cobre pernas longas e o trecho de 6 tiles sem flickar a tecla.
    comandando: () => modo !== "parada" && cfg.agora() - ultimoEnvio < 8000,
    pausaRestante: () => {
      const agora = cfg.agora();
      return Math.max(0, pausadoAte - agora, rota.esperaRestante(agora), rota.pausaRestante(agora));
    },
    ultimoMotivo: () => ultimoMotivoParada,
    rota,
    cacaInfo: () => rota.cacaInfo(cfg.agora()),
    seguidor,
    sessao,
    humano,
    suprimentos,
    log: registro,
    seguindoId: () => seguindoId,
  };
}


// Painel do Olivia no navegador. Fica fora de #hud/#menu-arriba e evita cores e
// palavras que o detector do jogo usa como assinatura (ver docs/ANALISE-CLIENTE-WEB.md).
function criarPainel(opcoes) {
  const cfg = Object.assign({ motor: null, antibot: null }, opcoes || {});
  const motor = cfg.motor;
  const antibot = cfg.antibot;

  let raiz = null;
  const partes = {};
  let timer = null;

  function el(tag, estilo, texto) {
    const e = document.createElement(tag);
    if (estilo) Object.assign(e.style, estilo);
    if (texto != null) e.textContent = texto;
    return e;
  }

  function botao(texto, aoClicar) {
    const b = el("button", {
      flex: "1",
      padding: "5px 8px",
      border: "1px solid #3d5566",
      borderRadius: "4px",
      background: "#16232d",
      color: "#dfe7ee",
      font: "11px system-ui, sans-serif",
      cursor: "pointer",
    }, texto);
    b.type = "button";
    b.addEventListener("click", aoClicar);
    return b;
  }

  function linha(estilo) {
    return el("div", Object.assign({ display: "flex", gap: "6px", alignItems: "center" }, estilo));
  }

  function lerRota(texto) {
    const bruto = JSON.parse(texto);
    if (!Array.isArray(bruto)) throw new Error("JSON precisa ser uma lista");
    return bruto.map(function (p) {
      const hunt = Array.isArray(p)
        ? p[2] === "h" || p[2] === true
        : !!(p.hunt === true || p.hunt === "h" || p.caca === true || p.h === "h" || p.h === true);
      if (Array.isArray(p)) return { x: Number(p[0]), y: Number(p[1]), pausaMs: 0, hunt: hunt };
      return {
        x: Number(p.x),
        y: Number(p.y),
        pausaMs: Number(p.pausaMs) || 0,
        hunt: hunt,
      };
    });
  }

  function textoRota(pontos) {
    return JSON.stringify(pontos.map(function (p) {
      if (!p.hunt && !(p.pausaMs > 0)) return [p.x, p.y];
      const o = { x: p.x, y: p.y };
      if (p.pausaMs > 0) o.pausaMs = p.pausaMs;
      if (p.hunt) o.hunt = true;
      return o;
    }));
  }

  function montar() {
    if (raiz) return;
    raiz = el("div", {
      position: "fixed",
      left: "8px",
      bottom: "8px",
      zIndex: "60",
      width: "246px",
      padding: "8px 10px",
      borderRadius: "6px",
      background: "rgba(16, 26, 34, .94)",
      border: "1px solid #3d5566",
      color: "#dfe7ee",
      font: "11.5px/1.5 system-ui, sans-serif",
      boxShadow: "0 2px 10px rgba(0,0,0,.35)",
      pointerEvents: "auto",
      touchAction: "manipulation",
    });
    raiz.id = "ovw-painel";

    const topo = linha({ justifyContent: "space-between", marginBottom: "4px" });
    topo.appendChild(el("strong", { letterSpacing: ".02em", color: "#cfe3f2" }, "Olivia"));
    partes.estado = el("span", { fontSize: "10.5px", color: "#9fb3c2" }, "aguardando");
    topo.appendChild(partes.estado);
    raiz.appendChild(topo);

    partes.modo = el("div", { color: "#cfe3f2" }, "parada · ponto 0/0");
    raiz.appendChild(partes.modo);

    partes.numeros = el("div", { fontSize: "10.5px", color: "#9fb3c2" }, "tempo 00:00 · xp/h 0");
    raiz.appendChild(partes.numeros);

    partes.contadores = el("div", { fontSize: "10.5px", color: "#9fb3c2" }, "pontos 0 · voltas 0 · mortes 0");
    raiz.appendChild(partes.contadores);

    const desafio = linha({ marginTop: "5px" });
    partes.caixa = document.createElement("input");
    partes.caixa.type = "checkbox";
    partes.caixa.checked = antibot ? antibot.ligado() : true;
    partes.caixa.addEventListener("change", function () {
      if (antibot) antibot.definirLigado(partes.caixa.checked);
      atualizar();
    });
    desafio.appendChild(partes.caixa);
    desafio.appendChild(el("span", null, "Responder «Não» no desafio"));
    raiz.appendChild(desafio);

    partes.desafio = el("div", { fontSize: "10.5px", color: "#9fb3c2" }, "desafio 0/0");
    raiz.appendChild(partes.desafio);

    const campoRota = el("textarea", {
      width: "100%",
      height: "42px",
      marginTop: "6px",
      padding: "4px 5px",
      boxSizing: "border-box",
      resize: "vertical",
      border: "1px solid #3d5566",
      borderRadius: "4px",
      background: "#0d1720",
      color: "#cfe3f2",
      font: "10.5px ui-monospace, monospace",
    });
    campoRota.placeholder = "[[33000,32000],[33001,32000]]";
    try { campoRota.value = localStorage.getItem("ovw.rota") || ""; } catch (e) {}
    raiz.appendChild(campoRota);

    function marcarPonto(caca) {
      let pos = null;
      try {
        const st = window.Olivia && window.Olivia.estado ? window.Olivia.estado() : null;
        pos = st && st.jogo ? st.jogo.pos : null;
      } catch (e) {
        pos = null;
      }
      if (!pos || !Number.isInteger(pos.x) || !Number.isInteger(pos.y)) {
        alert("Posição indisponível (fora do jogo?)");
        return;
      }
      let pontos;
      try {
        pontos = lerRota(campoRota.value || "[]");
      } catch (e) {
        alert("Rota inválida: " + e.message);
        return;
      }
      const ultimo = pontos[pontos.length - 1];
      if (ultimo && ultimo.x === pos.x && ultimo.y === pos.y) {
        if (!!ultimo.hunt === !!caca) return;
        ultimo.hunt = !!caca;
      } else {
        pontos.push({ x: pos.x, y: pos.y, pausaMs: 0, hunt: !!caca });
      }
      campoRota.value = textoRota(pontos);
      try { localStorage.setItem("ovw.rota", campoRota.value); } catch (e) { /* sem storage */ }
      atualizar();
    }

    const marcar = linha({ marginTop: "4px" });
    marcar.appendChild(botao("Marcar aqui", function () { marcarPonto(false); }));
    marcar.appendChild(botao("Ponto de caça", function () { marcarPonto(true); }));
    raiz.appendChild(marcar);

    const acoes = linha({ marginTop: "6px" });
    acoes.appendChild(botao("Iniciar", function () {
      try {
        const pontos = lerRota(campoRota.value || "[]");
        localStorage.setItem("ovw.rota", campoRota.value);
        motor.iniciarRota(pontos, "painel-web", { repetir: partes.repetir.checked });
      } catch (e) {
        alert("Rota inválida: " + e.message);
      }
      atualizar();
    }));
    acoes.appendChild(botao("Parar", function () {
      motor.parar("painel");
      atualizar();
    }));
    raiz.appendChild(acoes);

    const repetir = linha({ marginTop: "4px" });
    partes.repetir = document.createElement("input");
    partes.repetir.type = "checkbox";
    partes.repetir.checked = motor.rota.repetir();
    partes.repetir.addEventListener("change", function () {
      motor.rota.repetir(partes.repetir.checked);
    });
    repetir.appendChild(partes.repetir);
    repetir.appendChild(el("span", null, "Repetir a rota"));
    raiz.appendChild(repetir);

    const linhaRtc = linha({ marginTop: "2px" });
    partes.rtc = document.createElement("input");
    partes.rtc.type = "checkbox";
    try { partes.rtc.checked = localStorage.getItem("ovw.rtcSempre") === "1"; } catch (e) { /* sem storage */ }
    partes.rtc.addEventListener("change", function () {
      const ligado = partes.rtc.checked;
      if (window.Olivia && window.Olivia.rtc) window.Olivia.rtc.definir(ligado);
      atualizar();
    });
    linhaRtc.appendChild(partes.rtc);
    linhaRtc.appendChild(el("span", null, "Manter RTC ligado"));
    raiz.appendChild(linhaRtc);

    const linhaRetarget = linha({ marginTop: "2px" });
    partes.retarget = document.createElement("input");
    partes.retarget.type = "checkbox";
    let retargetSalvo = null;
    try { retargetSalvo = JSON.parse(localStorage.getItem("ovw.retarget") || "null"); } catch (e) { retargetSalvo = null; }
    partes.retarget.checked = !!(retargetSalvo && retargetSalvo.ligado);
    partes.retargetSqm = el("input", {
      width: "30px",
      padding: "3px",
      border: "1px solid #3d5566",
      borderRadius: "4px",
      background: "#0d1720",
      color: "#cfe3f2",
      font: "10.5px ui-monospace, monospace",
      textAlign: "center",
    });
    partes.retargetSqm.type = "number";
    partes.retargetSqm.min = "1";
    partes.retargetSqm.max = "8";
    partes.retargetSqm.value = String(retargetSalvo && Number(retargetSalvo.sqm) ? retargetSalvo.sqm : 6);
    partes.retargetSqm.disabled = !partes.retarget.checked;
    partes.retarget.addEventListener("change", function () {
      if (window.Olivia && window.Olivia.retarget) {
        window.Olivia.retarget.definir(partes.retarget.checked, Number(partes.retargetSqm.value) || 6);
      }
      partes.retargetSqm.disabled = !partes.retarget.checked;
      atualizar();
    });
    partes.retargetSqm.addEventListener("change", function () {
      if (window.Olivia && window.Olivia.retarget) {
        window.Olivia.retarget.definir(partes.retarget.checked, Number(partes.retargetSqm.value) || 6);
      }
    });
    linhaRetarget.appendChild(partes.retarget);
    linhaRetarget.appendChild(el("span", null, "Re-target após"));
    linhaRetarget.appendChild(partes.retargetSqm);
    linhaRetarget.appendChild(el("span", null, "sqm"));
    raiz.appendChild(linhaRetarget);

    // Configuração do ponto de caça (HuntSpotSettings do desktop).
    const secao = document.createElement("details");
    secao.style.marginTop = "6px";
    const resumo = document.createElement("summary");
    resumo.textContent = "Ponto de caça";
    resumo.style.cursor = "pointer";
    resumo.style.color = "#cfe3f2";
    secao.appendChild(resumo);

    const grade = el("div", {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "4px",
      marginTop: "4px",
    });
    const regras = motor.rota.cacaConfig();
    const campos = [
      { chave: "raioLimpo", rotulo: "Livre (sqm)", min: 1, max: 7, fator: 1 },
      { chave: "minParadoMs", rotulo: "Mínimo (s)", min: 0, max: 60, fator: 1000 },
      { chave: "tetoMs", rotulo: "Teto (s)", min: 10, max: 900, fator: 1000 },
      { chave: "manaMinPct", rotulo: "Mana (%)", min: 0, max: 100, fator: 1 },
      { chave: "sairComMobs", rotulo: "Sair c/ mobs", min: 0, max: 10, fator: 1 },
    ];
    partes.cacaCampos = {};
    campos.forEach(function (c) {
      const caixa = el("label", { display: "flex", flexDirection: "column", fontSize: "9.5px", color: "#9fb3c2" });
      caixa.appendChild(el("span", null, c.rotulo));
      const campo = el("input", {
        width: "100%",
        boxSizing: "border-box",
        padding: "2px 4px",
        border: "1px solid #3d5566",
        borderRadius: "3px",
        background: "#0d1720",
        color: "#cfe3f2",
        font: "10.5px ui-monospace, monospace",
      });
      campo.type = "number";
      campo.min = String(c.min);
      campo.max = String(c.max);
      campo.value = String(Math.round((regras[c.chave] || 0) / c.fator));
      partes.cacaCampos[c.chave] = { campo: campo, fator: c.fator };
      caixa.appendChild(campo);
      grade.appendChild(caixa);
    });
    secao.appendChild(grade);
    const statusCaca = el("div", { fontSize: "9.5px", color: "#6f8a9c", marginTop: "3px" },
      "Chegou no sqm: segura até sobrar o limite de monstros.");
    secao.appendChild(statusCaca);
    secao.appendChild(botao("Salvar caça", function () {
      const novo = {};
      Object.keys(partes.cacaCampos).forEach(function (chave) {
        const info = partes.cacaCampos[chave];
        novo[chave] = Math.round(Number(info.campo.value) || 0) * info.fator;
      });
      let aplicado;
      try {
        aplicado = window.Olivia && window.Olivia.caca
          ? window.Olivia.caca.definir(novo)
          : motor.rota.definirCaca(novo);
      } catch (e) {
        aplicado = motor.rota.definirCaca(novo);
      }
      statusCaca.textContent = "Caça: livre " + aplicado.raioLimpo + " sqm · mínimo "
        + Math.round(aplicado.minParadoMs / 1000) + " s · teto "
        + Math.round(aplicado.tetoMs / 1000) + " s · mana " + aplicado.manaMinPct + "%";
    }));
    raiz.appendChild(secao);

    const seguir = linha({ marginTop: "6px" });
    partes.idAlvo = el("input", {
      width: "72px",
      padding: "4px 5px",
      border: "1px solid #3d5566",
      borderRadius: "4px",
      background: "#0d1720",
      color: "#cfe3f2",
      font: "11px system-ui, sans-serif",
    });
    partes.idAlvo.placeholder = "id do jogador";
    partes.idAlvo.inputMode = "numeric";
    seguir.appendChild(partes.idAlvo);

    partes.distancia = el("input", {
      width: "34px",
      padding: "4px 3px",
      border: "1px solid #3d5566",
      borderRadius: "4px",
      background: "#0d1720",
      color: "#cfe3f2",
      font: "11px ui-monospace, monospace",
      textAlign: "center",
    });
    partes.distancia.type = "number";
    partes.distancia.min = "0";
    partes.distancia.max = "8";
    partes.distancia.title = "distância em sqm (0 = mesmo tile)";
    try { partes.distancia.value = localStorage.getItem("ovw.seguirSqm") || "1"; } catch (e) { partes.distancia.value = "1"; }
    seguir.appendChild(partes.distancia);

    seguir.appendChild(botao("Seguir", function () {
      const id = Number(partes.idAlvo.value);
      if (!Number.isInteger(id) || id <= 0) return;
      const onda = !!(partes.onda && partes.onda.checked);
      let dist = Number(partes.distancia.value);
      if (!Number.isFinite(dist)) dist = 1;
      dist = Math.max(0, Math.min(8, Math.round(dist)));
      if (!onda) {
        try { localStorage.setItem("ovw.seguirSqm", String(dist)); } catch (e) { /* sem storage */ }
      }
      motor.seguir(id, onda ? 4 : dist, { onda: onda });
      atualizar();
    }));
    raiz.appendChild(seguir);

    const linhaOnda = linha({ marginTop: "2px" });
    partes.onda = document.createElement("input");
    partes.onda.type = "checkbox";
    partes.onda.checked = !!(window.Olivia && window.Olivia.onda && window.Olivia.onda.ligado());
    partes.onda.addEventListener("change", function () {
      const ligado = partes.onda.checked;
      if (window.Olivia && window.Olivia.onda) window.Olivia.onda.definir(ligado);
      else motor.definirOnda(ligado);
      if (ligado) {
        try { localStorage.setItem("ovw.seguirSqm", partes.distancia.value); } catch (e) { /* sem storage */ }
        partes.distancia.value = "4";
      } else {
        let guardado = "1";
        try { guardado = localStorage.getItem("ovw.seguirSqm") || "1"; } catch (e) { /* sem storage */ }
        partes.distancia.value = guardado;
      }
      partes.distancia.disabled = ligado;
      atualizar();
    });
    linhaOnda.appendChild(partes.onda);
    linhaOnda.appendChild(el("span", null, "Seguir knight (onda 4 sqm)"));
    raiz.appendChild(linhaOnda);

    if (partes.onda.checked) {
      partes.distancia.value = "4";
      partes.distancia.disabled = true;
    }

    const rodape = linha({ marginTop: "6px", justifyContent: "space-between" });
    partes.log = el("span", { fontSize: "10px", color: "#6f8a9c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, "");
    rodape.appendChild(partes.log);
    rodape.appendChild(botao("zerar", function () {
      motor.sessao.reset();
      if (antibot && antibot.zerar) antibot.zerar();
      atualizar();
    }));
    raiz.appendChild(rodape);

    raiz.addEventListener("pointerdown", function (e) { e.stopPropagation(); }, { passive: true });
    document.body.appendChild(raiz);

    timer = setInterval(atualizar, 500);
    atualizar();
  }

  function doisDigitos(n) { return String(n).padStart(2, "0"); }

  function tempo(ms) {
    const s = Math.floor(ms / 1000);
    return doisDigitos(Math.floor(s / 60)) + ":" + doisDigitos(s % 60);
  }

  function atualizar() {
    if (!raiz) return;
    const s = motor.sessao.snapshot();
    const modo = motor.modo();
    const alvo = motor.rota.alvo();
    const indice = Math.min(motor.rota.indice() + 1, motor.rota.total());
    const ci = motor.rota.cacaInfo ? motor.rota.cacaInfo() : null;
    const caca = ci && ci.ativo
      ? " · caça " + Math.floor(ci.tempoMs / 1000) + "s (" + ci.perto + " mobs)"
      : "";

    partes.estado.textContent = modo === "parada" ? "parada" : modo;
    partes.modo.textContent = modo === "rota"
      ? "rota · Waypoint " + indice + "/" + motor.rota.total()
        + " · volta " + motor.rota.volta()
        + (alvo ? " (" + alvo.x + "," + alvo.y + ")" : "")
        + caca
      : modo === "seguir"
        ? "seguindo " + (motor.seguindoId() || "?")
          + (motor.seguidor.onda() ? " · onda" : "")
        : "parada · Waypoint " + indice + "/" + motor.rota.total();

    const pausa = Math.ceil(motor.pausaRestante() / 1000);
    const suplemento = pausa > 0 ? " · pausa " + pausa + "s" : "";
    partes.numeros.textContent = "tempo " + tempo(s.duracaoMs) + " · xp/h " + s.xpHora.toLocaleString("pt-BR")
      + suplemento;
    partes.contadores.textContent = "pontos " + s.pontos + " · voltas " + s.voltas + " · mortes " + s.mortes;
    partes.desafio.textContent = "desafio " + s.antiBot + "/" + s.janelas + " · " + motor.rota.situacao();

    if (partes.rtc && window.Olivia && window.Olivia.rtc) {
      const ligado = !!window.Olivia.rtc.ligado();
      if (partes.rtc.checked !== ligado) partes.rtc.checked = ligado;
    }
    if (partes.retarget && window.Olivia && window.Olivia.retarget) {
      const r = window.Olivia.retarget.estado();
      if (partes.retarget.checked !== !!r.ligado) partes.retarget.checked = !!r.ligado;
      if (document.activeElement !== partes.retargetSqm) {
        partes.retargetSqm.value = String(r.sqm || 6);
      }
      partes.retargetSqm.disabled = !r.ligado;
    }

    const ultimo = motor.log.ultimos(1)[0];
    partes.log.textContent = ultimo ? ultimo.nome : "";
    partes.log.title = ultimo ? JSON.stringify(ultimo) : "";
  }

  function desmontar() {
    if (timer) clearInterval(timer);
    timer = null;
    if (raiz) raiz.remove();
    raiz = null;
  }

  return { montar, desmontar, atualizar, raiz: () => raiz };
}


// Entrada do driver: monta painel (modo navegador), assina o anti-bot, liga o motor
// e publica o estado para o painel nativo quando roda dentro do APK.

(function () {
  "use strict";

  const nativo = !!window.__OVW_NATIVO;
  const doc = document.documentElement;
  if (!doc || doc.dataset.ovw === "1") return;
  doc.dataset.ovw = "1";

  const CHAVE_ROTA = "ovw.rota.estado";
  const CHAVE_SESSAO = "ovw.sessao";
  const CHAVE_CACA = "ovw.caca";
  const CHAVE_RTC = "ovw.rtcSempre";
  const CHAVE_RETARGET = "ovw.retarget";
  const VALIDADE_RETOMADA_MS = 10 * 60000;

  function ler(chave) {
    try {
      const bruto = localStorage.getItem(chave);
      return bruto ? JSON.parse(bruto) : null;
    } catch (e) {
      return null;
    }
  }

  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem storage */ }
  }

  let rotaAtiva = false;
  let sessaoTentada = false;
  try {
    const inicial = ler(CHAVE_ROTA);
    rotaAtiva = !!(inicial && inicial.ativa);
  } catch (e) { /* sem storage */ }

  const ponte = criarPonteNavegador();
  const registro = criarLog(function (e) {
    if (!e || !e.nome) return;
    if (e.nome === "rota_inicio" || e.nome === "rota_volta") rotaAtiva = true;
    if (e.nome === "parada") {
      rotaAtiva = e.motivo === "morto" || e.motivo === "fora";
    }
    if (e.nome === "rota_concluida" || e.nome === "rota_desistiu") rotaAtiva = false;
    if (window.OliviaAndroid && typeof window.OliviaAndroid.evento === "function") {
      try { window.OliviaAndroid.evento(JSON.stringify(e)); } catch (ignorado) { /* bridge ausente */ }
    }
    console.debug("[Olivia]", e.nome, e);
  });

  const motor = criarMotor({ ponte: ponte, log: registro });

  // Configuração do ponto de caça (mesmos nomes do HuntSpotSettings do desktop).
  const cacaSalvo = ler(CHAVE_CACA);
  if (cacaSalvo) motor.rota.definirCaca(cacaSalvo);

  // RTC/Hunt Assist: usa a mesma API pública do botão RTC do cliente.
  let rtcSempre = (function () {
    try { return localStorage.getItem(CHAVE_RTC) === "1"; } catch (e) { return false; }
  })();
  const rtc = criarRtcSempre({
    ligado: rtcSempre,
    obter: () => window.Asistente,
    pedir: () => ponte.enviar({ t: "huntassist", pedir: true }),
    interfaceAberta: () => ponte.interfaceAberta ? ponte.interfaceAberta() : false,
    log: (nome, dados) => registro.evento(nome, dados),
  });

  let autoTarefas = (function () {
    try { return localStorage.getItem("ovw.autoTarefas") !== "0"; } catch (e) { return true; }
  })();

  // Repetição de tasks: envia, fecha o popup certo e só conta após confirmação.
  const tarefas = criarTarefas({
    enviar: ponte.enviar,
    tarefa: ponte.tarefa,
    fechar: ponte.fecharAvisoTarefa,
    sessao: motor.sessao,
    log: registro,
    ligado: function () { return autoTarefas; },
    agora: Date.now,
  });

  let pausaHumana = (function () {
    try { return localStorage.getItem("ovw.pausaHumana") !== "0"; } catch (e) { return true; }
  })();
  motor.humano.definirLigado(pausaHumana);

  let reconexaoLigada = (function () {
    try { return localStorage.getItem("ovw.reconexao") !== "0"; } catch (e) { return true; }
  })();
  let reconTentativas = 0;
  let reconSucessos = 0;
  let ultimaReconexao = 0;
  let wsEstavaAberto = false;

  let areaLigada = (function () {
    try { return localStorage.getItem("ovw.area") === "1"; } catch (e) { return false; }
  })();
  const area = criarArea();
  let areaAlvo = null;
  let areaMobs = 0;

  let retarget = (function () {
    const salvo = ler(CHAVE_RETARGET);
    if (salvo && typeof salvo === "object") {
      return {
        ligado: !!salvo.ligado,
        sqm: Math.max(1, Math.min(8, Number(salvo.sqm) || RETARGET_SQM_PADRAO)),
      };
    }
    return { ligado: false, sqm: RETARGET_SQM_PADRAO };
  })();
  let retargetAlvo = null;

  // Seguir knight: fica na vaga da onda a 4 sqm e vira para o alvo.
  let ondaLigada = (function () {
    try { return localStorage.getItem("ovw.seguirOnda") === "1"; } catch (e) { return false; }
  })();
  motor.seguidor.definirOnda(ondaLigada);

  // Automação suspensa quando o jogo sai da tela: nenhum `ir`/skill/área sai
  // enquanto a página está oculta (bit 512 do Calidad).
  let suspenso = false;

  // Mantém a conexão viva quando o WS cai no meio do jogo (mesma ideia do AutoReconnect).
  function vigiarConexao() {
    if (!reconexaoLigada) return;
    const red = window.Red;
    if (!red || !window.J || !J.enJuego || red.fuera) return;
    const ws = red.ws;
    if (ws && ws.readyState === 0) return;
    const aberto = !!ws && ws.readyState === 1;
    if (aberto) {
      if (!wsEstavaAberto && reconTentativas > reconSucessos) {
        reconSucessos += 1;
        registro.evento("reconectado", { tentativas: reconTentativas });
      }
      wsEstavaAberto = true;
      return;
    }
    wsEstavaAberto = false;
    if (Date.now() - ultimaReconexao < 15000) return;
    ultimaReconexao = Date.now();
    reconTentativas += 1;
    try {
      if (typeof red.conectar === "function") red.conectar();
    } catch (e) { /* tenta de novo no próximo ciclo */ }
    registro.evento("reconexao_tentativa", { tentativas: reconTentativas });
  }

  const antibot = criarAntiBot({
    ponte: ponte,
    ensaio: (function () {
      try { return localStorage.getItem("ovw.ensaio") === "1"; } catch (e) { return false; }
    })(),
    aoVer: function () { motor.sessao.janelaVista(); },
    aoResponder: function (id, chave) {
      motor.sessao.antiBotRespondida();
      registro.evento("antibot_resposta", { id: String(id), chave: String(chave) });
    },
    aoEnsaio: function (id, chave) {
      registro.evento("antibot_ensaio", { id: String(id), chave: String(chave) });
      console.info("[Olivia] ensaio: responderia id=" + id + " chave=" + chave);
    },
  });

  const painel = nativo ? null : criarPainel({ motor: motor, antibot: antibot });
  if (painel) painel.montar();

  // ---- persistência: rota, sessão e retomada automática -------------------

  function guardarRota() {
    const pontos = motor.rota.pontos().map(function (p) {
      if (p.hunt || p.pausaMs > 0) {
        const o = { x: p.x, y: p.y };
        if (p.pausaMs > 0) o.pausaMs = p.pausaMs;
        if (p.hunt) o.hunt = true;
        return o;
      }
      return [p.x, p.y];
    });
    const st = ponte.estado();
    gravar(CHAVE_ROTA, {
      pontos: pontos,
      indice: motor.rota.indice(),
      volta: motor.rota.volta(),
      repetir: motor.rota.repetir(),
      atraso: motor.rota.atrasoConfig ? motor.rota.atrasoConfig() : null,
      personagem: motor.sessao.snapshot().personagem,
      piso: st.pos && Number.isInteger(st.pos.z) ? st.pos.z : null,
      em: Date.now(),
      ativa: rotaAtiva && pontos.length > 0,
    });
    try {
      localStorage.setItem("ovw.rota", JSON.stringify(pontos));
    } catch (e) { /* sem storage */ }
  }

  function guardarSessao() {
    const s = motor.sessao.exportar();
    if (!s || !s.personagem) return;
    gravar(CHAVE_SESSAO, { em: Date.now(), estado: s });
  }

  function restaurarSessao() {
    const guardado = ler(CHAVE_SESSAO);
    if (!guardado || !guardado.estado) return false;
    if (Date.now() - Number(guardado.em || 0) > VALIDADE_RETOMADA_MS) return false;
    const st = ponte.estado();
    if (!st.nome || (guardado.estado.personagem && guardado.estado.personagem !== st.nome)) return false;
    const atual = motor.sessao.snapshot();
    if (atual.pontos > 0 || atual.voltas > 0 || atual.antiBot > 0) return false;
    motor.sessao.importar(guardado.estado);
    registro.evento("sessao_retomada", {
      personagem: guardado.estado.personagem,
      duracaoMs: motor.sessao.snapshot().duracaoMs,
    });
    return true;
  }

  // O nome do personagem só aparece depois do login: tenta de novo até saber.
  function tentarRestaurarSessao() {
    if (sessaoTentada) return;
    if (!ponte.estado().nome) return;
    sessaoTentada = true;
    restaurarSessao();
  }

  function tentarRetomarRota() {
    if (motor.modo() !== "parada") return false;
    const guardado = ler(CHAVE_ROTA);
    if (!guardado || !guardado.ativa || !Array.isArray(guardado.pontos) || !guardado.pontos.length) return false;
    if (Date.now() - Number(guardado.em || 0) > VALIDADE_RETOMADA_MS) return false;

    const st = ponte.estado();
    if (!st.emJogo || !st.vivo || !st.pos) return false;
    if (guardado.personagem && st.nome && guardado.personagem !== st.nome) return false;

    // Retomar em outro piso andaria às cegas: só retoma no mesmo mapa/piso.
    if (Number.isInteger(guardado.piso) && Number.isInteger(st.pos.z) && guardado.piso !== st.pos.z) {
      registro.evento("rota_nao_retomada", { motivo: "piso", piso: guardado.piso, atual: st.pos.z });
      gravar(CHAVE_ROTA, Object.assign({}, guardado, { ativa: false }));
      return false;
    }

    motor.iniciarRota(guardado.pontos, "retomada", {
      repetir: !!guardado.repetir,
      atraso: guardado.atraso || null,
      indice: Number.isInteger(guardado.indice) ? guardado.indice : 0,
      volta: Number.isInteger(guardado.volta) ? guardado.volta : 0,
    });
    return true;
  }

  // ---- estado para o painel nativo ---------------------------------------

  function retrato() {
    const st = ponte.estado();
    const sup = ponte.suprimentos ? ponte.suprimentos() : null;
    const agora = Date.now();
    if (sup) {
      motor.suprimentos.registrar(sup.pocoes || [], agora);
      motor.sessao.ouroAtual(sup.oro);
    }
    const supResumo = sup ? motor.suprimentos.resumo(agora) : null;
    return {
      modo: motor.modo(),
      pausaUi: motor.pausaInterface(),
      comandando: motor.comandando(),
      rodando: motor.rodando(),
      seguir: motor.seguindoId(),
      automacao: { suspensa: suspenso },
      rota: {
        total: motor.rota.total(),
        indice: motor.rota.indice(),
        situacao: motor.rota.situacao(),
        volta: motor.rota.volta(),
        repetir: motor.rota.repetir(),
        alvo: motor.rota.alvo(),
        caca: motor.cacaInfo(),
      },
      caca: motor.rota.cacaConfig(),
      pausa: motor.pausaRestante(),
      sessao: motor.sessao.snapshot(),
      jogo: st,
      antibot: { ligado: antibot.ligado(), respondidas: antibot.respondidas() },
      autoTarefas: { ligado: autoTarefas },
      pausaHumana: { ligado: motor.humano.ligado() },
      reconexao: { ligado: reconexaoLigada, tentativas: reconTentativas, sucessos: reconSucessos },
      area: { ligado: areaLigada, alvo: areaAlvo, mobs: areaMobs },
      retarget: { ligado: retarget.ligado, sqm: retarget.sqm, alvo: retargetAlvo, areaPrioridade: areaLigada },
      rtc: Object.assign({ ligado: rtcSempre }, rtc.estado()),
      onda: {
        ligado: ondaLigada,
        lado: motor.seguidor.lado(),
        distancia: motor.seguidor.distanciaOnda(),
      },
      suprimentos: sup
        ? Object.assign({}, sup, {
          consumoHora: Math.round(supResumo.consumoHora || 0),
          gastaHora: Math.round(supResumo.gastaHora || 0),
          repoeHora: Math.round(supResumo.repoeHora || 0),
          gastaMin: supResumo.gastaMin || 0,
          repoeMin: supResumo.repoeMin || 0,
          saidas: supResumo.saidas || 0,
          entradas: supResumo.entradas || 0,
          janelaMin: supResumo.janelaMin || 0,
          restanteMin: supResumo.restanteMin,
          status: supResumo.status,
          detalhes: supResumo.itens,
        })
        : null,
    };
  }

  let assinado = false;
  let ligado = false;
  let tarefasAgendadas = false;

  // Oferta de missão bônus (outro popup do cliente): aceita e fecha.
  function aoBonus(m) {
    if (!m || !m.id) return;
    if (!autoTarefas) return;
    if (!ponte.enviar({ t: "bonus", accion: "aceptar", id: Number(m.id) })) {
      registro.evento("bonus_falhou", { id: m.id, motivo: "envio" });
      return;
    }
    try {
      const dialogos = document.querySelectorAll("#hud .lo-dlg");
      const ultimo = dialogos.length ? dialogos[dialogos.length - 1] : null;
      if (ultimo && typeof ultimo._cerrar === "function") ultimo._cerrar();
    } catch (e) {
      // sem diálogo aberto
    }
    registro.evento("bonus_aceito", { id: m.id });
  }

  // Assina (ou recoloca) os handlers de task. O cliente troca o array de
  // `tareaRepetir`/`bonusOferta` no `vb03.js`; por isso nunca confiamos em uma
  // assinatura única feita antes dos scripts.
  function garantirTarefas() {
    if (!ponte.pronto()) return false;
    const tarefa = ponte.garantirHandler("tareaRepetir", tarefas.aoConcluir);
    const bonus = ponte.garantirHandler("bonusOferta", aoBonus);
    const atualiza = ponte.garantirHandler("tarea", tarefas.aoAtualizar);
    const lista = ponte.garantirHandler("tareas", tarefas.aoAtualizar);
    return tarefa && bonus && atualiza && lista;
  }

  function agendarTarefas() {
    // `interactive`/`complete`: os scripts síncronos (inclusive o vb03.js) já
    // rodaram. `loading`: espera o DOMContentLoaded, que é depois de todos eles
    // e antes de imagens/analytics atrasarem o `load`.
    if (document.readyState !== "loading") {
      garantirTarefas();
      return;
    }
    if (tarefasAgendadas) return;
    tarefasAgendadas = true;
    if (document && typeof document.addEventListener === "function") {
      document.addEventListener("DOMContentLoaded", garantirTarefas, { once: true });
    }
    if (typeof window.addEventListener === "function") {
      window.addEventListener("load", garantirTarefas, { once: true });
    }
    if (typeof document.addEventListener !== "function" && typeof window.addEventListener !== "function") {
      garantirTarefas();
    }
  }

  // A escolha de alvo é NOSSA (círculo de 5 SQM centrado no alvo). Desligamos o
  // "escolher alvo sozinho" do Hunt Assist para ele não sobrescrever a escolha.
  function otimizarArea(segundaTentativa) {
    const a = window.Asistente;
    if (!a) {
      registro.evento("area_indisponivel", {});
      return false;
    }
    if (!a.aa) {
      ponte.enviar({ t: "huntassist", pedir: true });
      registro.evento("area_sem_config", {});
      if (!segundaTentativa) {
        setTimeout(function () { otimizarArea(true); }, 1500);
      }
      return false;
    }
    try {
      a.aa.on = true;
      a.aa.cerca = false; // alvo vem do Olivia (AreaAttack local)
      a.aa.modo = 2; // 2 = mais juntos (mantém a compatibilidade)
      if (typeof a.mandarAA === "function") {
        a.mandarAA();
      } else {
        const c = a.aa.combo || { runa: 0, on: true };
        const lista = (a.aa.lista || []).map(function (x) {
          return x.id + ":" + x.mobs + ":" + x.mana;
        }).join(",");
        ponte.enviar({
          t: "huntassist",
          aa: (a.aa.on ? "on" : "off") + ";" + (a.aa.cerca ? 1 : 0) + ";" + lista + ";2;" +
            (c.runa || 0) + ":" + (c.on ? 1 : 0) + ";" + (a.aa.recta ? 1 : 0),
        });
      }
      registro.evento("area_otimizada", { modo: 2, cerca: false, raio: 2.5 });
      return true;
    } catch (e) {
      registro.evento("area_erro", { erro: String(e) });
      return false;
    }
  }

  // A cada 700 ms reavalia o alvo com o círculo de raio 2,5 (diâmetro 5) e a
  // histerese do desktop: +2 monstros para trocar e 3 s segurando o escolhido.
  function passoArea() {
    if (!areaLigada || suspenso || document.hidden === true || !ponte.pronto()) return;
    // Menu de opções/inventário/task aberto: não varre monstros nem troca alvo.
    if (ponte.interfaceAberta && ponte.interfaceAberta()) return;
    const st = ponte.estado();
    if (!st.emJogo || !st.vivo || !st.pos) return;
    const monstros = ponte.monstros();
    const atual = ponte.objetivo();
    const escolha = area.passo(st.pos, monstros, atual, Date.now());
    if (!escolha) return;
    if (ponte.mirar(escolha.id)) {
      areaAlvo = escolha.id;
      areaMobs = escolha.count;
      registro.evento("area_alvo", {
        id: escolha.id,
        mobs: escolha.count,
        antes: atual,
        dist: Math.round(escolha.distance * 10) / 10,
        raio: 2.5,
        candidatos: monstros.length,
      });
    }
  }

  // Re-target por distância: se o alvo atual ficou longe, pega o monstro mais
  // próximo. A otimização de área tem prioridade e desliga esta regra.
  function passoRetarget() {
    if (!retarget.ligado || areaLigada || suspenso || document.hidden === true || !ponte.pronto()) return;
    if (ponte.interfaceAberta && ponte.interfaceAberta()) return;
    const st = ponte.estado();
    if (!st.emJogo || !st.vivo || !st.pos) return;
    const atualId = ponte.objetivo();
    if (atualId == null) return;
    const atual = ponte.entidade(atualId);
    if (!atual || atual.morto || !Number.isFinite(atual.x) || !Number.isFinite(atual.y)) return;
    const escolha = escolherRetarget(
      st.pos,
      { id: atualId, x: atual.x, y: atual.y },
      ponte.monstros(),
      retarget.sqm
    );
    if (!escolha) return;
    if (ponte.mirar(escolha.id)) {
      retargetAlvo = escolha.id;
      registro.evento("retarget_alvo", {
        de: atualId,
        para: escolha.id,
        distancia: escolha.distancia,
        antes: escolha.antes,
        limite: retarget.sqm,
      });
    }
  }

  function suspenderAutomacao(motivo) {
    const estavaRodando = motor.rodando();
    suspenso = true;
    motor.encerrar();
    if (estavaRodando) {
      registro.evento("automacao_suspensa", { motivo: motivo || "oculto" });
    }
  }

  function retomarAutomacao(motivo) {
    suspenso = false;
    if (document.hidden === true) return false;
    if (!ligado || motor.modo() === "parada" || motor.rodando()) return false;
    motor.retomar();
    registro.evento("automacao_retomada", { motivo: motivo || "visivel" });
    return true;
  }

  function vigiarVisibilidade() {
    if (document.hidden === true) suspenderAutomacao("oculto");
    else retomarAutomacao("visivel");
  }

  function subir() {
    if (!ponte.pronto()) return false;
    if (!assinado) assinado = antibot.assinar();
    agendarTarefas();
    if (!ligado) {
      ligado = true;
      // Abriu já em segundo plano: não começa a mandar ação até voltar à tela.
      if (!suspenso && document.hidden !== true) motor.iniciar();
    }
    return assinado && ligado;
  }

  if (document && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", vigiarVisibilidade);
  }
  vigiarVisibilidade();

  if (!subir()) {
    const timer = setInterval(function () {
      if (!subir()) return;
      clearInterval(timer);
      tentarRestaurarSessao();
      tentarRetomarRota();
    }, 500);
  } else {
    tentarRestaurarSessao();
    tentarRetomarRota();
  }

  // Reaplica o Hunt Assist em "área" depois de cada recarga, se estava ligado.
  if (areaLigada) {
    setTimeout(function () { otimizarArea(false); }, 2500);
  }

  // ---- ligação com o painel nativo (APK) ---------------------------------

  const ponteNativa = window.OliviaAndroid && typeof window.OliviaAndroid.estado === "function"
    ? window.OliviaAndroid
    : null;

  function publicar() {
    if (!ponteNativa) return;
    try { ponteNativa.estado(JSON.stringify(retrato())); } catch (ignorado) { /* ignorado */ }
  }

  if (ponteNativa) {
    // 1 s mantém a presença (Shift) alinhada ao primeiro `ir` da rota.
    setInterval(publicar, 1000);
    publicar();
  }

  // Guarda a rota a cada 3 s e tenta retomar depois de mortes e recargas.
  // Com menu aberto não grava: o estado não muda e o localStorage é síncrono.
  setInterval(function () {
    // O cliente pode substituir o array de handlers depois da primeira
    // assinatura; recoloca sem duplicar antes de qualquer outra checagem.
    if (document.readyState !== "loading") garantirTarefas();
    if (ponte.interfaceAberta && ponte.interfaceAberta()) return;
    if (ligado) {
      if (!sessaoTentada) tentarRestaurarSessao();
      guardarRota();
      guardarSessao();
    }
    if (ligado && motor.modo() === "parada" && rotaAtiva) tentarRetomarRota();
  }, 3000);

  setInterval(vigiarConexao, 5000);
  setInterval(passoArea, 700);
  setInterval(passoRetarget, 700);
  // Confirmação/expiração das repetições de task (prazo de 5 s).
  setInterval(function () { tarefas.passo(); }, 1000);
  // RTC sempre ligado: verifica devagar e só age quando o cliente desligou.
  setInterval(function () {
    if (suspenso || document.hidden === true) return;
    rtc.passo();
  }, 2000);

  window.Olivia = {
    motor: motor,
    painel: painel,
    antibot: antibot,
    sessao: motor.sessao,
    log: registro,
    rota: function (pontos, opcoes) {
      const o = opcoes || {};
      return motor.iniciarRota(pontos, o.origem || "console", o);
    },
    caca: {
      config: function () { return motor.rota.cacaConfig(); },
      definir: function (config) {
        const aplicado = motor.rota.definirCaca(config);
        gravar(CHAVE_CACA, aplicado);
        registro.evento("caca_config", aplicado);
        publicar();
        return aplicado;
      },
      padrao: function () { return Object.assign({}, CACA_PADRAO); },
    },
    seguir: function (id, distancia, opcoes) {
      const o = Object.assign({}, opcoes || {});
      if (o.onda === undefined) o.onda = ondaLigada;
      return motor.seguir(id, distancia, o);
    },
    onda: {
      ligado: function () { return ondaLigada; },
      definir: function (v) {
        ondaLigada = !!v;
        try { localStorage.setItem("ovw.seguirOnda", ondaLigada ? "1" : "0"); } catch (e) { /* sem storage */ }
        motor.definirOnda(ondaLigada);
        publicar();
        return ondaLigada;
      },
      estado: function () {
        return {
          ligado: ondaLigada,
          lado: motor.seguidor.lado(),
          distancia: motor.seguidor.distanciaOnda(),
        };
      },
    },
    jogadores: function () { return ponte.jogadores(); },
    autoTarefas: {
      ligado: function () { return autoTarefas; },
      definir: function (v) {
        autoTarefas = !!v;
        if (!autoTarefas) tarefas.zerar();
        try { localStorage.setItem("ovw.autoTarefas", autoTarefas ? "1" : "0"); } catch (e) { /* sem storage */ }
      },
    },
    tarefas: {
      pendentes: function () { return tarefas.info(); },
      passo: function (agora) { tarefas.passo(agora); },
      garantir: function () { return garantirTarefas(); },
    },
    pausaHumana: {
      ligado: function () { return motor.humano.ligado(); },
      definir: function (v) {
        pausaHumana = !!v;
        motor.humano.definirLigado(pausaHumana);
        try { localStorage.setItem("ovw.pausaHumana", pausaHumana ? "1" : "0"); } catch (e) { /* sem storage */ }
      },
    },
    reconexao: {
      ligado: function () { return reconexaoLigada; },
      definir: function (v) {
        reconexaoLigada = !!v;
        try { localStorage.setItem("ovw.reconexao", reconexaoLigada ? "1" : "0"); } catch (e) { /* sem storage */ }
      },
      estado: function () {
        return { ligado: reconexaoLigada, tentativas: reconTentativas, sucessos: reconSucessos };
      },
    },
    area: {
      otimizar: function () { return otimizarArea(false); },
      ligado: function () { return areaLigada; },
      definir: function (v) {
        areaLigada = !!v;
        try { localStorage.setItem("ovw.area", areaLigada ? "1" : "0"); } catch (e) { /* sem storage */ }
        if (areaLigada) {
          otimizarArea(false);
          passoArea();
        } else {
          area.reset();
          areaAlvo = null;
          areaMobs = 0;
        }
        publicar();
        return areaLigada;
      },
      estado: function () {
        return { ligado: areaLigada, alvo: areaAlvo, mobs: areaMobs, raio: 2.5 };
      },
    },
    retarget: {
      ligado: function () { return retarget.ligado; },
      sqm: function () { return retarget.sqm; },
      estado: function () {
        return { ligado: retarget.ligado, sqm: retarget.sqm, alvo: retargetAlvo, areaPrioridade: areaLigada };
      },
      definir: function (ligado, sqm) {
        retarget.ligado = !!ligado;
        if (sqm !== undefined && Number.isFinite(Number(sqm))) {
          retarget.sqm = Math.max(1, Math.min(8, Math.round(Number(sqm))));
        }
        gravar(CHAVE_RETARGET, retarget);
        retargetAlvo = null;
        registro.evento("retarget_config", {
          ligado: retarget.ligado,
          sqm: retarget.sqm,
          areaPrioridade: areaLigada,
        });
        if (retarget.ligado && !areaLigada) passoRetarget();
        publicar();
        return { ligado: retarget.ligado, sqm: retarget.sqm };
      },
    },
    rtc: {
      ligado: function () { return rtcSempre; },
      definir: function (v) {
        rtcSempre = !!v;
        rtc.definirLigado(rtcSempre);
        try { localStorage.setItem(CHAVE_RTC, rtcSempre ? "1" : "0"); } catch (e) { /* sem storage */ }
        registro.evento("rtc_sempre", { ligado: rtcSempre });
        if (rtcSempre) rtc.passo();
        publicar();
        return rtcSempre;
      },
      estado: function () {
        return Object.assign({ ligado: rtcSempre }, rtc.estado());
      },
    },
    parar: function () { motor.parar("console"); },
    modo: function () { return motor.modo(); },
    suspender: function () { suspenderAutomacao("pedido"); },
    retomarMotor: function () { retomarAutomacao("pedido"); },
    zerar: function () {
      motor.sessao.reset();
      antibot.zerar();
      tarefas.zerar();
      rotaAtiva = false;
      try {
        localStorage.removeItem(CHAVE_ROTA);
        localStorage.removeItem(CHAVE_SESSAO);
      } catch (e) { /* sem storage */ }
      if (painel) painel.atualizar();
      publicar();
    },
    estado: retrato,
  };
})();

})();
