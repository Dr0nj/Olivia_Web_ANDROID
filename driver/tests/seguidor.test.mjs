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

test("espera alvo fora de vista e desiste depois do limite", () => {
  const s = criarSeguidor({ perdaMs: 1000 });
  s.seguir("9", 0);
  assert.deepEqual(s.passo({ alvo: null, pos: { x: 1, y: 1 }, agora: 500 }), { acao: "esperar", motivo: "alvo-fora-de-vista" });
  s.passo({ alvo: { x: 2, y: 2 }, pos: { x: 1, y: 1 }, agora: 900 });
  assert.equal(s.situacao(), "seguindo");
  assert.deepEqual(s.passo({ alvo: null, pos: { x: 1, y: 1 }, agora: 2000 }), { acao: "perdeu", alvo: "9" });
  assert.equal(s.situacao(), "perdeu");
  assert.equal(s.passo({ alvo: null, pos: { x: 1, y: 1 }, agora: 2100 }), null);
});

test("parar encerra o seguimento", () => {
  const s = criarSeguidor();
  s.seguir(1, 0);
  s.parar();
  assert.equal(s.passo({ alvo: { x: 2, y: 2 }, pos: { x: 1, y: 1 }, agora: 10 }), null);
});
