// Seguidor: mantém o personagem colado a um alvo (jogador) e desiste se o alvo sumir.
export function criarSeguidor(opcoes) {
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

  function definirAlcance(v) {
    const n = Number(v);
    cfg.alcance = Number.isFinite(n) ? Math.max(0, Math.min(8, Math.round(n))) : cfg.alcance;
    return cfg.alcance;
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
    definirAlcance,
    alcance: () => cfg.alcance,
    alvo: () => alvoId,
    situacao: () => situacao,
  };
}
