import test from "node:test";
import assert from "node:assert/strict";
import { criarRota } from "../src/rota.js";

test("rota recusa lista vazia e ponto inválido", () => {
  const rota = criarRota();
  assert.throws(() => rota.carregar([]));
  assert.throws(() => rota.carregar([{ x: "a", y: 2 }]));
});

test("rota avança ao chegar e conclui no último ponto", () => {
  const rota = criarRota();
  assert.equal(rota.carregar([[10, 10], [11, 10]]), 2);
  assert.equal(rota.iniciar(0), true);

  assert.deepEqual(rota.passo({ pos: { x: 9, y: 10 }, agora: 0 }), { acao: "ir", x: 10, y: 10, indice: 0 });
  assert.deepEqual(rota.passo({ pos: { x: 10, y: 10 }, agora: 100 }), { acao: "avancar", indice: 1, alvo: { x: 11, y: 10, pausaMs: 0 } });
  assert.deepEqual(rota.passo({ pos: { x: 11, y: 10 }, agora: 200 }), { acao: "concluir", total: 2, voltas: 1 });
  assert.equal(rota.situacao(), "concluida");
  assert.equal(rota.passo({ pos: { x: 11, y: 10 }, agora: 300 }), null);
});

test("rota repete e desiste depois do limite", () => {
  const rota = criarRota({ timeoutMs: 1000, tentativasMax: 2, msPorTile: 350 });
  rota.carregar([[5, 5]]);
  rota.iniciar(0);

  // (1,1) → (5,5) dá distância 4, então o limite é 4 × 350 = 1400 ms.
  assert.equal(rota.passo({ pos: { x: 1, y: 1 }, agora: 500 }).acao, "ir");
  assert.equal(rota.passo({ pos: { x: 1, y: 1 }, agora: 1600 }).acao, "repetir");
  assert.equal(rota.passo({ pos: { x: 1, y: 1 }, agora: 3100 }).acao, "repetir");
  assert.equal(rota.passo({ pos: { x: 1, y: 1 }, agora: 4600 }).acao, "desistir");
  assert.equal(rota.situacao(), "desistiu");
});

test("perna longa ganha prazo proporcional à distância", () => {
  const rota = criarRota({ timeoutMs: 1000, msPorTile: 300, tentativasMax: 3 });
  rota.carregar([[30, 30]]);
  rota.iniciar(0);
  rota.passo({ pos: { x: 0, y: 0 }, agora: 0 });
  // 30 tiles × 300 ms = 9000 ms: 5 s de caminhada ainda não é falha.
  assert.equal(rota.passo({ pos: { x: 15, y: 15 }, agora: 5000 }).acao, "ir");
  assert.equal(rota.passo({ pos: { x: 25, y: 25 }, agora: 9500 }).acao, "repetir");
});

test("perna longa tem teto de prazo", () => {
  const rota = criarRota({ timeoutMs: 1000, msPorTile: 300, timeoutMaxMs: 4000 });
  rota.carregar([[200, 200]]);
  rota.iniciar(0);
  rota.passo({ pos: { x: 0, y: 0 }, agora: 0 });
  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 4100 }).acao, "repetir");
});

test("rota espera a pausa do ponto", () => {
  const rota = criarRota();
  rota.carregar([[1, 1, 0], { x: 2, y: 2, pausaMs: 5000 }]);
  rota.iniciar(0);
  rota.passo({ pos: { x: 1, y: 1 }, agora: 0 });
  rota.passo({ pos: { x: 2, y: 2 }, agora: 10 });
  assert.deepEqual(rota.passo({ pos: { x: 2, y: 2 }, agora: 1000 }), { acao: "esperar", motivo: "pausa" });
});

test("rota sem posição espera sem contar timeout", () => {
  const rota = criarRota({ timeoutMs: 100 });
  rota.carregar([[1, 1]]);
  rota.iniciar(0);
  assert.deepEqual(rota.passo({ pos: null, agora: 9999 }), { acao: "esperar", motivo: "sem-posicao" });
  assert.equal(rota.situacao(), "andando");
});

test("rota fechada repete a volta em vez de concluir", () => {
  const rota = criarRota({ repetir: true });
  rota.carregar([[1, 1], [2, 1]]);
  rota.iniciar(0);

  rota.passo({ pos: { x: 1, y: 1 }, agora: 100 }); // avancar
  const d = rota.passo({ pos: { x: 2, y: 1 }, agora: 200 });
  assert.deepEqual(d, { acao: "volta", volta: 1, total: 2 });
  assert.equal(rota.situacao(), "andando");
  assert.equal(rota.indice(), 0);
  assert.equal(rota.volta(), 1);

  // Continua andando do primeiro ponto outra vez.
  assert.deepEqual(rota.passo({ pos: { x: 2, y: 1 }, agora: 300 }), { acao: "ir", x: 1, y: 1, indice: 0 });
});

test("rota repetida respeita voltasMax", () => {
  const rota = criarRota({ repetir: true, voltasMax: 2 });
  rota.carregar([[1, 1]]);
  rota.iniciar(0);

  assert.deepEqual(rota.passo({ pos: { x: 1, y: 1 }, agora: 10 }), { acao: "volta", volta: 1, total: 1 });
  const d = rota.passo({ pos: { x: 1, y: 1 }, agora: 20 });
  assert.equal(d.acao, "concluir");
  assert.equal(d.voltas, 2);
  assert.equal(rota.situacao(), "concluida");
});

test("posicionar retoma a rota de um índice", () => {
  const rota = criarRota();
  rota.carregar([[1, 1], [2, 2], [3, 3]]);
  rota.iniciar(0);
  assert.equal(rota.posicionar(2), true);
  assert.equal(rota.indice(), 2);
  assert.deepEqual(rota.alvo(), { x: 3, y: 3 });
  assert.equal(rota.passo({ pos: { x: 9, y: 9 }, agora: 100 }).x, 3);
});
