// Motor: laço único que junta estado, rota/seguidor, humanização, sessão e anti-bot.
import { criarLog } from "./log.js";
import { criarSessao } from "./sessao.js";
import { criarHumano } from "./humano.js";
import { criarRota } from "./rota.js";
import { criarSeguidor } from "./seguidor.js";
import { criarSuprimentos } from "./suprimentos.js";
import { planejarDesvio } from "./desvio.js";

export function criarMotor(opcoes) {
  const cfg = Object.assign({
    ponte: null,
    intervaloMs: 250,
    reenvioMs: 1200,
    // O servidor ignora `ir` para destinos a mais de 8 tiles (medido ao vivo).
    // Andamos em trechos de 6 para folga.
    passoTiles: 6,
    intervaloMinimoMs: 400,
    // Tempo parado antes de tratar a célula da frente como ocupada por monstro.
    paradoDesvioMs: 1000,
    desvioDuracaoMs: 2200,
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
  let ultimoGiro = 0;
  let ultimoPersonagem = null;
  let ultimoMotivoParada = null;
  let trecho = null; // trecho atual: { destino, alvo }
  let pisoRota = null;
  let emCaca = false;
  // Interface aberta: pausa comandos e atualizações pesadas até o jogador fechar.
  let pausaInterface = false;
  // Desvio de monstro: um passo lateral por vez, sem pular o waypoint.
  let desvio = null;
  let ultimaPosDesvio = null;
  let paradoDesde = 0;
  let alvoRotaPedido = "";
  const desvioBloqueado = new Map();

  function enviarIr(x, y, forcar) {
    const agora = cfg.agora();
    const chave = x + "," + y;
    if (!forcar && chave === ultimoAlvo) return false;
    if (!forcar && ultimoAlvo !== "" && agora - ultimoEnvio < cfg.intervaloMinimoMs) return false;
    ultimoAlvo = chave;
    ultimoEnvio = agora;
    // O relógio de "parado" começa no comando, não enquanto o Olivia espera
    // parado num ponto de caça/pausa.
    paradoDesde = agora;
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

  function limparDesvio() {
    desvio = null;
    desvioBloqueado.clear();
  }

  function atualizarParado(pos, agora) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    if (!ultimaPosDesvio || ultimaPosDesvio.x !== pos.x || ultimaPosDesvio.y !== pos.y) {
      ultimaPosDesvio = { x: pos.x, y: pos.y };
      paradoDesde = agora;
    }
  }

  // Um passo lateral que aproxime do waypoint, evitando monstros e células já
  // tentadas. Não pula waypoint: só reinicia o prazo e tenta de novo pelo lado.
  function tentarDesvio(pos, destino, mobs, agora) {
    if (!cfg.ponte.caminavel || !pos || !destino) return null;
    for (const [k, ate] of desvioBloqueado) {
      if (ate <= agora) desvioBloqueado.delete(k);
    }
    const passo = planejarDesvio(pos, destino, cfg.ponte.caminavel, mobs, {
      bloqueados: new Set(desvioBloqueado.keys()),
    });
    if (!passo) return null;
    desvioBloqueado.set(passo.x + "," + passo.y, agora + 3000);
    desvio = {
      x: passo.x,
      y: passo.y,
      ate: agora + cfg.desvioDuracaoMs,
      alvo: destino.x + "," + destino.y,
      enviadoEm: 0,
    };
    rota.destravar(agora);
    registro.evento("rota_desvio", {
      de: pos.x + "," + pos.y,
      passo: passo.x + "," + passo.y,
      alvo: destino.x + "," + destino.y,
      mobs: Array.isArray(mobs) ? mobs.length : 0,
    });
    return passo;
  }

  function iniciarRota(pontos, origem, opcoes) {
    const total = rota.carregar(pontos);
    if (opcoes && opcoes.repetir !== undefined) rota.repetir(opcoes.repetir);
    rota.definirAtraso(opcoes ? opcoes.atraso : null);
    if (opcoes && opcoes.caca) rota.definirCaca(opcoes.caca);
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
    emCaca = false;
    pausaInterface = false;
    limparDesvio();
    ultimaPosDesvio = null;
    paradoDesde = cfg.agora();
    alvoRotaPedido = "";
    const alvo = rota.alvo();
    registro.evento("rota_inicio", {
      total: total,
      origem: origem || "api",
      repetir: rota.repetir(),
      indice: rota.indice(),
      proximo: alvo ? alvo.x + "," + alvo.y : "",
      maisProximo: !(opcoes && Number.isInteger(opcoes.indice)),
      atraso: rota.atrasoConfig(),
      caca: rota.cacaConfig(),
      pontos: rota.pontos().map((p) => p.x + "," + p.y + (p.hunt ? "h" : "")).join(";"),
    });
    return total;
  }

  function seguir(id, alcance, opcoes) {
    const o = opcoes || {};
    if (alcance !== undefined) seguidor.definirAlcance(alcance);
    if (o.onda !== undefined) seguidor.definirOnda(o.onda);
    seguindoId = String(id);
    seguidor.seguir(seguindoId, cfg.agora());
    modo = "seguir";
    ultimoAlvo = "";
    trecho = null;
    ultimoGiro = 0;
    pausaInterface = false;
    limparDesvio();
    registro.evento("seguir_inicio", {
      alvo: seguindoId,
      sqm: seguidor.alcanceEfetivo(),
      onda: seguidor.onda(),
    });
    return true;
  }

  function definirOnda(ligado) {
    const estado = seguidor.definirOnda(ligado);
    ultimoAlvo = "";
    trecho = null;
    ultimoGiro = 0;
    registro.evento("seguir_onda", { ligado: estado, sqm: seguidor.alcanceEfetivo() });
    return estado;
  }

  function parar(motivo) {
    modo = "parada";
    rota.parar();
    seguidor.parar();
    seguindoId = null;
    ultimoAlvo = "";
    trecho = null;
    ultimoGiro = 0;
    pisoRota = null;
    emCaca = false;
    pausaInterface = false;
    limparDesvio();
    ultimaPosDesvio = null;
    paradoDesde = 0;
    alvoRotaPedido = "";
    ultimoEnvio = 0;
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

    // Menu/inventário/task/RTC abertos: para os comandos e não compete com a
    // interface do jogo. Ao fechar, a rota retoma do mesmo ponto sem pular.
    const interfaceAberta = cfg.ponte.interfaceAberta ? cfg.ponte.interfaceAberta() : false;
    if (interfaceAberta) {
      if (!pausaInterface) {
        pausaInterface = true;
        ultimoAlvo = "";
        trecho = null;
        cfg.ponte.enviar({ t: "parar" });
        registro.evento("pausa_interface", { modo: modo });
      }
      return;
    }
    if (pausaInterface) {
      pausaInterface = false;
      ultimoAlvo = "";
      trecho = null;
      ultimoGiro = 0;
      if (modo === "rota") {
        rota.retomarAposInterface(agora);
      } else if (modo === "seguir" && seguindoId) {
        seguidor.seguir(seguindoId, agora);
      }
      registro.evento("retomada_interface", { modo: modo });
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

      const mobs = cfg.ponte.monstros ? cfg.ponte.monstros() : [];
      const manaPct = st.mana != null && st.manaMax
        ? (st.mana / st.manaMax) * 100
        : null;

      atualizarParado(st.pos, agora);
      if (desvio) {
        const chegou = st.pos && st.pos.x === desvio.x && st.pos.y === desvio.y;
        if (chegou || agora >= desvio.ate) {
          const antigo = desvio;
          desvio = null;
          ultimoAlvo = "";
          trecho = null;
          rota.destravar(agora);
          registro.evento("rota_desvio_fim", {
            passo: antigo.x + "," + antigo.y,
            chegou: !!chegou,
            alvo: antigo.alvo,
            pos: st.pos,
          });
        } else {
          if (agora - desvio.enviadoEm >= 1000) {
            desvio.enviadoEm = agora;
            enviarIr(desvio.x, desvio.y, true);
          }
          return;
        }
      }

      const d = rota.passo({ pos: st.pos, agora: agora, mobs: mobs, manaPct: manaPct });
      if (!d) return;

      // Alvo novo (ou retomada após pausa/caça) reinicia o relógio do desvio.
      if (d.acao === "ir" || d.acao === "repetir") {
        const chaveAlvo = d.x + "," + d.y;
        if (chaveAlvo !== alvoRotaPedido) {
          alvoRotaPedido = chaveAlvo;
          paradoDesde = agora;
        }
      } else {
        alvoRotaPedido = "";
      }

      // Não saiu do sqm por ~1 s enquanto tentava andar: provavelmente um monstro
      // na célula da frente. Dá um passo lateral em vez de esperar e pular.
      if ((d.acao === "ir" || d.acao === "repetir") && st.pos
          && agora - paradoDesde >= cfg.paradoDesvioMs) {
        const passo = tentarDesvio(st.pos, { x: d.x, y: d.y }, mobs, agora);
        if (passo) {
          enviarIr(passo.x, passo.y, true);
          desvio.enviadoEm = agora;
          return;
        }
      }

      // Ponto de caça: para o personagem e fica segurando até a rota mandar sair.
      if (d.acao === "cacar") {
        if (!emCaca) {
          emCaca = true;
          ultimoAlvo = "";
          trecho = null;
          cfg.ponte.enviar({ t: "parar" });
          registro.evento("caca_inicio", {
            emPonto: !!d.emPonto,
            motivo: d.motivo,
            perto: d.perto,
            pos: st.pos,
          });
        }
        return;
      }
      if (emCaca) {
        emCaca = false;
        registro.evento("caca_fim", {
          motivo: d.cacaMotivo || d.motivo || "",
          emPonto: !!d.emPonto,
          tempoMs: d.tempoMs,
          perto: d.perto,
          pos: st.pos,
        });
      }

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
      const mobs = cfg.ponte.monstros ? cfg.ponte.monstros() : [];
      const d = seguidor.passo({
        alvo: alvo,
        pos: st.pos,
        agora: agora,
        mobs: mobs,
        caminavel: cfg.ponte.caminavel,
      });
      if (!d) return;
      if (d.acao === "ir") {
        const alvo = proximoTrecho({ x: d.x, y: d.y }, st.pos);
        enviarIr(alvo.x, alvo.y, false);
        return;
      }
      if (d.acao === "esperar" && Number.isInteger(d.face)) {
        // Na vaga da onda: vira para o alvo para o feixe atravessar o 3x3.
        // `pc` só gira; repete devagar porque o cliente não informa a direção atual.
        if (agora - ultimoGiro >= 1200) {
          ultimoGiro = agora;
          if (cfg.ponte.girar) cfg.ponte.girar(d.face);
        }
        return;
      }
      if (d.acao === "passo") {
        // Último sqm no mesmo tile: `ir` não entra no piso do jogador, `dir` entra.
        // Um passo por vez: solta a direção antes do próximo tile para não ultrapassar.
        trecho = null;
        ultimoAlvo = "";
        cfg.ponte.enviar({ t: "dir", dx: d.dx, dy: d.dy });
        setTimeout(function () {
          if (modo === "seguir") cfg.ponte.enviar({ t: "parar" });
        }, 240);
        return;
      }
      if (d.acao === "perdeu") {
        // Só avisa: o modo continua ligado, como no desktop. Parar aqui fazia o
        // follow desligar sozinho 5 s depois de o alvo sair do alcance do cliente.
        // Limpa o trecho para reenviar um `ir` novo quando o alvo reaparecer.
        ultimoAlvo = "";
        trecho = null;
        registro.evento("seguir_alvo_fora", { alvo: d.alvo, desdeMs: d.desdeMs });
        return;
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
  // O tempo em segundo plano não pode contar como "sem progresso", senão a rota
  // acorda já no limite e pula waypoint por causa do `onPause` do APK.
  function retomar() {
    ultimoAlvo = "";
    trecho = null;
    pausadoAte = 0;
    ultimoEnvio = 0;
    pausaInterface = false;
    limparDesvio();
    ultimaPosDesvio = null;
    const agora = cfg.agora();
    paradoDesde = agora;
    alvoRotaPedido = "";
    if (modo === "rota") {
      rota.retomarAposInterface(agora);
    } else if (modo === "seguir" && seguindoId) {
      seguidor.seguir(seguindoId, agora);
    }
    iniciar();
  }

  return {
    iniciar,
    encerrar,
    retomar,
    tick,
    iniciarRota,
    seguir,
    definirOnda,
    parar,
    modo: () => modo,
    pausadoAte: () => pausadoAte,
    pausaInterface: () => pausaInterface,
    rodando: () => timer !== null,
    // Presença (tecla Shift) só é necessária enquanto existe `ir` recente.
    // 8 s cobre pernas longas e o trecho de 6 tiles sem flickar a tecla.
    comandando: () => modo !== "parada" && cfg.agora() - ultimoEnvio < 8000,
    pausaRestante: () => {
      const agora = cfg.agora();
      return Math.max(0, pausadoAte - agora, rota.esperaRestante(agora), rota.pausaRestante(agora));
    },
    ultimoMotivo: () => ultimoMotivoParada,
    rota,
    cacaInfo: () => rota.cacaInfo(cfg.agora()),
    seguidor,
    sessao,
    humano,
    suprimentos,
    log: registro,
    seguindoId: () => seguindoId,
  };
}
