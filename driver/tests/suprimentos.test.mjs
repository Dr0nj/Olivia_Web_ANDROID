import test from "node:test";
import assert from "node:assert/strict";
import { criarSuprimentos } from "../src/suprimentos.js";

test("sem base suficiente não estima", () => {
  const s = criarSuprimentos({ minimoMs: 30000, minimoConsumo: 3 });
  s.registrar(100, 0);
  s.registrar(99, 1000);
  assert.equal(s.porHora(1000), 0);
});

test("calcula consumo por hora e tempo restante", () => {
  const s = criarSuprimentos({ janelaMs: 3600000, minimoMs: 60000, minimoConsumo: 3 });
  s.registrar(120, 0);
  s.registrar(110, 60000);
  s.registrar(100, 120000);
  const taxa = s.porHora(120000);
  assert.equal(Math.round(taxa), 600);
  const min = s.restanteMin(50, 120000);
  assert.equal(Math.round(min), 5);
});

test("reposição zera a janela antiga", () => {
  const s = criarSuprimentos({ janelaMs: 10000, minimoMs: 1000, minimoConsumo: 1 });
  s.registrar(10, 0);
  s.registrar(5, 5000);
  assert.ok(s.porHora(5000) > 0);
  s.registrar(200, 60000);
  assert.equal(s.porHora(60000), 0);
  s.reset();
  assert.equal(s.amostras().length, 0);
});
