// Entrada do driver: monta painel (modo navegador), assina o anti-bot, liga o motor
// e publica o estado para o painel nativo quando roda dentro do APK.
import { criarPonteNavegador } from "./ponte.js";
import { criarLog } from "./log.js";
import { criarMotor } from "./motor.js";
import { criarAntiBot } from "./antibot.js";
import { criarPainel } from "./painel.js";
import { criarArea } from "./area.js";
import { CACA_PADRAO } from "./caca.js";
import { criarRtcSempre } from "./rtc.js";
import { escolherRetarget, RETARGET_SQM_PADRAO } from "./retarget.js";
import { criarTarefas } from "./tarefas.js";

(function () {
  "use strict";

  const nativo = !!window.__OVW_NATIVO;
  const doc = document.documentElement;
  if (!doc || doc.dataset.ovw === "1") return;
  doc.dataset.ovw = "1";

  const CHAVE_ROTA = "ovw.rota.estado";
  const CHAVE_SESSAO = "ovw.sessao";
  const CHAVE_CACA = "ovw.caca";
  const CHAVE_RTC = "ovw.rtcSempre";
  const CHAVE_RETARGET = "ovw.retarget";
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

  // Configuração do ponto de caça (mesmos nomes do HuntSpotSettings do desktop).
  const cacaSalvo = ler(CHAVE_CACA);
  if (cacaSalvo) motor.rota.definirCaca(cacaSalvo);

  // RTC/Hunt Assist: usa a mesma API pública do botão RTC do cliente.
  let rtcSempre = (function () {
    try { return localStorage.getItem(CHAVE_RTC) === "1"; } catch (e) { return false; }
  })();
  const rtc = criarRtcSempre({
    ligado: rtcSempre,
    obter: () => window.Asistente,
    pedir: () => ponte.enviar({ t: "huntassist", pedir: true }),
    interfaceAberta: () => ponte.interfaceAberta ? ponte.interfaceAberta() : false,
    log: (nome, dados) => registro.evento(nome, dados),
  });

  let autoTarefas = (function () {
    try { return localStorage.getItem("ovw.autoTarefas") !== "0"; } catch (e) { return true; }
  })();

  // Repetição de tasks: envia, fecha o popup certo e só conta após confirmação.
  const tarefas = criarTarefas({
    enviar: ponte.enviar,
    tarefa: ponte.tarefa,
    fechar: ponte.fecharAvisoTarefa,
    sessao: motor.sessao,
    log: registro,
    ligado: function () { return autoTarefas; },
    agora: Date.now,
  });

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

  let areaLigada = (function () {
    try { return localStorage.getItem("ovw.area") === "1"; } catch (e) { return false; }
  })();
  const area = criarArea();
  let areaAlvo = null;
  let areaMobs = 0;

  let retarget = (function () {
    const salvo = ler(CHAVE_RETARGET);
    if (salvo && typeof salvo === "object") {
      return {
        ligado: !!salvo.ligado,
        sqm: Math.max(1, Math.min(8, Number(salvo.sqm) || RETARGET_SQM_PADRAO)),
      };
    }
    return { ligado: false, sqm: RETARGET_SQM_PADRAO };
  })();
  let retargetAlvo = null;

  // Seguir knight: fica na vaga da onda a 4 sqm e vira para o alvo.
  let ondaLigada = (function () {
    try { return localStorage.getItem("ovw.seguirOnda") === "1"; } catch (e) { return false; }
  })();
  motor.seguidor.definirOnda(ondaLigada);

  // Automação suspensa quando o jogo sai da tela: nenhum `ir`/skill/área sai
  // enquanto a página está oculta (bit 512 do Calidad).
  let suspenso = false;

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
    const pontos = motor.rota.pontos().map(function (p) {
      if (p.hunt || p.pausaMs > 0) {
        const o = { x: p.x, y: p.y };
        if (p.pausaMs > 0) o.pausaMs = p.pausaMs;
        if (p.hunt) o.hunt = true;
        return o;
      }
      return [p.x, p.y];
    });
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
      localStorage.setItem("ovw.rota", JSON.stringify(pontos));
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
      motor.suprimentos.registrar(sup.lista || sup.pocoes || [], agora);
      motor.sessao.ouroAtual(sup.oro);
    }
    const supResumo = sup ? motor.suprimentos.resumo(agora) : null;
    return {
      modo: motor.modo(),
      pausaUi: motor.pausaInterface(),
      comandando: motor.comandando(),
      rodando: motor.rodando(),
      seguir: motor.seguindoId(),
      automacao: { suspensa: suspenso },
      rota: {
        total: motor.rota.total(),
        indice: motor.rota.indice(),
        situacao: motor.rota.situacao(),
        volta: motor.rota.volta(),
        repetir: motor.rota.repetir(),
        alvo: motor.rota.alvo(),
        caca: motor.cacaInfo(),
      },
      caca: motor.rota.cacaConfig(),
      pausa: motor.pausaRestante(),
      sessao: motor.sessao.snapshot(),
      jogo: st,
      antibot: { ligado: antibot.ligado(), respondidas: antibot.respondidas() },
      autoTarefas: { ligado: autoTarefas },
      pausaHumana: { ligado: motor.humano.ligado() },
      reconexao: { ligado: reconexaoLigada, tentativas: reconTentativas, sucessos: reconSucessos },
      area: { ligado: areaLigada, alvo: areaAlvo, mobs: areaMobs },
      retarget: { ligado: retarget.ligado, sqm: retarget.sqm, alvo: retargetAlvo, areaPrioridade: areaLigada },
      rtc: Object.assign({ ligado: rtcSempre }, rtc.estado()),
      onda: {
        ligado: ondaLigada,
        lado: motor.seguidor.lado(),
        distancia: motor.seguidor.distanciaOnda(),
      },
      suprimentos: sup
        ? Object.assign({}, sup, {
          consumoHora: Math.round(supResumo.consumoHora || 0),
          gastaHora: Math.round(supResumo.gastaHora || 0),
          repoeHora: Math.round(supResumo.repoeHora || 0),
          gastaMin: supResumo.gastaMin || 0,
          repoeMin: supResumo.repoeMin || 0,
          saidas: supResumo.saidas || 0,
          entradas: supResumo.entradas || 0,
          janelaMin: supResumo.janelaMin || 0,
          restanteMin: supResumo.restanteMin,
          status: supResumo.status,
          detalhes: supResumo.itens,
        })
        : null,
    };
  }

  let assinado = false;
  let ligado = false;
  let tarefasAgendadas = false;

  // Oferta de missão bônus (outro popup do cliente): aceita e fecha.
  function aoBonus(m) {
    if (!m || !m.id) return;
    if (!autoTarefas) return;
    if (!ponte.enviar({ t: "bonus", accion: "aceptar", id: Number(m.id) })) {
      registro.evento("bonus_falhou", { id: m.id, motivo: "envio" });
      return;
    }
    try {
      const dialogos = document.querySelectorAll("#hud .lo-dlg");
      const ultimo = dialogos.length ? dialogos[dialogos.length - 1] : null;
      if (ultimo && typeof ultimo._cerrar === "function") ultimo._cerrar();
    } catch (e) {
      // sem diálogo aberto
    }
    registro.evento("bonus_aceito", { id: m.id });
  }

  // Assina (ou recoloca) os handlers de task. O cliente troca o array de
  // `tareaRepetir`/`bonusOferta` no `vb03.js`; por isso nunca confiamos em uma
  // assinatura única feita antes dos scripts.
  function garantirTarefas() {
    if (!ponte.pronto()) return false;
    const tarefa = ponte.garantirHandler("tareaRepetir", tarefas.aoConcluir);
    const bonus = ponte.garantirHandler("bonusOferta", aoBonus);
    const atualiza = ponte.garantirHandler("tarea", tarefas.aoAtualizar);
    const lista = ponte.garantirHandler("tareas", tarefas.aoAtualizar);
    return tarefa && bonus && atualiza && lista;
  }

  function agendarTarefas() {
    // `interactive`/`complete`: os scripts síncronos (inclusive o vb03.js) já
    // rodaram. `loading`: espera o DOMContentLoaded, que é depois de todos eles
    // e antes de imagens/analytics atrasarem o `load`.
    if (document.readyState !== "loading") {
      garantirTarefas();
      return;
    }
    if (tarefasAgendadas) return;
    tarefasAgendadas = true;
    if (document && typeof document.addEventListener === "function") {
      document.addEventListener("DOMContentLoaded", garantirTarefas, { once: true });
    }
    if (typeof window.addEventListener === "function") {
      window.addEventListener("load", garantirTarefas, { once: true });
    }
    if (typeof document.addEventListener !== "function" && typeof window.addEventListener !== "function") {
      garantirTarefas();
    }
  }

  // A escolha de alvo é NOSSA (círculo de 5 SQM centrado no alvo). Desligamos o
  // "escolher alvo sozinho" do Hunt Assist para ele não sobrescrever a escolha.
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
      a.aa.cerca = false; // alvo vem do Olivia (AreaAttack local)
      a.aa.modo = 2; // 2 = mais juntos (mantém a compatibilidade)
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
      registro.evento("area_otimizada", { modo: 2, cerca: false, raio: 2.5 });
      return true;
    } catch (e) {
      registro.evento("area_erro", { erro: String(e) });
      return false;
    }
  }

  // A cada 700 ms reavalia o alvo com o círculo de raio 2,5 (diâmetro 5) e a
  // histerese do desktop: +2 monstros para trocar e 3 s segurando o escolhido.
  function passoArea() {
    if (!areaLigada || suspenso || document.hidden === true || !ponte.pronto()) return;
    // Menu de opções/inventário/task aberto: não varre monstros nem troca alvo.
    if (ponte.interfaceAberta && ponte.interfaceAberta()) return;
    const st = ponte.estado();
    if (!st.emJogo || !st.vivo || !st.pos) return;
    const monstros = ponte.monstros();
    const atual = ponte.objetivo();
    const escolha = area.passo(st.pos, monstros, atual, Date.now());
    if (!escolha) return;
    if (ponte.mirar(escolha.id)) {
      areaAlvo = escolha.id;
      areaMobs = escolha.count;
      registro.evento("area_alvo", {
        id: escolha.id,
        mobs: escolha.count,
        antes: atual,
        dist: Math.round(escolha.distance * 10) / 10,
        raio: 2.5,
        candidatos: monstros.length,
      });
    }
  }

  // Re-target por distância: se o alvo atual ficou longe, pega o monstro mais
  // próximo. A otimização de área tem prioridade e desliga esta regra.
  function passoRetarget() {
    if (!retarget.ligado || areaLigada || suspenso || document.hidden === true || !ponte.pronto()) return;
    if (ponte.interfaceAberta && ponte.interfaceAberta()) return;
    const st = ponte.estado();
    if (!st.emJogo || !st.vivo || !st.pos) return;
    const atualId = ponte.objetivo();
    if (atualId == null) return;
    const atual = ponte.entidade(atualId);
    if (!atual || atual.morto || !Number.isFinite(atual.x) || !Number.isFinite(atual.y)) return;
    const escolha = escolherRetarget(
      st.pos,
      { id: atualId, x: atual.x, y: atual.y },
      ponte.monstros(),
      retarget.sqm
    );
    if (!escolha) return;
    if (ponte.mirar(escolha.id)) {
      retargetAlvo = escolha.id;
      registro.evento("retarget_alvo", {
        de: atualId,
        para: escolha.id,
        distancia: escolha.distancia,
        antes: escolha.antes,
        limite: retarget.sqm,
      });
    }
  }

  function suspenderAutomacao(motivo) {
    const estavaRodando = motor.rodando();
    suspenso = true;
    motor.encerrar();
    if (estavaRodando) {
      registro.evento("automacao_suspensa", { motivo: motivo || "oculto" });
    }
  }

  function retomarAutomacao(motivo) {
    suspenso = false;
    if (document.hidden === true) return false;
    if (!ligado || motor.modo() === "parada" || motor.rodando()) return false;
    motor.retomar();
    registro.evento("automacao_retomada", { motivo: motivo || "visivel" });
    return true;
  }

  function vigiarVisibilidade() {
    if (document.hidden === true) suspenderAutomacao("oculto");
    else retomarAutomacao("visivel");
  }

  function subir() {
    if (!ponte.pronto()) return false;
    if (!assinado) assinado = antibot.assinar();
    agendarTarefas();
    if (!ligado) {
      ligado = true;
      // Abriu já em segundo plano: não começa a mandar ação até voltar à tela.
      if (!suspenso && document.hidden !== true) motor.iniciar();
    }
    return assinado && ligado;
  }

  if (document && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", vigiarVisibilidade);
  }
  vigiarVisibilidade();

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

  // Reaplica o Hunt Assist em "área" depois de cada recarga, se estava ligado.
  if (areaLigada) {
    setTimeout(function () { otimizarArea(false); }, 2500);
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
    // 1 s mantém a presença (Shift) alinhada ao primeiro `ir` da rota.
    setInterval(publicar, 1000);
    publicar();
  }

  // Guarda a rota a cada 3 s e tenta retomar depois de mortes e recargas.
  // Com menu aberto não grava: o estado não muda e o localStorage é síncrono.
  setInterval(function () {
    // O cliente pode substituir o array de handlers depois da primeira
    // assinatura; recoloca sem duplicar antes de qualquer outra checagem.
    if (document.readyState !== "loading") garantirTarefas();
    if (ponte.interfaceAberta && ponte.interfaceAberta()) return;
    if (ligado) {
      if (!sessaoTentada) tentarRestaurarSessao();
      guardarRota();
      guardarSessao();
    }
    if (ligado && motor.modo() === "parada" && rotaAtiva) tentarRetomarRota();
  }, 3000);

  setInterval(vigiarConexao, 5000);
  setInterval(passoArea, 700);
  setInterval(passoRetarget, 700);
  // Confirmação/expiração das repetições de task (prazo de 5 s).
  setInterval(function () { tarefas.passo(); }, 1000);
  // RTC sempre ligado: verifica devagar e só age quando o cliente desligou.
  setInterval(function () {
    if (suspenso || document.hidden === true) return;
    rtc.passo();
  }, 2000);

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
    caca: {
      config: function () { return motor.rota.cacaConfig(); },
      definir: function (config) {
        const aplicado = motor.rota.definirCaca(config);
        gravar(CHAVE_CACA, aplicado);
        registro.evento("caca_config", aplicado);
        publicar();
        return aplicado;
      },
      padrao: function () { return Object.assign({}, CACA_PADRAO); },
    },
    seguir: function (id, distancia, opcoes) {
      const o = Object.assign({}, opcoes || {});
      if (o.onda === undefined) o.onda = ondaLigada;
      return motor.seguir(id, distancia, o);
    },
    onda: {
      ligado: function () { return ondaLigada; },
      definir: function (v) {
        ondaLigada = !!v;
        try { localStorage.setItem("ovw.seguirOnda", ondaLigada ? "1" : "0"); } catch (e) { /* sem storage */ }
        motor.definirOnda(ondaLigada);
        publicar();
        return ondaLigada;
      },
      estado: function () {
        return {
          ligado: ondaLigada,
          lado: motor.seguidor.lado(),
          distancia: motor.seguidor.distanciaOnda(),
        };
      },
    },
    jogadores: function () { return ponte.jogadores(); },
    autoTarefas: {
      ligado: function () { return autoTarefas; },
      definir: function (v) {
        autoTarefas = !!v;
        if (!autoTarefas) tarefas.zerar();
        try { localStorage.setItem("ovw.autoTarefas", autoTarefas ? "1" : "0"); } catch (e) { /* sem storage */ }
      },
    },
    tarefas: {
      pendentes: function () { return tarefas.info(); },
      passo: function (agora) { tarefas.passo(agora); },
      garantir: function () { return garantirTarefas(); },
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
      ligado: function () { return areaLigada; },
      definir: function (v) {
        areaLigada = !!v;
        try { localStorage.setItem("ovw.area", areaLigada ? "1" : "0"); } catch (e) { /* sem storage */ }
        if (areaLigada) {
          otimizarArea(false);
          passoArea();
        } else {
          area.reset();
          areaAlvo = null;
          areaMobs = 0;
        }
        publicar();
        return areaLigada;
      },
      estado: function () {
        return { ligado: areaLigada, alvo: areaAlvo, mobs: areaMobs, raio: 2.5 };
      },
    },
    retarget: {
      ligado: function () { return retarget.ligado; },
      sqm: function () { return retarget.sqm; },
      estado: function () {
        return { ligado: retarget.ligado, sqm: retarget.sqm, alvo: retargetAlvo, areaPrioridade: areaLigada };
      },
      definir: function (ligado, sqm) {
        retarget.ligado = !!ligado;
        if (sqm !== undefined && Number.isFinite(Number(sqm))) {
          retarget.sqm = Math.max(1, Math.min(8, Math.round(Number(sqm))));
        }
        gravar(CHAVE_RETARGET, retarget);
        retargetAlvo = null;
        registro.evento("retarget_config", {
          ligado: retarget.ligado,
          sqm: retarget.sqm,
          areaPrioridade: areaLigada,
        });
        if (retarget.ligado && !areaLigada) passoRetarget();
        publicar();
        return { ligado: retarget.ligado, sqm: retarget.sqm };
      },
    },
    rtc: {
      ligado: function () { return rtcSempre; },
      definir: function (v) {
        rtcSempre = !!v;
        rtc.definirLigado(rtcSempre);
        try { localStorage.setItem(CHAVE_RTC, rtcSempre ? "1" : "0"); } catch (e) { /* sem storage */ }
        registro.evento("rtc_sempre", { ligado: rtcSempre });
        if (rtcSempre) rtc.passo();
        publicar();
        return rtcSempre;
      },
      estado: function () {
        return Object.assign({ ligado: rtcSempre }, rtc.estado());
      },
    },
    parar: function () { motor.parar("console"); },
    modo: function () { return motor.modo(); },
    suspender: function () { suspenderAutomacao("pedido"); },
    retomarMotor: function () { retomarAutomacao("pedido"); },
    zerar: function () {
      motor.sessao.reset();
      antibot.zerar();
      tarefas.zerar();
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
