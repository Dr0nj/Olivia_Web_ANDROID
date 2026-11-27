// Repetição de tasks: envia o mesmo pacote do botão oficial do cliente e só
// conta a task depois que o servidor confirma que ela voltou a ficar ativa.
//
// O cliente publica o popup `tareaRepetir`, mas o array de handlers pode ser
// substituído por outro script do jogo. Quem assina (`index.js`) usa
// `ponte.garantirHandler` e recoloca este handler sem duplicar.
export function criarTarefas(opcoes) {
  const cfg = Object.assign({
    confirmarMs: 5000,
    agora: Date.now,
  }, opcoes || {});
  const pendentes = new Map();

  function ligado() {
    return typeof cfg.ligado === "function" ? !!cfg.ligado() : true;
  }

  function logar(nome, dados) {
    if (!cfg.log || typeof cfg.log.evento !== "function") return;
    try { cfg.log.evento(nome, dados); } catch (e) { /* log nunca derruba a task */ }
  }

  function lerTarefa(id) {
    if (typeof cfg.tarefa !== "function") return null;
    try { return cfg.tarefa(id) || null; } catch (e) { return null; }
  }

  function fechar() {
    if (typeof cfg.fechar !== "function") return false;
    try { return cfg.fechar(); } catch (e) { return false; }
  }

  function enviar(msg) {
    if (typeof cfg.enviar !== "function") return false;
    try { return cfg.enviar(msg) !== false; } catch (e) { return false; }
  }

  // A task repetida volta para "em andamento" (1) ou "falta o chefe" (3), ou
  // então o contador de vezes sobe / o progresso de mortes zera.
  function confirmou(antes, depois) {
    if (!depois) return false;
    if (!antes) return depois.estado === 1 || depois.estado === 3;
    if (antes.estado === 2 && (depois.estado === 1 || depois.estado === 3)) return true;
    if (depois.vezes > antes.vezes) return true;
    if (depois.matados < antes.matados) return true;
    return false;
  }

  function contar(id, antes, depois) {
    pendentes.delete(id);
    if (cfg.sessao && typeof cfg.sessao.tarefaConcluida === "function") {
      cfg.sessao.tarefaConcluida();
    }
    logar("tarefa_repetida", { id: id, antes: antes, depois: depois });
  }

  // Popup "Tarefa completa": uma ação por conclusão. Se a mesma conclusão
  // chegar de novo enquanto a anterior não confirmou, não envia outra.
  function aoConcluir(m) {
    if (!m || !m.id) return;
    if (!ligado()) return;
    const id = Number(m.id);
    if (!Number.isFinite(id) || id <= 0) return;

    const agora = cfg.agora();
    const pendente = pendentes.get(id);
    if (pendente && agora < pendente.deadline) {
      const fechou = fechar();
      logar("tarefa_repetir_duplicada", { id: id, fechou: fechou });
      return;
    }

    const antes = lerTarefa(id);
    pendentes.set(id, {
      id: id,
      antes: antes,
      em: agora,
      deadline: agora + cfg.confirmarMs,
    });

    if (!enviar({ t: "tarea", id: id, accion: "repetir" })) {
      pendentes.delete(id);
      logar("tarefa_repetir_falhou", { id: id, motivo: "envio" });
      return;
    }

    const fechou = fechar();
    logar("tarefa_completa", { id: id, accion: "repetir", antes: antes, fechou: fechou });
  }

  // `tarea` e `tareas` chegam depois da repetição. O `Hud` do cliente já
  // atualizou a lista quando este handler roda (ele assina antes do Olivia).
  function aoAtualizar() {
    if (!pendentes.size) return;
    for (const [id, p] of Array.from(pendentes.entries())) {
      const depois = lerTarefa(id);
      if (confirmou(p.antes, depois)) contar(id, p.antes, depois);
    }
  }

  // Rede de segurança: confirma pelo estado atual e, se o prazo passou sem
  // confirmação, não conta. O painel nunca mostra uma repetição que não houve.
  function passo(agora) {
    if (!pendentes.size) return;
    const t = Number.isFinite(agora) ? agora : cfg.agora();
    for (const [id, p] of Array.from(pendentes.entries())) {
      if (t < p.deadline) continue;
      const depois = lerTarefa(id);
      if (confirmou(p.antes, depois)) {
        contar(id, p.antes, depois);
        continue;
      }
      pendentes.delete(id);
      logar("tarefa_nao_confirmada", { id: id, antes: p.antes, depois: depois });
    }
  }

  function zerar() {
    pendentes.clear();
  }

  function info() {
    return Array.from(pendentes.values()).map(function (p) {
      return { id: p.id, em: p.em, deadline: p.deadline, antes: p.antes };
    });
  }

  return {
    aoConcluir,
    aoAtualizar,
    passo,
    zerar,
    info,
    confirmou,
  };
}
