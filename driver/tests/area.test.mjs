import test from "node:test";
import assert from "node:assert/strict";
import { pontuar, escolher, mantem, cobreTudo, naArea, criarArea, RAIO } from "../src/area.js";

test("conta os monstros no círculo de 5 sqm (raio 2,5) de cada candidato", () => {
  assert.equal(RAIO, 2.5);
  const monstros = [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 1, y: 0 },
    { id: 3, x: 2, y: 0 },
    { id: 4, x: 5, y: 0 },
  ];
  const pontos = pontuar({ x: 0, y: 0 }, monstros);
  // 1, 2 e 3 ficam dentro de 2,5 de si mesmos; 4 fica sozinho.
  assert.deepEqual(pontos.map((p) => p.id).sort(), [1, 4, 2, 3].sort());
  assert.equal(pontos.find((p) => p.id === 1).count, 3);
  assert.equal(pontos.find((p) => p.id === 2).count, 3);
  assert.equal(pontos.find((p) => p.id === 3).count, 3);
  assert.equal(pontos.find((p) => p.id === 4).count, 1);
  // Empate de contagem desempata pelo mais central (spread), igual ao desktop.
  assert.equal(pontos[0].id, 2);
});

test("a área é 3-5-5-5-3 (5x5 sem os cantos)", () => {
  const rows = new Array(5).fill(0);
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (naArea({ x: 0, y: 0 }, { x: dx, y: dy })) rows[dy + 2] += 1;
    }
  }
  assert.deepEqual(rows, [3, 5, 5, 5, 3]);
  assert.equal(naArea({ x: 0, y: 0 }, { x: 2, y: 2 }), false, "canto fora");
});

test("escolhe o alvo que cobre mais monstros (ganho de 2)", () => {
  const jogador = { x: 100, y: 100 };
  const monstros = [
    { id: 10, x: 100, y: 100 }, // alvo atual, sozinho
    { id: 20, x: 104, y: 100 },
    { id: 21, x: 105, y: 100 },
    { id: 22, x: 104, y: 101 },
  ];
  const escolha = escolher(jogador, monstros, 10);
  assert.equal(escolha.id, 20);
  assert.equal(escolha.count, 3);
});

test("não troca por apenas +1 monstro", () => {
  const jogador = { x: 100, y: 100 };
  const monstros = [
    { id: 10, x: 100, y: 100 },
    { id: 20, x: 104, y: 100 },
    { id: 21, x: 105, y: 100 },
  ];
  assert.equal(escolher(jogador, monstros, 10), null);
});

test("+1 troca quando o novo alvo pega TODOS da janela", () => {
  const jogador = { x: 100, y: 100 };
  const monstros = [
    { id: 1, x: 100, y: 100 },
    { id: 2, x: 102, y: 100 },
    { id: 3, x: 104, y: 100 },
  ];
  assert.equal(cobreTudo(jogador, monstros, 1), false, "o atual deixa o 3 de fora");
  assert.equal(cobreTudo(jogador, monstros, 2), true, "o 2 pega os três");
  const escolha = escolher(jogador, monstros, 1);
  assert.equal(escolha.id, 2, "+1 troca quando pega todos");
  assert.equal(escolha.count, 3);
});

test("só considera alvo dentro da janela 7x5 do jogo", () => {
  const jogador = { x: 100, y: 100 };
  const perto = { id: 10, x: 100, y: 100 };
  const longe = { id: 20, x: 108, y: 100 };
  assert.equal(mantem(jogador, [perto], 10), true);
  assert.equal(mantem(jogador, [longe], 20), false);
  assert.equal(mantem({ x: 100, y: 100 }, [{ id: 30, x: 107, y: 105 }], 30), true);
  assert.equal(mantem({ x: 100, y: 100 }, [{ id: 31, x: 107, y: 106 }], 31), false);
});

test("sem alvo atual escolhe o melhor imediatamente", () => {
  const jogador = { x: 0, y: 0 };
  const monstros = [
    { id: 1, x: 1, y: 0 },
    { id: 2, x: 5, y: 0 },
    { id: 3, x: 6, y: 0 },
    { id: 4, x: 5, y: 1 },
  ];
  const escolha = escolher(jogador, monstros, null);
  assert.equal(escolha.id, 2);
  assert.equal(escolha.count, 3);
});

test("alvo atual desconhecido espera (como o desktop)", () => {
  const jogador = { x: 0, y: 0 };
  const monstros = [
    { id: 1, x: 1, y: 0 },
    { id: 2, x: 5, y: 0 },
    { id: 3, x: 6, y: 0 },
  ];
  assert.equal(escolher(jogador, monstros, 999), null, "id sumiu da lista: espera");
});

test("segura o alvo por 3 s antes de reavaliar (+2 comum)", () => {
  const jogador = { x: 0, y: 0 };
  const area = criarArea();
  const inicio = [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 1, y: 0 },
  ];
  const troca = area.passo(jogador, inicio, null, 1000);
  assert.equal(troca.id, 1);
  // Grupo +3, mas nenhum candidato pega o 1 (ficaria fora da área de todos).
  const melhor = [
    { id: 1, x: 0, y: 0 },
    { id: 3, x: 5, y: 0 },
    { id: 4, x: 6, y: 0 },
    { id: 5, x: 6, y: 1 },
    { id: 6, x: 5, y: 1 },
  ];
  assert.equal(area.passo(jogador, melhor, 1, 2000), null, "ainda segurando");
  const depois = area.passo(jogador, melhor, 1, 4001);
  assert.notEqual(depois, null, "depois de 3 s aceita a troca");
  assert.equal(depois.count, 4);
});

test("pega todos fura a trava de 3 s (igual ao desktop)", () => {
  const jogador = { x: 0, y: 0 };
  const area = criarArea();
  // Começa no alvo 1, que deixa o 3 de fora.
  assert.equal(area.passo(jogador, [{ id: 1, x: 0, y: 0 }], null, 1000).id, 1);
  // O alvo 2 pega TODOS os monstros da janela: troca já, mesmo dentro dos 3 s.
  const todos = [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 2, y: 0 },
    { id: 3, x: 4, y: 0 },
  ];
  assert.equal(area.passo(jogador, todos, 1, 2000).id, 2);
});

test("alvo atual sumiu (null) troca na hora, mesmo segurando", () => {
  const jogador = { x: 0, y: 0 };
  const area = criarArea();
  const inicio = [
    { id: 2, x: 2, y: 0 },
    { id: 3, x: 3, y: 0 },
  ];
  area.passo(jogador, inicio, null, 1000);
  const novos = [
    { id: 9, x: 5, y: 0 },
    { id: 10, x: 5, y: 1 },
    { id: 11, x: 6, y: 0 },
  ];
  // O cliente devolveu `objetivo` nulo (o monstro morreu): escolhe já.
  const troca = area.passo(jogador, novos, null, 1200);
  assert.equal(troca.id, 9);
});
