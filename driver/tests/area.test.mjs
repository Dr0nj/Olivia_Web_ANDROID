import test from "node:test";
import assert from "node:assert/strict";
import { pontuar, escolher, mantem, criarArea, RAIO } from "../src/area.js";

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
  // Empate de contagem desempata pela distância ao personagem.
  assert.equal(pontos[0].id, 1);
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

test("segura o alvo por 3 s antes de reavaliar", () => {
  const jogador = { x: 0, y: 0 };
  const primeiro = [
    { id: 2, x: 2, y: 0 },
    { id: 3, x: 3, y: 0 },
  ];
  const area = criarArea();
  const troca = area.passo(jogador, primeiro, null, 1000);
  assert.equal(troca.id, 2);
  // Um alvo muito melhor aparece, mas ainda estamos segurando.
  const melhor = [
    { id: 9, x: 4, y: 0 },
    { id: 10, x: 5, y: 0 },
    { id: 11, x: 5, y: 1 },
    { id: 12, x: 5, y: -1 },
    { id: 13, x: 6, y: 0 },
    { id: 14, x: 6, y: 1 },
  ];
  assert.equal(area.passo(jogador, melhor, 2, 2000), null);
  // Depois dos 3 s, aceita a troca.
  const depois = area.passo(jogador, melhor, 2, 4001);
  assert.equal(depois.id, 9);
});

test("alvo atual sumiu troca na hora, mesmo segurando", () => {
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
