// Motor de rota: pontos em tiles, chegada, timeout, novas tentativas e pausa por ponto.
export function criarRota(opcoes) {
  const cfg = Object.assign({
    timeoutMs: 2500,
    tentativasMax: 3,
    pausaPadraoMs: 0,
    // Perna longa não é falha: o limite cresce com a distância até o alvo.
    msPorTile: 350,
    timeoutMaxMs: 15000,
    // Rota fechada: ao chegar no último ponto, volta ao primeiro.
    repetir: false,
    voltasMax: 0, // 0 = sem limite
  }, opcoes || {});

  let pontos = [];
  let indice = 0;
  let situacao = "parada"; // parada | andando | pausada | concluida | desistiu
  let tentativas = 0;
  let desde = 0;
  let pausaAte = 0;
  let finalizando = false;
  let volta = 0;
  let limite = null; // prazo da perna atual; calculado no primeiro passo com posição

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
    return pontos.length;
  }

  // Prazo de uma perna: cresce com a distância em tiles, com teto.
  function prazoDe(pos, alvo) {
    const distancia = Math.max(Math.abs(alvo.x - pos.x), Math.abs(alvo.y - pos.y));
    return Math.min(cfg.timeoutMaxMs, Math.max(cfg.timeoutMs, distancia * cfg.msPorTile));
  }

  function iniciar(agora) {
    if (!pontos.length) return false;
    indice = 0;
    tentativas = 0;
    desde = agora;
    pausaAte = 0;
    finalizando = false;
    limite = null;
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

  // Fecha a volta: repete do primeiro ponto ou conclui a rota.
  function fecharVolta(agora) {
    volta += 1;
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

  // Retorna a decisão do tick: ir | repetir | esperar | avancar | volta | concluir | desistir
  function passo(entrada) {
    const agora = entrada.agora;
    const pos = entrada.pos;
    if (situacao !== "andando") return null;
    if (agora < pausaAte) return { acao: "esperar", motivo: "pausa" };
    if (finalizando) {
      finalizando = false;
      return fecharVolta(agora);
    }
    if (!pos) return { acao: "esperar", motivo: "sem-posicao" };

    const alvo = pontos[indice];
    if (limite === null) limite = prazoDe(pos, alvo);

    if (pos.x === alvo.x && pos.y === alvo.y) {
      indice += 1;
      tentativas = 0;
      desde = agora;
      limite = null;
      if (alvo.pausaMs > 0) pausaAte = agora + alvo.pausaMs;

      if (indice >= pontos.length) {
        // A pausa do último ponto também vale: só fecha a volta quando ela termina.
        if (agora < pausaAte) {
          finalizando = true;
          return { acao: "esperar", motivo: "pausa" };
        }
        return fecharVolta(agora);
      }
      if (agora < pausaAte) return { acao: "esperar", motivo: "pausa" };
      return { acao: "avancar", indice: indice, alvo: pontos[indice] };
    }

    if (agora - desde > limite) {
      tentativas += 1;
      if (tentativas > cfg.tentativasMax) {
        situacao = "desistiu";
        return { acao: "desistir", indice: indice, tentativas: tentativas - 1 };
      }
      desde = agora;
      limite = prazoDe(pos, alvo);
      return { acao: "repetir", x: alvo.x, y: alvo.y, indice: indice, tentativa: tentativas };
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
    repetir,
    definirVolta,
    pontos: () => pontos.map((p) => ({ x: p.x, y: p.y, pausaMs: p.pausaMs })),
    total: () => pontos.length,
    indice: () => indice,
    situacao: () => situacao,
    volta: () => volta,
    alvo: () => (pontos[indice] ? { x: pontos[indice].x, y: pontos[indice].y } : null),
  };
}
