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

  assert.deepEqual(
    rota.passo({ pos: { x: 9, y: 10 }, agora: 0 }),
    { acao: "ir", x: 10, y: 10, indice: 0 }
  );
  const avancar = rota.passo({ pos: { x: 10, y: 10 }, agora: 100 });
  assert.equal(avancar.acao, "avancar");
  assert.equal(avancar.indice, 1);
  assert.deepEqual(rota.passo({ pos: { x: 11, y: 10 }, agora: 200 }), { acao: "concluir", total: 2, voltas: 1 });
  assert.equal(rota.situacao(), "concluida");
  assert.equal(rota.passo({ pos: { x: 11, y: 10 }, agora: 300 }), null);
});

test("rota começa pelo waypoint mais próximo da posição", () => {
  const rota = criarRota();
  rota.carregar([[0, 0], [10, 0], [20, 0]]);
  rota.iniciar(0, { x: 19, y: 0, z: 0 });
  assert.equal(rota.indice(), 2);
  assert.deepEqual(rota.passo({ pos: { x: 19, y: 0 }, agora: 10 }), { acao: "ir", x: 20, y: 0, indice: 2 });
});

test("chegada perto conta só depois de ficar parado", () => {
  const rota = criarRota({ raioChegada: 1, settleMs: 600 });
  rota.carregar([[10, 10]]);
  rota.iniciar(0);

  assert.equal(rota.passo({ pos: { x: 9, y: 10 }, agora: 0 }).acao, "ir");
  assert.equal(rota.passo({ pos: { x: 9, y: 10 }, agora: 300 }).acao, "ir");
  const perto = rota.passo({ pos: { x: 9, y: 10 }, agora: 700 });
  assert.equal(perto.acao, "concluir");
});

test("pula o ponto travado depois de N tentativas e vai para o próximo", () => {
  const rota = criarRota({ pularApos: 2, timeoutMs: 2500 });
  rota.carregar([[5, 5], [15, 5]]);
  rota.iniciar(0);

  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 0 }).acao, "ir");
  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 3000 }).acao, "repetir");
  const pulou = rota.passo({ pos: { x: 0, y: 0 }, agora: 6000 });
  assert.equal(pulou.acao, "pular");
  assert.equal(pulou.indice, 1);
  assert.equal(pulou.restantes, 1);
  assert.equal(rota.indice(), 1);
  assert.deepEqual(rota.passo({ pos: { x: 0, y: 0 }, agora: 6100 }), { acao: "ir", x: 15, y: 5, indice: 1 });
});

test("sem caminho espera e tenta de novo; desiste no limite", () => {
  const rota = criarRota({ pularApos: 1, timeoutMs: 2500, esperaMs: 1000, esperasMax: 2 });
  rota.carregar([[5, 5]]);
  rota.iniciar(0);

  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 0 }).acao, "ir");
  const sem = rota.passo({ pos: { x: 0, y: 0 }, agora: 3000 });
  assert.equal(sem.acao, "sem_caminho");
  assert.equal(sem.esperas, 1);
  assert.equal(rota.situacao(), "esperando");

  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 3500 }).acao, "esperar");
  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 4100 }).motivo, "recomeco");
  assert.equal(rota.situacao(), "andando");

  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 7000 }).acao, "sem_caminho");
  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 8100 }).motivo, "recomeco");
  const fim = rota.passo({ pos: { x: 0, y: 0 }, agora: 11000 });
  assert.equal(fim.acao, "desistir");
  assert.equal(fim.motivo, "sem_caminho");
  assert.equal(rota.situacao(), "desistiu");
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

  rota.passo({ pos: { x: 1, y: 1 }, agora: 100 });
  const d = rota.passo({ pos: { x: 2, y: 1 }, agora: 200 });
  assert.deepEqual(d, { acao: "volta", volta: 1, total: 2 });
  assert.equal(rota.situacao(), "andando");
  assert.equal(rota.indice(), 0);
  assert.equal(rota.volta(), 1);

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

test("perna longa ganha prazo proporcional à distância", () => {
  const rota = criarRota({ timeoutMs: 1000, msPorTile: 300 });
  rota.carregar([[30, 30]]);
  rota.iniciar(0);
  rota.passo({ pos: { x: 0, y: 0 }, agora: 0 });
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

test("volta concluída limpa os pontos pulados", () => {
  const rota = criarRota({ repetir: true, pularApos: 1 });
  rota.carregar([[5, 5], [6, 5]]);
  rota.iniciar(0);
  rota.passo({ pos: { x: 0, y: 0 }, agora: 0 });
  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 3000 }).acao, "pular");
  assert.deepEqual(rota.pulados(), [0]);
  assert.equal(rota.passo({ pos: { x: 6, y: 5 }, agora: 3100 }).acao, "volta");
  assert.deepEqual(rota.pulados(), []);
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
