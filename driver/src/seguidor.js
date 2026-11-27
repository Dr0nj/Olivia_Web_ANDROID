// Seguidor: mantém o personagem colado a um alvo (jogador) e desiste se o alvo sumir.
export function criarSeguidor(opcoes) {
  const cfg = Object.assign({ alcance: 1, perdaMs: 5000 }, opcoes || {});

  let alvoId = null;
  let vistoEm = 0;
  let situacao = "parada"; // parada | seguindo | perdeu
  let passoEm = 0;

  function seguir(id, agora) {
    alvoId = String(id);
    vistoEm = agora;
    situacao = "seguindo";
    passoEm = 0;
    return true;
  }

  function parar() {
    alvoId = null;
    situacao = "parada";
    passoEm = 0;
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
    alcance: () => cfg.alcance,
    alvo: () => alvoId,
    situacao: () => situacao,
  };
}
