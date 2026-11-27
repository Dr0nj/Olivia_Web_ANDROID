import test from "node:test";
import assert from "node:assert/strict";
import { criarSeguidor } from "../src/seguidor.js";

test("vai até o alvo enquanto estiver longe", () => {
  const s = criarSeguidor({ alcance: 1 });
  s.seguir(42, 0);
  assert.deepEqual(s.passo({ alvo: { x: 10, y: 10 }, pos: { x: 5, y: 5 }, agora: 10 }), { acao: "ir", x: 10, y: 10, alvo: "42" });
});

test("para quando está colado (diagonal conta 1)", () => {
  const s = criarSeguidor({ alcance: 1 });
  s.seguir("7", 0);
  assert.deepEqual(s.passo({ alvo: { x: 11, y: 11 }, pos: { x: 10, y: 10 }, agora: 10 }), { acao: "esperar", motivo: "colado" });
});

test("espera alvo fora de vista sem desistir do seguimento", () => {
  const s = criarSeguidor({ perdaMs: 1000 });
  s.seguir("9", 0);
  assert.deepEqual(s.passo({ alvo: null, pos: { x: 1, y: 1 }, agora: 500 }), { acao: "esperar", motivo: "alvo-fora-de-vista" });
  s.passo({ alvo: { x: 2, y: 2 }, pos: { x: 1, y: 1 }, agora: 900 });
  assert.equal(s.situacao(), "seguindo");

  // Passou do limite: avisa uma vez, mas continua seguindo.
  assert.deepEqual(s.passo({ alvo: null, pos: { x: 1, y: 1 }, agora: 2000 }), { acao: "perdeu", alvo: "9", desdeMs: 1100 });
  assert.equal(s.situacao(), "seguindo");
  assert.deepEqual(s.passo({ alvo: null, pos: { x: 1, y: 1 }, agora: 2100 }), { acao: "esperar", motivo: "alvo-fora-de-vista" });

  // Alvo voltou: retoma sozinho, sem precisar de novo `seguir`.
  assert.deepEqual(s.passo({ alvo: { x: 5, y: 5 }, pos: { x: 1, y: 1 }, agora: 2500 }), { acao: "ir", x: 5, y: 5, alvo: "9" });
  assert.equal(s.situacao(), "seguindo");
});

test("parar encerra o seguimento", () => {
  const s = criarSeguidor();
  s.seguir(1, 0);
  s.parar();
  assert.equal(s.passo({ alvo: { x: 2, y: 2 }, pos: { x: 1, y: 1 }, agora: 10 }), null);
});

test("distância 0: longe usa ir, colado usa um passo por vez", () => {
  const s = criarSeguidor({ alcance: 0 });
  s.seguir("5", 0);
  assert.deepEqual(s.passo({ alvo: { x: 10, y: 10 }, pos: { x: 7, y: 10 }, agora: 100 }), { acao: "ir", x: 10, y: 10, alvo: "5" });

  const passo = s.passo({ alvo: { x: 10, y: 10 }, pos: { x: 9, y: 10 }, agora: 200 });
  assert.deepEqual(passo, { acao: "passo", dx: 1, dy: 0, alvo: "5" });

  // Não manda outro passo no meio do deslocamento.
  assert.deepEqual(s.passo({ alvo: { x: 10, y: 10 }, pos: { x: 9, y: 10 }, agora: 400 }), { acao: "esperar", motivo: "subindo" });

  const outro = s.passo({ alvo: { x: 10, y: 10 }, pos: { x: 9, y: 10 }, agora: 900 });
  assert.deepEqual(outro, { acao: "passo", dx: 1, dy: 0, alvo: "5" });

  // Chegou no mesmo tile: para.
  assert.deepEqual(s.passo({ alvo: { x: 10, y: 10 }, pos: { x: 10, y: 10 }, agora: 1000 }), { acao: "esperar", motivo: "colado" });
});

test("distância 0: passo diagonal usa dx e dy", () => {
  const s = criarSeguidor({ alcance: 0 });
  s.seguir("5", 0);
  assert.deepEqual(s.passo({ alvo: { x: 10, y: 10 }, pos: { x: 9, y: 9 }, agora: 100 }), { acao: "passo", dx: 1, dy: 1, alvo: "5" });
});

test("seguir knight anda para a vaga da onda a 4 sqm", () => {
  const s = criarSeguidor({ onda: true });
  s.seguir("5", 0);
  const d = s.passo({ alvo: { x: 10, y: 10 }, pos: { x: 0, y: 10 }, agora: 100 });
  assert.equal(d.acao, "ir");
  assert.deepEqual({ x: d.x, y: d.y }, { x: 6, y: 10 });
  assert.equal(d.onda, true);
  assert.equal(d.lado, 1);
  assert.equal(d.face, 3);
});

test("seguir knight para na vaga e vira para o alvo", () => {
  const s = criarSeguidor({ onda: true });
  s.seguir("5", 0);
  s.passo({ alvo: { x: 10, y: 10 }, pos: { x: 0, y: 10 }, agora: 100 });
  const d = s.passo({ alvo: { x: 10, y: 10 }, pos: { x: 6, y: 10 }, agora: 200 });
  assert.deepEqual(d, {
    acao: "esperar",
    motivo: "vaga-onda",
    face: 3,
    lado: 1,
    vaga: { x: 6, y: 10 },
    preferido: -1,
  });
});

test("seguir knight troca de lado quando o alvo muda de direção", () => {
  const s = criarSeguidor({ onda: true });
  s.seguir("5", 0);
  s.passo({ alvo: { x: 10, y: 10 }, pos: { x: 6, y: 10 }, agora: 100 });

  // Alvo andou para leste: continua atrás (oeste), agora em 7,10.
  const leste = s.passo({ alvo: { x: 11, y: 10 }, pos: { x: 6, y: 10 }, agora: 1200 });
  assert.equal(leste.acao, "ir");
  assert.deepEqual({ x: leste.x, y: leste.y }, { x: 7, y: 10 });

  // Alvo andou para o norte: a vaga de trás passa a ser ao sul (11,13).
  const norte = s.passo({ alvo: { x: 11, y: 9 }, pos: { x: 7, y: 10 }, agora: 2400 });
  assert.equal(norte.acao, "ir");
  assert.deepEqual({ x: norte.x, y: norte.y }, { x: 11, y: 13 });
  assert.equal(norte.lado, 2);
  assert.equal(norte.face, 1);
});

test("seguir knight usa os monstros do cabo para escolher o lado", () => {
  const s = criarSeguidor({ onda: true });
  s.seguir("5", 0);
  const d = s.passo({
    alvo: { x: 10, y: 10 },
    pos: { x: 6, y: 10 },
    agora: 100,
    mobs: [{ x: 12, y: 10 }, { x: 13, y: 10 }],
  });
  assert.equal(d.acao, "ir");
  assert.deepEqual({ x: d.x, y: d.y }, { x: 14, y: 10 });
  assert.equal(d.lado, 0);
  assert.equal(d.face, 2);
});

test("seguir knight evita vaga ocupada por monstro", () => {
  const s = criarSeguidor({ onda: true });
  s.seguir("5", 0);
  const d = s.passo({
    alvo: { x: 10, y: 10 },
    pos: { x: 0, y: 10 },
    agora: 100,
    mobs: [{ x: 6, y: 10 }],
  });
  assert.equal(d.acao, "ir");
  assert.deepEqual({ x: d.x, y: d.y }, { x: 14, y: 10 });
});

test("seguir knight pode ser desligado no meio", () => {
  const s = criarSeguidor({ onda: true });
  s.seguir("5", 0);
  s.definirOnda(false);
  const d = s.passo({ alvo: { x: 10, y: 10 }, pos: { x: 6, y: 10 }, agora: 100 });
  assert.equal(d.acao, "ir");
  assert.deepEqual({ x: d.x, y: d.y }, { x: 10, y: 10 });
});
