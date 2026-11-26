// Motor de rota: pontos em tiles, chegada por proximidade, timeout, pulo de ponto,
// espera quando não há caminho e repetição de volta.
//
// Regras trazidas do Olivia desktop:
//  - começa pelo waypoint MAIS PRÓXIMO da posição atual (não sempre o ponto 0);
//  - chegada com raio (não precisa pisar exatamente no tile);
//  - depois de N tentativas sem progresso, pula o ponto e tenta o próximo alcançável;
//  - se todos os pontos falharem, espera 5 s e recomeça a volta (até 12 vezes);
//  - a volta concluída limpa os pontos pulados.
export function criarRota(opcoes) {
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
