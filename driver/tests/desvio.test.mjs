import test from "node:test";
import assert from "node:assert/strict";
import { planejarDesvio } from "../src/desvio.js";

const livre = () => true;

test("desvia de monstro na frente e devolve o primeiro passo", () => {
  const passo = planejarDesvio({ x: 0, y: 0 }, { x: 3, y: 0 }, livre, [{ x: 1, y: 0 }]);
  assert.ok(passo);
  assert.equal(passo.x === 1 && passo.y === 0, false, "não pode entrar no monstro");
  assert.equal(Math.abs(passo.x) + Math.abs(passo.y), 1, "precisa ser um passo adjacente");
});

test("com caminho livre escolhe o primeiro passo que aproxima", () => {
  assert.equal(planejarDesvio({ x: 0, y: 0 }, { x: 0, y: 0 }, livre, []), null);
  const passo = planejarDesvio({ x: 0, y: 0 }, { x: 3, y: 0 }, livre, [{ x: 9, y: 9 }]);
  assert.deepEqual(passo, { x: 1, y: 0 });
});

test("respeita célula bloqueada recentemente", () => {
  const passo = planejarDesvio({ x: 0, y: 0 }, { x: 3, y: 0 }, livre, [{ x: 1, y: 0 }], {
    bloqueados: new Set(["0,1"]),
  });
  assert.ok(passo);
  assert.equal(passo.x === 0 && passo.y === 1, false, "usou uma célula já bloqueada");
});

test("respeita parede do mapa", () => {
  const passo = planejarDesvio({ x: 0, y: 0 }, { x: 3, y: 0 }, (x, y) => !(x === 0 && y === 1), [{ x: 1, y: 0 }]);
  assert.ok(passo);
  assert.equal(passo.x === 0 && passo.y === 1, false);
});

test("sem alternativa segura não inventa desvio", () => {
  const passo = planejarDesvio({ x: 0, y: 0 }, { x: 3, y: 0 }, (x, y) => x === 0 && y === 0, [{ x: 1, y: 0 }]);
  assert.equal(passo, null);
});
