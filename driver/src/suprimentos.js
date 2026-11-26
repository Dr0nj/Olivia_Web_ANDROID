// Estimativa de consumo de suprimentos (poções/runas) a partir da contagem do inventário.
export function criarSuprimentos(opcoes) {
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
