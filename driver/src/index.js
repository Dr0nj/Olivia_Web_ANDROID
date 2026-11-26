// Entrada do driver: monta painel (modo navegador), assina o anti-bot, liga o motor
// e publica o estado para o painel nativo quando roda dentro do APK.
import { criarPonteNavegador } from "./ponte.js";
import { criarLog } from "./log.js";
import { criarMotor } from "./motor.js";
import { criarAntiBot } from "./antibot.js";
import { criarPainel } from "./painel.js";

(function () {
  "use strict";

  const nativo = !!window.__OVW_NATIVO;
  const doc = document.documentElement;
  if (!doc || doc.dataset.ovw === "1") return;
  doc.dataset.ovw = "1";

  const CHAVE_ROTA = "ovw.rota.estado";
  const CHAVE_SESSAO = "ovw.sessao";
  const CHAVE_COLETA = "ovw.coleta";
  const VALIDADE_RETOMADA_MS = 10 * 60000;

  function ler(chave) {
    try {
      const bruto = localStorage.getItem(chave);
      return bruto ? JSON.parse(bruto) : null;
    } catch (e) {
      return null;
    }
  }

  function gravar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem storage */ }
  }

  let rotaAtiva = false;
  let sessaoTentada = false;
  try {
    const inicial = ler(CHAVE_ROTA);
    rotaAtiva = !!(inicial && inicial.ativa);
  } catch (e) { /* sem storage */ }

  const ponte = criarPonteNavegador();
  const registro = criarLog(function (e) {
    if (!e || !e.nome) return;
    if (e.nome === "rota_inicio" || e.nome === "rota_volta") rotaAtiva = true;
    if (e.nome === "parada") {
      rotaAtiva = e.motivo === "morto" || e.motivo === "fora";
    }
    if (e.nome === "rota_concluida" || e.nome === "rota_desistiu") rotaAtiva = false;
    if (window.OliviaAndroid && typeof window.OliviaAndroid.evento === "function") {
      try { window.OliviaAndroid.evento(JSON.stringify(e)); } catch (ignorado) { /* bridge ausente */ }
    }
    console.debug("[Olivia]", e.nome, e);
  });

  const motor = criarMotor({ ponte: ponte, log: registro });
  restaurarColeta();

  const antibot = criarAntiBot({
    ponte: ponte,
    ensaio: (function () {
      try { return localStorage.getItem("ovw.ensaio") === "1"; } catch (e) { return false; }
    })(),
    aoVer: function () { motor.sessao.janelaVista(); },
    aoResponder: function (id, chave) {
      motor.sessao.antiBotRespondida();
      registro.evento("antibot_resposta", { id: String(id), chave: String(chave) });
    },
    aoEnsaio: function (id, chave) {
      registro.evento("antibot_ensaio", { id: String(id), chave: String(chave) });
      console.info("[Olivia] ensaio: responderia id=" + id + " chave=" + chave);
    },
  });

  const painel = nativo ? null : criarPainel({ motor: motor, antibot: antibot });
  if (painel) painel.montar();

  // ---- persistência: rota, sessão e retomada automática -------------------

  function guardarRota() {
    const pontos = motor.rota.pontos().map(function (p) { return [p.x, p.y, p.pausaMs]; });
    const st = ponte.estado();
    gravar(CHAVE_ROTA, {
      pontos: pontos,
      indice: motor.rota.indice(),
      volta: motor.rota.volta(),
      repetir: motor.rota.repetir(),
      atraso: motor.rota.atrasoConfig ? motor.rota.atrasoConfig() : null,
      personagem: motor.sessao.snapshot().personagem,
      piso: st.pos && Number.isInteger(st.pos.z) ? st.pos.z : null,
      em: Date.now(),
      ativa: rotaAtiva && pontos.length > 0,
    });
    try {
      const texto = pontos.map(function (p) {
        return p[2] > 0 ? JSON.stringify({ x: p[0], y: p[1], pausaMs: p[2] }) : "[" + p[0] + "," + p[1] + "]";
      });
      localStorage.setItem("ovw.rota", "[" + texto.join(",") + "]");
    } catch (e) { /* sem storage */ }
  }

  function guardarSessao() {
    const s = motor.sessao.exportar();
    if (!s || !s.personagem) return;
    gravar(CHAVE_SESSAO, { em: Date.now(), estado: s });
    if (motor.tarefas) gravar(CHAVE_COLETA, motor.tarefas.exportar());
  }

  function restaurarColeta() {
    const guardado = ler(CHAVE_COLETA);
    if (guardado && motor.tarefas) motor.tarefas.importar(guardado);
  }

  function restaurarSessao() {
    const guardado = ler(CHAVE_SESSAO);
    if (!guardado || !guardado.estado) return false;
    if (Date.now() - Number(guardado.em || 0) > VALIDADE_RETOMADA_MS) return false;
    const st = ponte.estado();
    if (!st.nome || (guardado.estado.personagem && guardado.estado.personagem !== st.nome)) return false;
    const atual = motor.sessao.snapshot();
    if (atual.pontos > 0 || atual.voltas > 0 || atual.antiBot > 0) return false;
    motor.sessao.importar(guardado.estado);
    registro.evento("sessao_retomada", {
      personagem: guardado.estado.personagem,
      duracaoMs: motor.sessao.snapshot().duracaoMs,
    });
    return true;
  }

  // O nome do personagem só aparece depois do login: tenta de novo até saber.
  function tentarRestaurarSessao() {
    if (sessaoTentada) return;
    if (!ponte.estado().nome) return;
    sessaoTentada = true;
    restaurarSessao();
  }

  function tentarRetomarRota() {
    if (motor.modo() !== "parada") return false;
    const guardado = ler(CHAVE_ROTA);
    if (!guardado || !guardado.ativa || !Array.isArray(guardado.pontos) || !guardado.pontos.length) return false;
    if (Date.now() - Number(guardado.em || 0) > VALIDADE_RETOMADA_MS) return false;

    const st = ponte.estado();
    if (!st.emJogo || !st.vivo || !st.pos) return false;
    if (guardado.personagem && st.nome && guardado.personagem !== st.nome) return false;

    // Retomar em outro piso andaria às cegas: só retoma no mesmo mapa/piso.
    if (Number.isInteger(guardado.piso) && Number.isInteger(st.pos.z) && guardado.piso !== st.pos.z) {
      registro.evento("rota_nao_retomada", { motivo: "piso", piso: guardado.piso, atual: st.pos.z });
      gravar(CHAVE_ROTA, Object.assign({}, guardado, { ativa: false }));
      return false;
    }

    motor.iniciarRota(guardado.pontos, "retomada", {
      repetir: !!guardado.repetir,
      atraso: guardado.atraso || null,
      indice: Number.isInteger(guardado.indice) ? guardado.indice : 0,
      volta: Number.isInteger(guardado.volta) ? guardado.volta : 0,
    });
    return true;
  }

  // ---- estado para o painel nativo ---------------------------------------

  function retrato() {
    const st = ponte.estado();
    const sup = ponte.suprimentos ? ponte.suprimentos() : null;
    const agora = Date.now();
    if (sup) {
      motor.suprimentos.registrar(sup.vida + sup.mana, agora);
    }
    return {
      modo: motor.modo(),
      seguir: motor.seguindoId(),
      rota: {
        total: motor.rota.total(),
        indice: motor.rota.indice(),
        situacao: motor.rota.situacao(),
        volta: motor.rota.volta(),
        repetir: motor.rota.repetir(),
      },
      pausa: motor.pausaRestante(),
      sessao: motor.sessao.snapshot(),
      jogo: st,
      antibot: { ligado: antibot.ligado(), respondidas: antibot.respondidas() },
      coleta: motor.tarefas ? motor.tarefas.snapshot(ponte.tarefas ? ponte.tarefas() : null) : null,
      suprimentos: sup
        ? Object.assign({}, sup, {
          consumoHora: Math.round(motor.suprimentos.porHora(agora)),
          restanteMin: motor.suprimentos.restanteMin(sup.vida + sup.mana, agora),
        })
        : null,
    };
  }

  let assinado = false;
  let ligado = false;
  let assinadoTarefa = false;

  // Popup "Tarefa completa" do cliente: repete a task que acabou de finalizar, fecha o
  // diálogo e envia o mesmo pacote do botão oficial (sem click sintético, bit 32).
  function aoTarefaCompleta(m) {
    if (!m || !m.id) return;
    if (motor.tarefas && !motor.tarefas.ligado()) return; // usuário desligou o automático
    try {
      const dialogos = document.querySelectorAll("#hud .lo-dlg");
      const ultimo = dialogos.length ? dialogos[dialogos.length - 1] : null;
      if (ultimo && typeof ultimo._cerrar === "function") ultimo._cerrar();
    } catch (e) {
      // sem diálogo aberto: segue com o envio
    }
    ponte.enviar({ t: "tarea", id: Number(m.id), accion: "repetir" });
    registro.evento("tarefa_completa", { id: m.id, accion: "repetir" });
  }

  // Oferta de missão bônus (outro popup do cliente): aceita e fecha.
  function aoBonus(m) {
    if (!m || !m.id) return;
    if (motor.tarefas && !motor.tarefas.ligado()) return;
    try {
      const dialogos = document.querySelectorAll("#hud .lo-dlg");
      const ultimo = dialogos.length ? dialogos[dialogos.length - 1] : null;
      if (ultimo && typeof ultimo._cerrar === "function") ultimo._cerrar();
    } catch (e) {
      // sem diálogo aberto
    }
    ponte.enviar({ t: "bonus", accion: "aceptar", id: Number(m.id) });
    registro.evento("bonus_aceito", { id: m.id });
  }

  function subir() {
    if (!ponte.pronto()) return false;
    if (!assinado) assinado = antibot.assinar();
    if (!assinadoTarefa) {
      assinadoTarefa = ponte.aoReceber("tareaRepetir", aoTarefaCompleta);
      ponte.aoReceber("bonusOferta", aoBonus);
    }
    if (!ligado) { motor.iniciar(); ligado = true; }
    return assinado && ligado;
  }

  if (!subir()) {
    const timer = setInterval(function () {
      if (!subir()) return;
      clearInterval(timer);
      tentarRestaurarSessao();
      tentarRetomarRota();
    }, 500);
  } else {
    tentarRestaurarSessao();
    tentarRetomarRota();
  }

  // ---- ligação com o painel nativo (APK) ---------------------------------

  const ponteNativa = window.OliviaAndroid && typeof window.OliviaAndroid.estado === "function"
    ? window.OliviaAndroid
    : null;

  function publicar() {
    if (!ponteNativa) return;
    try { ponteNativa.estado(JSON.stringify(retrato())); } catch (ignorado) { /* ignorado */ }
  }

  if (ponteNativa) {
    setInterval(publicar, 1000);
    publicar();
  }

  // Guarda a rota a cada 3 s e tenta retomar depois de mortes e recargas.
  setInterval(function () {
    if (ligado) {
      if (!sessaoTentada) tentarRestaurarSessao();
      guardarRota();
      guardarSessao();
    }
    if (ligado && motor.modo() === "parada" && rotaAtiva) tentarRetomarRota();
  }, 3000);

  window.Olivia = {
    motor: motor,
    painel: painel,
    antibot: antibot,
    sessao: motor.sessao,
    log: registro,
    rota: function (pontos, opcoes) {
      const o = opcoes || {};
      return motor.iniciarRota(pontos, o.origem || "console", o);
    },
    seguir: function (id) { return motor.seguir(id); },
    jogadores: function () { return ponte.jogadores(); },
    coletar: {
      ligado: function () { return motor.tarefas.ligado(); },
      definir: function (v) { motor.tarefas.definirLigado(v); },
      estado: function () { return motor.tarefas.snapshot(ponte.tarefas ? ponte.tarefas() : null); },
    },
    parar: function () { motor.parar("console"); },
    modo: function () { return motor.modo(); },
    suspender: function () { motor.encerrar(); },
    retomarMotor: function () { motor.retomar(); },
    zerar: function () {
      motor.sessao.reset();
      antibot.zerar();
      if (motor.tarefas) motor.tarefas.zerar();
      rotaAtiva = false;
      try {
        localStorage.removeItem(CHAVE_ROTA);
        localStorage.removeItem(CHAVE_SESSAO);
        localStorage.removeItem(CHAVE_COLETA);
      } catch (e) { /* sem storage */ }
      if (painel) painel.atualizar();
      publicar();
    },
    estado: retrato,
  };
})();
