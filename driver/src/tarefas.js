// Coleta automática de tarefas e missões concluídas.
//
// Protocolo do cliente web:
//   tarefa  estado 2 -> {t:"tarea", id, accion:"cobrar"}
//   missão  estado 2 -> {t:"mision", id}
// A resposta do servidor atualiza a lista; quando o estado sai de 2, conta como coletada.
export function criarTarefas(opcoes) {
  const cfg = Object.assign({
    agora: Date.now,
    intervaloMs: 6000,
    atrasoMs: 5000,
    tentativasMax: 3,
  }, opcoes || {});

  let ligado = true;
  let ultimo = 0;
  let coletadasTarefas = 0;
  let coletadasMissoes = 0;
  const memoria = new Map(); // "t12" -> { estado, tentativas, ultima }

  function registrar(tipo, lista, agora, acoes) {
    (lista || []).forEach(function (item) {
      if (!item || !Number.isFinite(item.id)) return;
      const chave = tipo + item.id;
      let m = memoria.get(chave);
      if (!m) {
        m = { estado: null, tentativas: 0, ultima: -Infinity, contado: false };
        memoria.set(chave, m);
      }

      if (m.estado !== item.estado) {
        if (m.estado === 2 && item.estado !== 2 && !m.contado) {
          if (tipo === "m") coletadasMissoes += 1;
          else coletadasTarefas += 1;
        }
        m.estado = item.estado;
        if (item.estado === 2) {
          m.tentativas = 0;
          m.ultima = -Infinity;
          m.contado = false;
        }
      }

      if (item.estado !== 2) return;
      if (m.tentativas >= cfg.tentativasMax) return;
      if (agora - m.ultima < cfg.atrasoMs) return;

      m.tentativas += 1;
      m.ultima = agora;
      if (!m.contado) {
        m.contado = true;
        if (tipo === "m") coletadasMissoes += 1;
        else coletadasTarefas += 1;
      }
      acoes.push(tipo === "m"
        ? { tipo: "m", id: item.id, mensagem: { t: "mision", id: item.id } }
        : { tipo: "t", id: item.id, mensagem: { t: "tarea", id: item.id, accion: "cobrar" } });
    });
  }

  // Missão/tarefa coletada some da lista: limpa a memória (o crédito já foi no envio).
  function fecharAusentes(presentes) {
    memoria.forEach(function (m, chave) {
      if (presentes.has(chave)) return;
      memoria.delete(chave);
    });
  }

  // entrada: { tarefas: [], missoes: [], agora?, enviar?, aoEnviar? }
  function passo(entrada) {
    const dados = entrada || {};
    const agora = Number.isFinite(dados.agora) ? dados.agora : cfg.agora();
    if (!ligado) return [];
    if (agora - ultimo < cfg.intervaloMs) return [];
    ultimo = agora;

    const acoes = [];
    const presentes = new Set();
    (dados.missoes || []).forEach(function (m) { if (m && Number.isFinite(m.id)) presentes.add("m" + m.id); });
    (dados.tarefas || []).forEach(function (t) { if (t && Number.isFinite(t.id)) presentes.add("t" + t.id); });

    registrar("m", dados.missoes, agora, acoes);
    registrar("t", dados.tarefas, agora, acoes);
    fecharAusentes(presentes);

    acoes.forEach(function (a) {
      try {
        if (dados.enviar) dados.enviar(a.mensagem);
        if (dados.aoEnviar) dados.aoEnviar(a);
      } catch (e) {
        // envio nunca derruba o motor
      }
    });
    return acoes;
  }

  function pendentes(entrada) {
    const dados = entrada || {};
    const conta = function (lista) {
      return (lista || []).filter(function (x) { return x && x.estado === 2; }).length;
    };
    return { tarefas: conta(dados.tarefas), missoes: conta(dados.missoes) };
  }

  return {
    passo,
    pendentes,
    ligado: () => ligado,
    definirLigado: (v) => { ligado = !!v; },
    zerar: () => { coletadasTarefas = 0; coletadasMissoes = 0; memoria.clear(); },
    exportar: () => ({ tarefas: coletadasTarefas, missoes: coletadasMissoes }),
    importar: (obj) => {
      if (!obj || typeof obj !== "object") return false;
      coletadasTarefas = Math.max(0, Number(obj.tarefas) || 0);
      coletadasMissoes = Math.max(0, Number(obj.missoes) || 0);
      return true;
    },
    snapshot: (entrada) => {
      const p = pendentes(entrada);
      return {
        ligado: ligado,
        tarefas: coletadasTarefas,
        missoes: coletadasMissoes,
        pendentesTarefas: p.tarefas,
        pendentesMissoes: p.missoes,
      };
    },
  };
}
