// Humanização: pausas longas periódicas e atrasos aleatórios.
export function criarHumano(opcoes) {
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
