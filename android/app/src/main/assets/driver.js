// ==UserScript==
// @name         Olivia Web
// @namespace    olivia.web
// @version      0.8.2
// @description  Olivia no cliente web do LOW: desafio, rotas, seguidor e sessão.
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
    xpHora,
    personagem,
    reset,
    duracaoMs,
    pontoConcluido: () => { estado.pontos += 1; },
    voltaConcluida: () => { estado.voltas += 1; },
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


// Motor de rota: pontos em tiles, chegada por proximidade, timeout, pulo de ponto,
// espera quando não há caminho e repetição de volta.
//
// Regras trazidas do Olivia desktop:
//  - começa pelo waypoint MAIS PRÓXIMO da posição atual (não sempre o ponto 0);
//  - chegada com raio (não precisa pisar exatamente no tile);
//  - depois de N tentativas sem progresso, pula o ponto e tenta o próximo alcançável;
//  - se todos os pontos falharem, espera 5 s e recomeça a volta (até 12 vezes);
//  - a volta concluída limpa os pontos pulados.
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
  }, opcoes || {});

  let pontos = [];
  let indice = 0;
  let situacao = "parada"; // parada | andando | pausada | esperando | concluida | desistiu
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
      return { x: x, y: y, pausaMs: pausa };
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
  }

  function posicionar(i) {
    if (!pontos.length) return false;
    indice = Math.min(Math.max(0, Number(i) || 0), pontos.length - 1);
    desde = 0;
    tentativas = 0;
    limite = null;
    pulados = new Set();
    ultimaPos = null;
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

  // Decisão do tick: ir | repetir | pular | sem_caminho | esperar | avancar | volta | concluir | desistir
  function passo(entrada) {
    const agora = entrada.agora;
    const pos = entrada.pos;

    if (situacao === "esperando") {
      if (agora < pausaAte) return { acao: "esperar", motivo: "sem-caminho" };
      situacao = "andando";
      pausaAte = 0;
      desde = agora;
      limite = null;
      return { acao: "esperar", motivo: "recomeco" };
    }

    if (situacao !== "andando") return null;
    if (!pos) return { acao: "esperar", motivo: "sem-posicao" };
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
    const perto = !exato && cheb(pos, alvo) <= cfg.raioChegada && parado;

    if (exato || perto) {
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
    repetir,
    definirVolta,
    pontos: () => pontos.map((p) => ({ x: p.x, y: p.y, pausaMs: p.pausaMs })),
    total: () => pontos.length,
    indice: () => indice,
    situacao: () => situacao,
    volta: () => volta,
    pulados: () => Array.from(pulados),
    esperas: () => esperas,
    esperaRestante,
    alvo: () => (pontos[indice] ? { x: pontos[indice].x, y: pontos[indice].y } : null),
  };
}


// Seguidor: mantém o personagem colado a um alvo (jogador) e desiste se o alvo sumir.
function criarSeguidor(opcoes) {
  const cfg = Object.assign({ alcance: 1, perdaMs: 5000 }, opcoes || {});

  let alvoId = null;
  let vistoEm = 0;
  let situacao = "parada"; // parada | seguindo | perdeu

  function seguir(id, agora) {
    alvoId = String(id);
    vistoEm = agora;
    situacao = "seguindo";
    return true;
  }

  function parar() {
    alvoId = null;
    situacao = "parada";
  }

  function distancia(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  // Retorna: ir | esperar | perdeu | null
  function passo(entrada) {
    if (situacao !== "seguindo") return null;
    const agora = entrada.agora;
    const alvo = entrada.alvo;
    const pos = entrada.pos;

    if (alvo && Number.isFinite(alvo.x) && Number.isFinite(alvo.y)) {
      vistoEm = agora;
      if (!pos) return { acao: "esperar", motivo: "sem-posicao" };
      if (distancia(pos, alvo) <= cfg.alcance) return { acao: "esperar", motivo: "colado" };
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
    alvo: () => alvoId,
    situacao: () => situacao,
  };
}


// Estimativa de consumo de suprimentos (poções/runas) a partir da contagem do inventário.
function criarSuprimentos(opcoes) {
  const cfg = Object.assign({
    janelaMs: 10 * 60000,
    minimoMs: 30000,
    minimoConsumo: 3,
  }, opcoes || {});

  let amostras = [];

  function registrar(contagem, agora) {
    if (!Number.isFinite(contagem)) return;
    amostras.push({ t: agora, v: contagem });
    const corte = agora - cfg.janelaMs * 2;
    while (amostras.length && amostras[0].t < corte) amostras.shift();
  }

  function janela(agora) {
    return amostras.filter((a) => a.t >= agora - cfg.janelaMs);
  }

  // Unidades por hora; 0 quando ainda não há base suficiente.
  function porHora(agora) {
    const j = janela(agora);
    if (j.length < 2) return 0;
    const primeira = j[0];
    const ultima = j[j.length - 1];
    const span = ultima.t - primeira.t;
    const consumo = primeira.v - ultima.v;
    if (span < cfg.minimoMs || consumo < cfg.minimoConsumo) return 0;
    return (consumo / span) * 3600000;
  }

  function restanteMin(contagem, agora) {
    const taxa = porHora(agora);
    if (!(taxa > 0)) return null;
    return (contagem / taxa) * 60;
  }

  function reset() { amostras = []; }

  return {
    registrar,
    porHora,
    restanteMin,
    reset,
    amostras: () => amostras.slice(),
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
  function cru() {
    return {
      Red: window.Red,
      J: window.J,
      Hud: window.Hud,
      EresBot: window.EresBot,
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
      estamina: yo && Number.isFinite(yo.estamina) ? yo.estamina : null,
      vida: vida,
      vidaMax: yo && Number.isFinite(yo.vidaMax) ? yo.vidaMax : null,
      mana: yo && Number.isFinite(yo.mana) ? yo.mana : null,
      manaMax: yo && Number.isFinite(yo.manaMax) ? yo.manaMax : null,
    };
  }

  function entidade(id) {
    const e = entidadeDe("j" + id) || entidadeDe("m" + id);
    if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y)) return null;
    return { x: e.x, y: e.y, nome: e.nombre || e.nome || null };
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

  function aoReceber(tipo, fn) {
    const w = cru();
    if (!w.Red || typeof w.Red.al !== "function") return false;
    w.Red.al(tipo, fn);
    return true;
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

    (Array.isArray(inv.mochila) ? inv.mochila : []).forEach(function (o) {
      if (!o) return;
      const qtd = Number(o.cant) || 0;
      itens += qtd;
      const nome = o.nombre || (tabela[o.objeto] && tabela[o.objeto][0]) || "";
      if (/health potion|poci[oó]n de vida|po[cç][aã]o de vida/i.test(nome)) vida += qtd;
      else if (/mana potion|poci[oó]n de man[aá]|po[cç][aã]o de man[aá]/i.test(nome)) mana += qtd;
    });

    return { vida: vida, mana: mana, itens: itens, oro: Number(inv.oro) || 0 };
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

  return {
    pronto, estado, entidade, jogadores, enviar, aoReceber, responderEresBot,
    inventario, suprimentos, caminavel,
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
  let ultimoPersonagem = null;
  let ultimoMotivoParada = null;
  let trecho = null; // trecho atual: { destino, alvo }
  let pisoRota = null;

  function enviarIr(x, y, forcar) {
    const agora = cfg.agora();
    const chave = x + "," + y;
    if (!forcar && chave === ultimoAlvo) return false;
    if (!forcar && ultimoAlvo !== "" && agora - ultimoEnvio < cfg.intervaloMinimoMs) return false;
    ultimoAlvo = chave;
    ultimoEnvio = agora;
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

  function iniciarRota(pontos, origem, opcoes) {
    const total = rota.carregar(pontos);
    if (opcoes && opcoes.repetir !== undefined) rota.repetir(opcoes.repetir);
    rota.definirAtraso(opcoes ? opcoes.atraso : null);
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
    const alvo = rota.alvo();
    registro.evento("rota_inicio", {
      total: total,
      origem: origem || "api",
      repetir: rota.repetir(),
      indice: rota.indice(),
      proximo: alvo ? alvo.x + "," + alvo.y : "",
      maisProximo: !(opcoes && Number.isInteger(opcoes.indice)),
      atraso: rota.atrasoConfig(),
      pontos: rota.pontos().map((p) => p.x + "," + p.y).join(";"),
    });
    return total;
  }

  function seguir(id) {
    seguindoId = String(id);
    seguidor.seguir(seguindoId, cfg.agora());
    modo = "seguir";
    ultimoAlvo = "";
    trecho = null;
    registro.evento("seguir_inicio", { alvo: seguindoId });
    return true;
  }

  function parar(motivo) {
    modo = "parada";
    rota.parar();
    seguidor.parar();
    seguindoId = null;
    ultimoAlvo = "";
    trecho = null;
    pisoRota = null;
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

      const d = rota.passo({ pos: st.pos, agora: agora });
      if (!d) return;

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
      const d = seguidor.passo({ alvo: alvo, pos: st.pos, agora: agora });
      if (!d) return;
      if (d.acao === "ir") {
        const alvo = proximoTrecho({ x: d.x, y: d.y }, st.pos);
        enviarIr(alvo.x, alvo.y, false);
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
  function retomar() {
    ultimoAlvo = "";
    trecho = null;
    pausadoAte = 0;
    iniciar();
  }

  return {
    iniciar,
    encerrar,
    retomar,
    tick,
    iniciarRota,
    seguir,
    parar,
    modo: () => modo,
    pausadoAte: () => pausadoAte,
    pausaRestante: () => Math.max(0, pausadoAte - cfg.agora(), rota.esperaRestante(cfg.agora())),
    ultimoMotivo: () => ultimoMotivoParada,
    rota,
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
      if (Array.isArray(p)) return { x: Number(p[0]), y: Number(p[1]) };
      return { x: Number(p.x), y: Number(p.y), pausaMs: Number(p.pausaMs) || 0 };
    });
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

    const seguir = linha({ marginTop: "6px" });
    partes.idAlvo = el("input", {
      width: "82px",
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
    seguir.appendChild(botao("Seguir", function () {
      const id = Number(partes.idAlvo.value);
      if (!Number.isInteger(id) || id <= 0) return;
      motor.seguir(id);
      atualizar();
    }));
    raiz.appendChild(seguir);

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

    partes.estado.textContent = modo === "parada" ? "parada" : modo;
    partes.modo.textContent = modo === "rota"
      ? "rota · ponto " + indice + "/" + motor.rota.total()
        + " · volta " + motor.rota.volta()
        + (alvo ? " (" + alvo.x + "," + alvo.y + ")" : "")
      : modo === "seguir"
        ? "seguindo " + (motor.seguindoId() || "?")
        : "parada · ponto " + indice + "/" + motor.rota.total();

    const pausa = Math.ceil(motor.pausaRestante() / 1000);
    const suplemento = pausa > 0 ? " · pausa " + pausa + "s" : "";
    partes.numeros.textContent = "tempo " + tempo(s.duracaoMs) + " · xp/h " + s.xpHora.toLocaleString("pt-BR")
      + suplemento;
    partes.contadores.textContent = "pontos " + s.pontos + " · voltas " + s.voltas + " · mortes " + s.mortes;
    partes.desafio.textContent = "desafio " + s.antiBot + "/" + s.janelas + " · " + motor.rota.situacao();

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

  let autoTarefas = (function () {
    try { return localStorage.getItem("ovw.autoTarefas") !== "0"; } catch (e) { return true; }
  })();

  let pausaHumana = (function () {
    try { return localStorage.getItem("ovw.pausaHumana") !== "0"; } catch (e) { return true; }
  })();
  motor.humano.definirLigado(pausaHumana);

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
    const pontos = motor.rota.pontos().map(function (p) { return [p.x, p.y, p.pausaMs]; });
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
      const texto = pontos.map(function (p) {
        return p[2] > 0 ? JSON.stringify({ x: p[0], y: p[1], pausaMs: p[2] }) : "[" + p[0] + "," + p[1] + "]";
      });
      localStorage.setItem("ovw.rota", "[" + texto.join(",") + "]");
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
      motor.suprimentos.registrar(sup.vida + sup.mana, agora);
    }
    return {
      modo: motor.modo(),
      seguir: motor.seguindoId(),
      rota: {
        total: motor.rota.total(),
        indice: motor.rota.indice(),
        situacao: motor.rota.situacao(),
        volta: motor.rota.volta(),
        repetir: motor.rota.repetir(),
      },
      pausa: motor.pausaRestante(),
      sessao: motor.sessao.snapshot(),
      jogo: st,
      antibot: { ligado: antibot.ligado(), respondidas: antibot.respondidas() },
      autoTarefas: { ligado: autoTarefas },
      pausaHumana: { ligado: motor.humano.ligado() },
      suprimentos: sup
        ? Object.assign({}, sup, {
          consumoHora: Math.round(motor.suprimentos.porHora(agora)),
          restanteMin: motor.suprimentos.restanteMin(sup.vida + sup.mana, agora),
        })
        : null,
    };
  }

  let assinado = false;
  let ligado = false;
  let assinadoTarefa = false;

  // Popup "Tarefa completa" do cliente: repete a task que acabou de finalizar, fecha o
  // diálogo e envia o mesmo pacote do botão oficial (sem click sintético, bit 32).
  function aoTarefaCompleta(m) {
    if (!m || !m.id) return;
    if (!autoTarefas) return; // usuário desligou o automático
    try {
      const dialogos = document.querySelectorAll("#hud .lo-dlg");
      const ultimo = dialogos.length ? dialogos[dialogos.length - 1] : null;
      if (ultimo && typeof ultimo._cerrar === "function") ultimo._cerrar();
    } catch (e) {
      // sem diálogo aberto: segue com o envio
    }
    ponte.enviar({ t: "tarea", id: Number(m.id), accion: "repetir" });
    registro.evento("tarefa_completa", { id: m.id, accion: "repetir" });
  }

  // Oferta de missão bônus (outro popup do cliente): aceita e fecha.
  function aoBonus(m) {
    if (!m || !m.id) return;
    if (!autoTarefas) return;
    try {
      const dialogos = document.querySelectorAll("#hud .lo-dlg");
      const ultimo = dialogos.length ? dialogos[dialogos.length - 1] : null;
      if (ultimo && typeof ultimo._cerrar === "function") ultimo._cerrar();
    } catch (e) {
      // sem diálogo aberto
    }
    ponte.enviar({ t: "bonus", accion: "aceptar", id: Number(m.id) });
    registro.evento("bonus_aceito", { id: m.id });
  }

  function subir() {
    if (!ponte.pronto()) return false;
    if (!assinado) assinado = antibot.assinar();
    if (!assinadoTarefa) {
      assinadoTarefa = ponte.aoReceber("tareaRepetir", aoTarefaCompleta);
      ponte.aoReceber("bonusOferta", aoBonus);
    }
    if (!ligado) { motor.iniciar(); ligado = true; }
    return assinado && ligado;
  }

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

  // ---- ligação com o painel nativo (APK) ---------------------------------

  const ponteNativa = window.OliviaAndroid && typeof window.OliviaAndroid.estado === "function"
    ? window.OliviaAndroid
    : null;

  function publicar() {
    if (!ponteNativa) return;
    try { ponteNativa.estado(JSON.stringify(retrato())); } catch (ignorado) { /* ignorado */ }
  }

  if (ponteNativa) {
    setInterval(publicar, 1000);
    publicar();
  }

  // Guarda a rota a cada 3 s e tenta retomar depois de mortes e recargas.
  setInterval(function () {
    if (ligado) {
      if (!sessaoTentada) tentarRestaurarSessao();
      guardarRota();
      guardarSessao();
    }
    if (ligado && motor.modo() === "parada" && rotaAtiva) tentarRetomarRota();
  }, 3000);

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
    seguir: function (id) { return motor.seguir(id); },
    jogadores: function () { return ponte.jogadores(); },
    autoTarefas: {
      ligado: function () { return autoTarefas; },
      definir: function (v) {
        autoTarefas = !!v;
        try { localStorage.setItem("ovw.autoTarefas", autoTarefas ? "1" : "0"); } catch (e) { /* sem storage */ }
      },
    },
    pausaHumana: {
      ligado: function () { return motor.humano.ligado(); },
      definir: function (v) {
        pausaHumana = !!v;
        motor.humano.definirLigado(pausaHumana);
        try { localStorage.setItem("ovw.pausaHumana", pausaHumana ? "1" : "0"); } catch (e) { /* sem storage */ }
      },
    },
    parar: function () { motor.parar("console"); },
    modo: function () { return motor.modo(); },
    suspender: function () { motor.encerrar(); },
    retomarMotor: function () { motor.retomar(); },
    zerar: function () {
      motor.sessao.reset();
      antibot.zerar();
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
