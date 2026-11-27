import test from "node:test";
import assert from "node:assert/strict";
import { criarTarefas } from "../src/tarefas.js";

function montar(opcoes) {
  const cfg = opcoes || {};
  const enviados = [];
  const eventos = [];
  let tasks = 0;
  let agora = 1000;
  let fechou = 0;
  let tarefa = cfg.tarefa === undefined
    ? { id: 7, estado: 2, vezes: 0, matados: 3, meta: 3 }
    : cfg.tarefa;
  const t = criarTarefas({
    agora: () => agora,
    enviar: (m) => {
      enviados.push(m);
      return cfg.falharEnvio ? false : true;
    },
    tarefa: () => tarefa,
    fechar: () => { fechou += 1; return "aviso"; },
    sessao: { tarefaConcluida: () => { tasks += 1; } },
    log: { evento: (nome, dados) => eventos.push({ nome, dados }) },
    ligado: () => (cfg.ligado === undefined ? true : cfg.ligado),
  });
  return {
    t,
    enviados,
    eventos,
    estado: () => ({ tasks, fechou, agora, tarefa }),
    definirTarefa: (valor) => { tarefa = valor; },
    avancar: (ms) => { agora += ms; },
    nomes: () => eventos.map((e) => e.nome),
  };
}

test("envia o mesmo pacote do botão oficial e não conta antes de confirmar", () => {
  const c = montar();
  c.t.aoConcluir({ id: 7, titulo: "Task complete", texto: "Rats" });

  assert.deepEqual(c.enviados[0], { t: "tarea", id: 7, accion: "repetir" });
  assert.equal(c.estado().fechou, 1);
  assert.equal(c.estado().tasks, 0);
  assert.deepEqual(c.nomes(), ["tarefa_completa"]);
});

test("conta quando a task volta para em andamento", () => {
  const c = montar();
  c.t.aoConcluir({ id: 7 });
  c.definirTarefa({ id: 7, estado: 1, vezes: 0, matados: 0, meta: 3 });
  c.t.aoAtualizar();

  assert.equal(c.estado().tasks, 1);
  assert.deepEqual(c.nomes(), ["tarefa_completa", "tarefa_repetida"]);
  assert.equal(c.t.info().length, 0);
});

test("conta quando o contador de vezes aumenta", () => {
  const c = montar();
  c.t.aoConcluir({ id: 7 });
  c.definirTarefa({ id: 7, estado: 2, vezes: 1, matados: 3, meta: 3 });
  c.t.aoAtualizar();

  assert.equal(c.estado().tasks, 1);
});

test("conta quando o progresso de mortes zera", () => {
  const c = montar();
  c.t.aoConcluir({ id: 7 });
  c.definirTarefa({ id: 7, estado: 2, vezes: 0, matados: 0, meta: 3 });
  c.t.aoAtualizar();

  assert.equal(c.estado().tasks, 1);
});

test("não conta duas vezes a mesma confirmação", () => {
  const c = montar();
  c.t.aoConcluir({ id: 7 });
  c.definirTarefa({ id: 7, estado: 1, vezes: 0, matados: 0, meta: 3 });
  c.t.aoAtualizar();
  c.t.aoAtualizar();

  assert.equal(c.estado().tasks, 1);
});

test("sem dados anteriores, confirma quando a task fica ativa", () => {
  const c = montar({ tarefa: null });
  c.t.aoConcluir({ id: 7 });
  c.definirTarefa({ id: 7, estado: 3, vezes: 0, matados: 0, meta: 3 });
  c.t.aoAtualizar();

  assert.equal(c.estado().tasks, 1);
});

test("não conta e registra quando o prazo expira sem confirmação", () => {
  const c = montar();
  c.t.aoConcluir({ id: 7 });
  c.t.passo(6001);

  assert.equal(c.estado().tasks, 0);
  assert.ok(c.nomes().includes("tarefa_nao_confirmada"));
  assert.equal(c.t.info().length, 0);
});

test("se o envio falhar, não conta, não fecha e não deixa pendente", () => {
  const c = montar({ falharEnvio: true });
  c.t.aoConcluir({ id: 7 });

  assert.equal(c.estado().tasks, 0);
  assert.equal(c.estado().fechou, 0);
  assert.equal(c.t.info().length, 0);
  assert.ok(c.nomes().includes("tarefa_repetir_falhou"));
});

test("não envia duas vezes a mesma conclusão dentro do prazo", () => {
  const c = montar();
  c.t.aoConcluir({ id: 7 });
  c.avancar(500);
  c.t.aoConcluir({ id: 7 });

  assert.equal(c.enviados.length, 1);
  assert.equal(c.estado().fechou, 2);
  assert.ok(c.nomes().includes("tarefa_repetir_duplicada"));
});

test("permite uma nova repetição depois de confirmar a anterior", () => {
  const c = montar();
  c.t.aoConcluir({ id: 7 });
  c.definirTarefa({ id: 7, estado: 1, vezes: 0, matados: 0, meta: 3 });
  c.t.aoAtualizar();
  c.avancar(1000);
  c.definirTarefa({ id: 7, estado: 2, vezes: 0, matados: 3, meta: 3 });
  c.t.aoConcluir({ id: 7 });

  assert.equal(c.enviados.length, 2);
  assert.equal(c.estado().tasks, 1);
});

test("desligado não envia nem cria pendência", () => {
  const c = montar({ ligado: false });
  c.t.aoConcluir({ id: 7 });

  assert.equal(c.enviados.length, 0);
  assert.equal(c.estado().fechou, 0);
  assert.equal(c.t.info().length, 0);
});

test("zerar limpa as pendências", () => {
  const c = montar();
  c.t.aoConcluir({ id: 7 });
  assert.equal(c.t.info().length, 1);
  c.t.zerar();
  assert.equal(c.t.info().length, 0);
});

test("confirmou exige transição real, não o mesmo estado completo", () => {
  const c = montar();
  const antes = { id: 7, estado: 2, vezes: 0, matados: 3, meta: 3 };
  assert.equal(c.t.confirmou(antes, { id: 7, estado: 2, vezes: 0, matados: 3, meta: 3 }), false);
  assert.equal(c.t.confirmou(antes, { id: 7, estado: 1, vezes: 0, matados: 0, meta: 3 }), true);
  assert.equal(c.t.confirmou(antes, { id: 7, estado: 3, vezes: 0, matados: 0, meta: 3 }), true);
  assert.equal(c.t.confirmou(antes, { id: 7, estado: 2, vezes: 1, matados: 3, meta: 3 }), true);
  assert.equal(c.t.confirmou(null, { id: 7, estado: 1 }), true);
  assert.equal(c.t.confirmou(null, { id: 7, estado: 2 }), false);
});
