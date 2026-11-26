import test from "node:test";
import assert from "node:assert/strict";
import { criarHumano } from "../src/humano.js";

function relogio() {
  let t = 0;
  return { agora: () => t, avancar: (ms) => { t += ms; } };
}

test("não pausa antes do intervalo", () => {
  const r = relogio();
  const h = criarHumano({ agora: r.agora, aleatorio: () => 0 });
  assert.equal(h.devePausar(), 0);
  r.avancar(60000);
  assert.equal(h.devePausar(), 0);
});

test("pausa no intervalo mínimo e reagenda", () => {
  const r = relogio();
  const h = criarHumano({ agora: r.agora, aleatorio: () => 0, intervaloMinMs: 1000, pausaMinMs: 500 });
  h.devePausar();
  r.avancar(1000);
  assert.equal(h.devePausar(), 500);
  assert.equal(h.devePausar(), 0);
  r.avancar(1000);
  assert.equal(h.devePausar(), 500);
});

test("atraso respeita os limites", () => {
  const h = criarHumano({ aleatorio: () => 0.9999999 });
  assert.equal(h.atraso(700, 1600), 1600);
  const z = criarHumano({ aleatorio: () => 0 });
  assert.equal(z.atraso(700, 1600), 700);
});
