// Motor: laço único que junta estado, rota/seguidor, humanização, sessão e anti-bot.
import { criarLog } from "./log.js";
import { criarSessao } from "./sessao.js";
import { criarHumano } from "./humano.js";
import { criarRota } from "./rota.js";
import { criarSeguidor } from "./seguidor.js";
import { criarSuprimentos } from "./suprimentos.js";

export function criarMotor(opcoes) {
  const cfg = Object.assign({
    ponte: null,
    intervaloMs: 250,
    reenvioMs: 1200,
    // O servidor ignora `ir` para destinos a mais de 8 tiles (medido ao vivo).
    // Andamos em trechos de 6 para folga.
    passoTiles: 6,
    intervaloMinimoMs: 400,
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
  let ultimoPersonagem = null;
  let ultimoMotivoParada = null;
  let trecho = null; // trecho atual: { destino, alvo }
  let pisoRota = null;

  function enviarIr(x, y, forcar) {
    const agora = cfg.agora();
    const chave = x + "," + y;
    if (!forcar && chave === ultimoAlvo) return false;
    if (!forcar && ultimoAlvo !== "" && agora - ultimoEnvio < cfg.intervaloMinimoMs) return false;
    ultimoAlvo = chave;
    ultimoEnvio = agora;
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

  function iniciarRota(pontos, origem, opcoes) {
    const total = rota.carregar(pontos);
    if (opcoes && opcoes.repetir !== undefined) rota.repetir(opcoes.repetir);
    rota.definirAtraso(opcoes ? opcoes.atraso : null);
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
    const alvo = rota.alvo();
    registro.evento("rota_inicio", {
      total: total,
      origem: origem || "api",
      repetir: rota.repetir(),
      indice: rota.indice(),
      proximo: alvo ? alvo.x + "," + alvo.y : "",
      maisProximo: !(opcoes && Number.isInteger(opcoes.indice)),
      atraso: rota.atrasoConfig(),
      pontos: rota.pontos().map((p) => p.x + "," + p.y).join(";"),
    });
    return total;
  }

  function seguir(id, alcance) {
    if (alcance !== undefined) seguidor.definirAlcance(alcance);
    seguindoId = String(id);
    seguidor.seguir(seguindoId, cfg.agora());
    modo = "seguir";
    ultimoAlvo = "";
    trecho = null;
    registro.evento("seguir_inicio", { alvo: seguindoId, sqm: seguidor.alcance() });
    return true;
  }

  function parar(motivo) {
    modo = "parada";
    rota.parar();
    seguidor.parar();
    seguindoId = null;
    ultimoAlvo = "";
    trecho = null;
    pisoRota = null;
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

      const d = rota.passo({ pos: st.pos, agora: agora });
      if (!d) return;

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
      const d = seguidor.passo({ alvo: alvo, pos: st.pos, agora: agora });
      if (!d) return;
      if (d.acao === "ir") {
        const alvo = proximoTrecho({ x: d.x, y: d.y }, st.pos);
        enviarIr(alvo.x, alvo.y, false);
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
        registro.evento("seguir_perdeu", { alvo: d.alvo });
        parar("alvo_perdido");
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
  function retomar() {
    ultimoAlvo = "";
    trecho = null;
    pausadoAte = 0;
    iniciar();
  }

  return {
    iniciar,
    encerrar,
    retomar,
    tick,
    iniciarRota,
    seguir,
    parar,
    modo: () => modo,
    pausadoAte: () => pausadoAte,
    pausaRestante: () => Math.max(0, pausadoAte - cfg.agora(), rota.esperaRestante(cfg.agora())),
    ultimoMotivo: () => ultimoMotivoParada,
    rota,
    seguidor,
    sessao,
    humano,
    suprimentos,
    log: registro,
    seguindoId: () => seguindoId,
  };
}
