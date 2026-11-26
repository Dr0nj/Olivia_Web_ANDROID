import test from "node:test";
import assert from "node:assert/strict";
import { criarMotor } from "../src/motor.js";

function cenario(inicial) {
  let pos = Object.assign({}, inicial);
  let agora = 0;
  let alvo = null;
  const enviados = [];
  const ponte = {
    enviados,
    estado: () => ({
      emJogo: true,
      vivo: true,
      nome: "Teste",
      pos: Object.assign({}, pos),
      xp: 0,
      vida: 100,
    }),
    enviar: (m) => { enviados.push(m); return true; },
    entidade: () => alvo,
  };
  const motor = criarMotor({ ponte, agora: () => agora });
  return {
    motor,
    enviados,
    mover(x, y) { pos = { x, y, z: 0 }; },
    passar(ms) { agora += ms; },
    definirAlvo(a) { alvo = a; },
  };
}

test("perna longa é dividida em trechos de 6 tiles", () => {
  const c = cenario({ x: 10, y: 10, z: 0 });
  c.motor.iniciarRota([[10, 30]], "teste");

  c.motor.tick();
  assert.deepEqual(c.enviados.at(-1), { t: "ir", x: 10, y: 16 });

  c.mover(10, 16);
  c.passar(1000);
  c.motor.tick();
  assert.deepEqual(c.enviados.at(-1), { t: "ir", x: 10, y: 22 });

  // Andando 1 tile de cada vez, não manda `ir` novo até alcançar o trecho.
  const antes = c.enviados.length;
  c.mover(10, 17);
  c.passar(1000);
  c.motor.tick();
  c.mover(10, 18);
  c.passar(1000);
  c.motor.tick();
  assert.equal(c.enviados.length, antes, "mandou ir a cada tile");

  c.mover(10, 22);
  c.passar(1000);
  c.motor.tick();
  assert.deepEqual(c.enviados.at(-1), { t: "ir", x: 10, y: 28 });

  c.mover(10, 30);
  c.passar(1000);
  c.motor.tick();
  assert.equal(c.motor.modo(), "parada");
  assert.equal(c.motor.sessao.snapshot().pontos, 1);
});

test("não repete o mesmo ir enquanto o personagem anda", () => {
  const c = cenario({ x: 0, y: 0, z: 0 });
  c.motor.iniciarRota([[0, 5]], "teste");

  c.motor.tick();
  const quantos = c.enviados.filter((m) => m.t === "ir").length;
  assert.equal(quantos, 1);

  for (let i = 1; i <= 2; i += 1) {
    c.passar(1000);
    c.motor.tick();
  }

  assert.equal(c.enviados.filter((m) => m.t === "ir").length, 1, "repetiu o mesmo destino");
});

test("seguidor também anda em trechos curtos", () => {
  const c = cenario({ x: 0, y: 0, z: 0 });
  c.definirAlvo({ x: 0, y: 20, nome: "Alvo", id: 7 });
  c.motor.seguir(7);

  c.motor.tick();
  const primeiro = c.enviados.at(-1);
  assert.equal(primeiro.t, "ir");
  assert.equal(primeiro.y, 6);
  assert.equal(primeiro.x, 0);
});

test("pausa humana não interrompe o seguir", () => {
  const c = cenario({ x: 0, y: 0, z: 0 });
  c.definirAlvo({ x: 0, y: 20, nome: "Alvo", id: 7 });
  c.motor.humano.devePausar = () => 20000;
  c.motor.seguir(7);
  c.motor.tick();
  assert.ok(c.enviados.some((m) => m.t === "ir"), "pausou o seguidor");
});
