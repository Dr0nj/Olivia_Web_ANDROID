import test from "node:test";
import assert from "node:assert/strict";
import { criarMotor } from "../src/motor.js";

function cenario(inicial, opcoes) {
  let pos = Object.assign({}, inicial);
  let agora = 0;
  let alvo = null;
  const enviados = [];
  const eventos = [];
  const cfg = opcoes || {};
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
  if (cfg.caminavel) ponte.caminavel = cfg.caminavel;
  const motor = criarMotor({
    ponte,
    agora: () => agora,
    log: { evento: (nome, dados) => eventos.push(Object.assign({ nome }, dados || {})) },
  });
  return {
    motor,
    enviados,
    eventos,
    mover(x, y, z) { pos = { x, y, z: z == null ? pos.z : z }; },
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

test("rota começa pelo waypoint mais próximo", () => {
  const c = cenario({ x: 19, y: 0, z: 0 });
  c.motor.iniciarRota([[0, 0], [20, 0]], "teste");
  assert.equal(c.motor.rota.indice(), 1, "não escolheu o ponto mais próximo");

  c.motor.tick();
  const ir = c.enviados.find((m) => m.t === "ir");
  assert.equal(ir.x, 20);
  assert.equal(ir.y, 0);
});

test("ponto não andável é pulado e segue o próximo", () => {
  const c = cenario({ x: 0, y: 0, z: 0 }, {
    caminavel: (x, y) => !(x === 0 && y === 5),
  });
  c.motor.iniciarRota([[0, 5], [0, 6]], "teste");

  c.motor.tick();
  assert.ok(c.eventos.some((e) => e.nome === "rota_ponto_invalido"), "não registrou o ponto inválido");
  assert.equal(c.motor.rota.indice(), 1);

  c.motor.tick();
  const ir = c.enviados.find((m) => m.t === "ir");
  assert.equal(ir.y, 6);
});

test("mudança de piso no meio da rota para o laço", () => {
  const c = cenario({ x: 0, y: 0, z: 0 });
  c.motor.iniciarRota([[0, 8]], "teste");
  c.motor.tick();

  c.mover(0, 0, 1);
  c.motor.tick();

  assert.equal(c.motor.modo(), "parada");
  assert.ok(c.eventos.some((e) => e.nome === "rota_piso_mudou"), "não registrou a troca de piso");
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
