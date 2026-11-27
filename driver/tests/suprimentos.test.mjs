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

test("calcula por item, separa gasto de loot e usa o saldo líquido", () => {
  const s = criarSuprimentos({ janelaMs: 600000, minimoMs: 60000, minimoConsumo: 3 });
  const vida = (q) => ({ id: 1, nome: "Health Potion", tipo: "vida", quantidade: q });
  const mana = (q) => ({ id: 2, nome: "Mana Potion", tipo: "mana", quantidade: q });

  s.registrar([vida(100), mana(50)], 0);
  s.registrar([vida(90), mana(45)], 60000);
  s.registrar([vida(80), mana(55)], 120000);

  const r = s.resumo(120000);
  const vidaR = r.itens.find((i) => i.tipo === "vida");
  const manaR = r.itens.find((i) => i.tipo === "mana");
  assert.equal(vidaR.status, "estimado");
  assert.equal(Math.round(vidaR.restanteMin), 8);
  assert.equal(manaR.status, "loot repõe");
  assert.equal(r.quantidade, 135);
  assert.equal(r.restanteMin, 8);
  assert.ok(r.gastaHora > 0);
  assert.ok(r.repoeHora > 0);
  assert.equal(r.consumoHora, Math.max(0, r.gastaHora - r.repoeHora));
});

test("loot que repõe o gasto não fica preso em coletando", () => {
  const s = criarSuprimentos({ janelaMs: 600000, minimoMs: 60000, minimoConsumo: 3 });
  const vida = (q) => ({ id: 1, nome: "Health Potion", tipo: "vida", quantidade: q });
  s.registrar([vida(100)], 0);
  s.registrar([vida(95)], 60000);
  s.registrar([vida(100)], 120000);
  const r = s.resumo(120000);
  assert.equal(r.status, "loot repõe");
  assert.equal(r.restanteMin, null);
  assert.equal(r.itens[0].status, "loot repõe");
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
