// Contadores por sessão. Reinicia em "zerar sessão" e na troca de personagem.
export function criarSessao(opcoes) {
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
