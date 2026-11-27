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

  let autoTarefas = (function () {
    try { return localStorage.getItem("ovw.autoTarefas") !== "0"; } catch (e) { return true; }
  })();

  let pausaHumana = (function () {
    try { return localStorage.getItem("ovw.pausaHumana") !== "0"; } catch (e) { return true; }
  })();
  motor.humano.definirLigado(pausaHumana);

  let reconexaoLigada = (function () {
    try { return localStorage.getItem("ovw.reconexao") !== "0"; } catch (e) { return true; }
  })();
  let reconTentativas = 0;
  let reconSucessos = 0;
  let ultimaReconexao = 0;
  let wsEstavaAberto = false;

  // Mantém a conexão viva quando o WS cai no meio do jogo (mesma ideia do AutoReconnect).
  function vigiarConexao() {
    if (!reconexaoLigada) return;
    const red = window.Red;
    if (!red || !window.J || !J.enJuego || red.fuera) return;
    const ws = red.ws;
    if (ws && ws.readyState === 0) return;
    const aberto = !!ws && ws.readyState === 1;
    if (aberto) {
      if (!wsEstavaAberto && reconTentativas > reconSucessos) {
        reconSucessos += 1;
        registro.evento("reconectado", { tentativas: reconTentativas });
      }
      wsEstavaAberto = true;
      return;
    }
    wsEstavaAberto = false;
    if (Date.now() - ultimaReconexao < 15000) return;
    ultimaReconexao = Date.now();
    reconTentativas += 1;
    try {
      if (typeof red.conectar === "function") red.conectar();
    } catch (e) { /* tenta de novo no próximo ciclo */ }
    registro.evento("reconexao_tentativa", { tentativas: reconTentativas });
  }

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
      autoTarefas: { ligado: autoTarefas },
      pausaHumana: { ligado: motor.humano.ligado() },
      reconexao: { ligado: reconexaoLigada, tentativas: reconTentativas, sucessos: reconSucessos },
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
    if (!autoTarefas) return; // usuário desligou o automático
    // Envia primeiro (o que importa) e fecha o diálogo em seguida.
    ponte.enviar({ t: "tarea", id: Number(m.id), accion: "repetir" });
    try {
      const dialogos = document.querySelectorAll("#hud .lo-dlg");
      const ultimo = dialogos.length ? dialogos[dialogos.length - 1] : null;
      if (ultimo && typeof ultimo._cerrar === "function") ultimo._cerrar();
    } catch (e) {
      // sem diálogo aberto: o envio já foi feito
    }
    registro.evento("tarefa_completa", { id: m.id, accion: "repetir" });
  }

  // Oferta de missão bônus (outro popup do cliente): aceita e fecha.
  function aoBonus(m) {
    if (!m || !m.id) return;
    if (!autoTarefas) return;
    ponte.enviar({ t: "bonus", accion: "aceptar", id: Number(m.id) });
    try {
      const dialogos = document.querySelectorAll("#hud .lo-dlg");
      const ultimo = dialogos.length ? dialogos[dialogos.length - 1] : null;
      if (ultimo && typeof ultimo._cerrar === "function") ultimo._cerrar();
    } catch (e) {
      // sem diálogo aberto
    }
    registro.evento("bonus_aceito", { id: m.id });
  }

  // Hunt Assist: "mais juntos" + alvo próximo = mesma ideia do AreaAttack do desktop
  // (escolhe o alvo cujo círculo cobre mais monstros, sem trocar por 1).
  function otimizarArea(segundaTentativa) {
    const a = window.Asistente;
    if (!a) {
      registro.evento("area_indisponivel", {});
      return false;
    }
    if (!a.aa) {
      ponte.enviar({ t: "huntassist", pedir: true });
      registro.evento("area_sem_config", {});
      if (!segundaTentativa) {
        setTimeout(function () { otimizarArea(true); }, 1500);
      }
      return false;
    }
    try {
      a.aa.on = true;
      a.aa.cerca = true;
      a.aa.modo = 2; // 2 = mais juntos
      if (typeof a.mandarAA === "function") {
        a.mandarAA();
      } else {
        const c = a.aa.combo || { runa: 0, on: true };
        const lista = (a.aa.lista || []).map(function (x) {
          return x.id + ":" + x.mobs + ":" + x.mana;
        }).join(",");
        ponte.enviar({
          t: "huntassist",
          aa: (a.aa.on ? "on" : "off") + ";" + (a.aa.cerca ? 1 : 0) + ";" + lista + ";2;" +
            (c.runa || 0) + ":" + (c.on ? 1 : 0) + ";" + (a.aa.recta ? 1 : 0),
        });
      }
      registro.evento("area_otimizada", { modo: 2, cerca: true });
      return true;
    } catch (e) {
      registro.evento("area_erro", { erro: String(e) });
      return false;
    }
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

  setInterval(vigiarConexao, 5000);

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
    seguir: function (id, distancia) { return motor.seguir(id, distancia); },
    jogadores: function () { return ponte.jogadores(); },
    autoTarefas: {
      ligado: function () { return autoTarefas; },
      definir: function (v) {
        autoTarefas = !!v;
        try { localStorage.setItem("ovw.autoTarefas", autoTarefas ? "1" : "0"); } catch (e) { /* sem storage */ }
      },
    },
    pausaHumana: {
      ligado: function () { return motor.humano.ligado(); },
      definir: function (v) {
        pausaHumana = !!v;
        motor.humano.definirLigado(pausaHumana);
        try { localStorage.setItem("ovw.pausaHumana", pausaHumana ? "1" : "0"); } catch (e) { /* sem storage */ }
      },
    },
    reconexao: {
      ligado: function () { return reconexaoLigada; },
      definir: function (v) {
        reconexaoLigada = !!v;
        try { localStorage.setItem("ovw.reconexao", reconexaoLigada ? "1" : "0"); } catch (e) { /* sem storage */ }
      },
      estado: function () {
        return { ligado: reconexaoLigada, tentativas: reconTentativas, sucessos: reconSucessos };
      },
    },
    area: {
      otimizar: function () { return otimizarArea(false); },
    },
    parar: function () { motor.parar("console"); },
    modo: function () { return motor.modo(); },
    suspender: function () { motor.encerrar(); },
    retomarMotor: function () { motor.retomar(); },
    zerar: function () {
      motor.sessao.reset();
      antibot.zerar();
      rotaAtiva = false;
      try {
        localStorage.removeItem(CHAVE_ROTA);
        localStorage.removeItem(CHAVE_SESSAO);
      } catch (e) { /* sem storage */ }
      if (painel) painel.atualizar();
      publicar();
    },
    estado: retrato,
  };
})();
