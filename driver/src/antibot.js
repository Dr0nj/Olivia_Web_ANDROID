// Anti-bot: responde "Não" na janela do servidor, com atraso aleatório e contagem.
export function criarAntiBot(opcoes) {
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
