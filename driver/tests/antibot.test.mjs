import test from "node:test";
import assert from "node:assert/strict";
import { criarAntiBot } from "../src/antibot.js";

function montar(extra) {
  const chamadas = [];
  const ponte = {
    aoReceber: () => true,
    responderEresBot: (id, chave) => { chamadas.push([id, chave]); return true; },
  };
  const bot = criarAntiBot(Object.assign({
    ponte: ponte,
    aleatorio: () => 0,
    agendar: (fn) => fn(),
  }, extra || {}));
  return { bot, chamadas };
}

const janela = { id: "abc", seg: 30, b: [{ tx: "Sí", k: "1" }, { tx: "No", k: "2" }] };

test("responde a chave do botão 'No'", () => {
  const { bot, chamadas } = montar();
  bot.aoReceber(janela);
  assert.deepEqual(chamadas, [["abc", "2"]]);
});

test("aceita 'Não' e 'nao' sem acento", () => {
  const { bot, chamadas } = montar();
  bot.aoReceber({ id: "1", b: [{ tx: "Não", k: "7" }] });
  bot.aoReceber({ id: "2", b: [{ tx: "nao", k: "8" }] });
  assert.deepEqual(chamadas, [["1", "7"], ["2", "8"]]);
});

test("não responde duas vezes a mesma janela", () => {
  const { bot, chamadas } = montar();
  bot.aoReceber(janela);
  bot.aoReceber(janela);
  assert.equal(chamadas.length, 1);
});

test("ignora mensagem de fechamento e janela sem botão", () => {
  const { bot, chamadas } = montar();
  bot.aoReceber({ id: "x", cerrar: true });
  bot.aoReceber({ id: "y", b: [{ tx: "Sí", k: "1" }] });
  assert.equal(chamadas.length, 0);
});

test("desligado não responde", () => {
  const { bot, chamadas } = montar();
  bot.definirLigado(false);
  bot.aoReceber(janela);
  assert.equal(chamadas.length, 0);
});

test("ensaio não envia e avisa", () => {
  const vistos = [];
  const { bot, chamadas } = montar({ ensaio: true, aoEnsaio: (id, k) => vistos.push([id, k]) });
  bot.aoReceber(janela);
  assert.equal(chamadas.length, 0);
  assert.deepEqual(vistos, [["abc", "2"]]);
});

test("atraso fica entre 700 e 1600 ms", () => {
  const tempos = [];
  const ponte = { aoReceber: () => true, responderEresBot: () => true };
  const bot = criarAntiBot({
    ponte: ponte,
    aleatorio: () => 0.5,
    agendar: (fn, ms) => { tempos.push(ms); },
  });
  bot.aoReceber(janela);
  assert.equal(tempos[0], 1150);
});
