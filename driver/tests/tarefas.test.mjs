import test from "node:test";
import assert from "node:assert/strict";
import { criarTarefas } from "../src/tarefas.js";

function cenario(opcoes) {
  let agora = 0;
  const enviados = [];
  const t = criarTarefas(Object.assign({ intervaloMs: 0, atrasoMs: 1000, agora: () => agora }, opcoes || {}));
  function passo(lista) {
    return t.passo({
      tarefas: lista.tarefas || [],
      missoes: lista.missoes || [],
      agora: agora,
      enviar: (m) => enviados.push(m),
    });
  }
  return { t, enviados, passo, passar: (ms) => { agora += ms; } };
}

test("coleta missão concluída e conta quando o estado muda", () => {
  const c = cenario();
  c.passo({ missoes: [{ id: 7, estado: 2 }] });
  assert.deepEqual(c.enviados[0], { t: "mision", id: 7 });
  assert.equal(c.t.snapshot({ missoes: [{ id: 7, estado: 2 }] }).missoes, 0);

  c.passar(10);
  c.passo({ missoes: [{ id: 7, estado: 3 }] });
  const s = c.t.snapshot({ missoes: [{ id: 7, estado: 3 }] });
  assert.equal(s.missoes, 1);
  assert.equal(s.pendentesMissoes, 0);
});

test("coleta tarefa concluída com cobrar", () => {
  const c = cenario();
  c.passo({ tarefas: [{ id: 12, estado: 2 }] });
  assert.deepEqual(c.enviados[0], { t: "tarea", id: 12, accion: "cobrar" });
});

test("não coleta antes do atraso nem passa de 3 tentativas", () => {
  const c = cenario({ atrasoMs: 1000 });
  const lista = { missoes: [{ id: 3, estado: 2 }] };

  c.passo(lista);            // t=0  -> 1
  c.passar(400);
  c.passo(lista);            // t=400 -> não
  c.passar(600);
  c.passo(lista);            // t=1000 -> 2
  c.passar(1000);
  c.passo(lista);            // t=2000 -> 3
  c.passar(5000);
  c.passo(lista);            // t=7000 -> limite
  assert.equal(c.enviados.length, 3);
});

test("missão que some depois do envio conta como coletada", () => {
  const c = cenario();
  c.passo({ missoes: [{ id: 5, estado: 2 }] });
  assert.equal(c.enviados.length, 1);
  c.passar(10);
  c.passo({ missoes: [] });
  assert.equal(c.t.snapshot({}).missoes, 1);
});

test("estado que não é 2 não envia nada", () => {
  const c = cenario();
  c.passo({ missoes: [{ id: 1, estado: 1 }], tarefas: [{ id: 2, estado: 3 }] });
  assert.equal(c.enviados.length, 0);
});

test("desligado não envia e zerar limpa contadores", () => {
  const c = cenario();
  c.passo({ missoes: [{ id: 9, estado: 2 }] });
  c.t.definirLigado(false);
  c.passar(10);
  c.passo({ missoes: [{ id: 9, estado: 2 }] });
  assert.equal(c.enviados.length, 1);

  c.t.definirLigado(true);
  c.passar(10);
  c.passo({ missoes: [{ id: 9, estado: 3 }] });
  assert.equal(c.t.snapshot({}).missoes, 1);
  c.t.zerar();
  assert.equal(c.t.snapshot({}).missoes, 0);
});
