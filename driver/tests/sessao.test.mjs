import test from "node:test";
import assert from "node:assert/strict";
import { criarSessao } from "../src/sessao.js";

function relogio(inicio) {
  let t = inicio || 0;
  return { agora: () => t, avancar: (ms) => { t += ms; } };
}

test("xp/h usa a base da primeira leitura", () => {
  const r = relogio(0);
  const s = criarSessao({ agora: r.agora });
  s.xpAtual(1000);
  r.avancar(3600000);
  s.xpAtual(11000);
  assert.equal(s.xpHora(), 10000);
  assert.equal(s.duracaoMs(), 3600000);
});

test("sem xp ainda, taxa é zero", () => {
  const s = criarSessao({ agora: () => 0 });
  assert.equal(s.xpHora(), 0);
});

test("xp/h soma ganhos e não fica negativo quando o exp cai", () => {
  const r = relogio(0);
  const s = criarSessao({ agora: r.agora });
  s.xpAtual(1000);
  r.avancar(3600000);
  s.xpAtual(11000);
  assert.equal(s.xpHora(), 10000);
  assert.equal(s.snapshot().xp, 10000);

  // Queda brusca (nível virou) não vira xp/h negativo.
  s.xpAtual(500);
  assert.equal(s.snapshot().xp, 10500);
  assert.equal(s.xpHora(), 10500);
});

test("contadores somam e reset limpa", () => {
  const s = criarSessao({ agora: () => 0 });
  s.pontoConcluido();
  s.pontoConcluido();
  s.voltaConcluida();
  s.janelaVista();
  s.antiBotRespondida();
  s.morte();
  s.parada();
  const a = s.snapshot();
  assert.equal(a.pontos, 2);
  assert.equal(a.voltas, 1);
  assert.equal(a.janelas, 1);
  assert.equal(a.antiBot, 1);
  assert.equal(a.mortes, 1);
  assert.equal(a.paradas, 1);

  s.reset();
  const b = s.snapshot();
  assert.equal(b.pontos, 0);
  assert.equal(b.antiBot, 0);
  assert.equal(b.xpHora, 0);
});

test("gold de loot conta aumentos e tasks repetidas contam na sessão", () => {
  const s = criarSessao({ agora: () => 0 });
  s.ouroAtual(100);
  s.ouroAtual(160);
  s.ouroAtual(120); // compra/depósito não vira gold negativo
  s.ouroAtual(130);
  s.tarefaConcluida();
  s.tarefaConcluida();
  const a = s.snapshot();
  assert.equal(a.ouro, 70);
  assert.equal(a.ouroAtual, 130);
  assert.equal(a.tasks, 2);
});

test("troca de personagem reinicia a sessão e mantém o nome", () => {
  const s = criarSessao({ agora: () => 0 });
  s.personagem("Ana");
  s.antiBotRespondida();
  s.personagem("Bia");
  const a = s.snapshot();
  assert.equal(a.personagem, "Bia");
  assert.equal(a.antiBot, 0);
});
