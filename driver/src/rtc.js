// Mantém o RTC (Hunt Assist / auto-ataque) ligado usando exatamente o mesmo
// caminho do botão RTC do cliente:
//   Asistente.aa.on = true; Asistente.mandarAA();
// Não embrulha Red/WebSocket/JSON e não cria pacote novo.
export function criarRtcSempre(opcoes) {
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
    // Não religa a cada 2 s: depois de uma tentativa espera o cooldown.
    cooldownMs: 15000,
    // Só considera "ligado de verdade" (e zera as falhas) depois disso.
    estavelMs: 5000,
  }, opcoes || {});

  let ativo = !!cfg.ligado;
  let falhas = 0;
  let bloqueadoAte = 0;
  let pedidoEm = -1;
  let ultimaTentativa = -1;
  let ligadoDesde = 0;

  function logar(nome, dados) {
    if (cfg.log) cfg.log(nome, Object.assign({}, dados || {}));
  }

  function definirLigado(v) {
    ativo = !!v;
    falhas = 0;
    bloqueadoAte = 0;
    pedidoEm = -1;
    ligadoDesde = 0;
    ultimaTentativa = -1;
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
      if (ligadoDesde === 0) ligadoDesde = agora;
      // Só zera as falhas depois que o RTC ficou ligado de verdade por alguns segundos;
      // se o jogo desligar logo em seguida, a próxima tentativa ainda conta como falha.
      if (falhas !== 0 && agora - ligadoDesde >= cfg.estavelMs) {
        falhas = 0;
        bloqueadoAte = 0;
      }
      return { acao: "ativo" };
    }
    ligadoDesde = 0;

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

    // Uma tentativa por cooldown: se o jogo desligou de novo, não fica ligando/desligando.
    if (ultimaTentativa >= 0 && agora - ultimaTentativa < cfg.cooldownMs) {
      return { acao: "cooldown", restanteMs: cfg.cooldownMs - (agora - ultimaTentativa) };
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
