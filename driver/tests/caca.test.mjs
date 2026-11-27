import test from "node:test";
import assert from "node:assert/strict";
import {
  CACA_PADRAO,
  normalizarCaca,
  contarMobs,
  criarCaca,
  TREM_RAIO,
} from "../src/caca.js";

const pos = { x: 10, y: 10 };

function config(extra) {
  return Object.assign({
    raioLimpo: 2,
    minParadoMs: 1000,
    tetoMs: 30000,
    manaMinPct: 30,
    sairComMobs: 0,
    tremMobs: 0,
  }, extra || {});
}

test("configuração do ponto de caça tem os padrões do desktop e limites", () => {
  assert.deepEqual(normalizarCaca(null), CACA_PADRAO);
  const c = normalizarCaca({
    raioLimpo: 0,
    minParadoMs: -5,
    tetoMs: 900001,
    manaMinPct: 200,
    sairComMobs: 50,
    tremMobs: -1,
  });
  assert.equal(c.raioLimpo, 1);
  assert.equal(c.minParadoMs, 0);
  assert.equal(c.tetoMs, 900000);
  assert.equal(c.manaMinPct, 100);
  assert.equal(c.sairComMobs, 10);
  assert.equal(c.tremMobs, 0);
  assert.equal(normalizarCaca({ minParadoMs: 900000, tetoMs: 10000 }).minParadoMs, 10000);
});

test("conta monstros por Chebyshev no raio do ponto", () => {
  assert.equal(TREM_RAIO, 4);
  const mobs = [
    { x: 10, y: 10 },
    { x: 12, y: 12 },
    { x: 13, y: 10 },
    { x: -1, y: -1 },
  ];
  assert.equal(contarMobs(pos, mobs, 2), 2);
  assert.equal(contarMobs(pos, mobs, 4), 3);
});

test("segura no ponto até limpar, confirmar e cumprir o mínimo", () => {
  const caca = criarCaca({ config: config(), aleatorio: () => 0 });
  caca.iniciar(0, { noPonto: true, motivo: "chegou" });

  // Um monstro no raio: ainda não está limpo.
  let r = caca.passo({ agora: 1000, pos: pos, mobs: [{ x: 10, y: 11 }], manaPct: 100, movendo: false });
  assert.equal(r.ativo, true);
  assert.equal(r.limpo, false);
  assert.equal(r.perto, 1);
  assert.match(r.motivo, /monstro/);

  // Sem monstros, começa a confirmação de 1,5 s (aleatório = 0).
  r = caca.passo({ agora: 2000, pos: pos, mobs: [], manaPct: 100, movendo: false });
  assert.equal(r.ativo, true);
  assert.equal(r.limpo, false);
  assert.match(r.motivo, /confirmando/);

  r = caca.passo({ agora: 3499, pos: pos, mobs: [], manaPct: 100, movendo: false });
  assert.equal(r.ativo, true);

  // Confirmou e já passou do mínimo de 1 s: sai.
  r = caca.passo({ agora: 3500, pos: pos, mobs: [], manaPct: 100, movendo: false });
  assert.equal(r.ativo, false);
  assert.equal(r.noPonto, true);
  assert.match(r.motivo, /limpo/);
});

test("não sai antes do tempo mínimo parado no ponto", () => {
  const caca = criarCaca({ config: config({ minParadoMs: 5000 }), aleatorio: () => 0 });
  caca.iniciar(0, { noPonto: true });
  // Fica limpo em 1,5 s, mas o mínimo é 5 s.
  let r = caca.passo({ agora: 1600, pos: pos, mobs: [], manaPct: 100, movendo: false });
  assert.equal(r.ativo, true);
  assert.match(r.motivo, /confirmando/);
  r = caca.passo({ agora: 4999, pos: pos, mobs: [], manaPct: 100, movendo: false });
  assert.equal(r.ativo, true);
  r = caca.passo({ agora: 5000, pos: pos, mobs: [], manaPct: 100, movendo: false });
  assert.equal(r.ativo, false);
});

test("sairComMobs permite sair com até N monstros no raio", () => {
  const caca = criarCaca({ config: config({ sairComMobs: 2 }), aleatorio: () => 0 });
  caca.iniciar(0, { noPonto: true });
  const dois = [{ x: 11, y: 10 }, { x: 9, y: 11 }];
  let r = caca.passo({ agora: 1000, pos: pos, mobs: dois, manaPct: 100, movendo: false });
  assert.equal(r.ativo, true);
  r = caca.passo({ agora: 2600, pos: pos, mobs: dois, manaPct: 100, movendo: false });
  assert.equal(r.ativo, false);
});

test("mana abaixo do mínimo segura mesmo com o raio limpo", () => {
  const caca = criarCaca({ config: config(), aleatorio: () => 0 });
  caca.iniciar(0, { noPonto: true });
  let r = caca.passo({ agora: 1000, pos: pos, mobs: [], manaPct: 10, movendo: false });
  assert.equal(r.ativo, true);
  assert.match(r.motivo, /mana/);
  // Subiu a mana: começa a confirmação agora.
  r = caca.passo({ agora: 2000, pos: pos, mobs: [], manaPct: 80, movendo: false });
  assert.equal(r.ativo, true);
  r = caca.passo({ agora: 3500, pos: pos, mobs: [], manaPct: 80, movendo: false });
  assert.equal(r.ativo, false);
});

test("teto de segurança sai mesmo sem limpar", () => {
  const caca = criarCaca({ config: config({ minParadoMs: 0, tetoMs: 10000 }), aleatorio: () => 0 });
  caca.iniciar(0, { noPonto: true });
  let r = caca.passo({ agora: 9999, pos: pos, mobs: [{ x: 10, y: 10 }], manaPct: 100, movendo: false });
  assert.equal(r.ativo, true);
  r = caca.passo({ agora: 10000, pos: pos, mobs: [{ x: 10, y: 10 }], manaPct: 100, movendo: false });
  assert.equal(r.ativo, false);
  assert.match(r.motivo, /teto/);
});

test("personagem andando não conta como limpo", () => {
  const caca = criarCaca({ config: config({ minParadoMs: 0 }), aleatorio: () => 0 });
  caca.iniciar(0, { noPonto: false });
  let r = caca.passo({ agora: 2000, pos: pos, mobs: [], manaPct: 100, movendo: true });
  assert.equal(r.ativo, true);
  assert.equal(r.limpo, false);
  // Parou: confirma 1,5 s e sai (espera de caminho ignora o mínimo).
  r = caca.passo({ agora: 3000, pos: pos, mobs: [], manaPct: 100, movendo: false });
  assert.equal(r.ativo, true);
  r = caca.passo({ agora: 4500, pos: pos, mobs: [], manaPct: 100, movendo: false });
  assert.equal(r.ativo, false);
  assert.equal(r.noPonto, false);
});
