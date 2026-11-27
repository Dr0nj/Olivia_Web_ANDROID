import test from "node:test";
import assert from "node:assert/strict";
import {
  DISTANCIA_ONDA,
  contarAcertos,
  decidirLado,
  faceDoLado,
  ladoAtras,
  ladoMaisPerto,
  melhorLado,
  ondaAcerta,
  vaga,
} from "../src/onda.js";

test("onda 1,1,3,3,3: 5 de alcance, 3 de largura no fim", () => {
  // Virado para cima: 1,1 retos e depois 3,3,3.
  assert.equal(ondaAcerta(0, 0, 1, 0, -1), true);
  assert.equal(ondaAcerta(0, 0, 1, 0, -2), true);
  assert.equal(ondaAcerta(0, 0, 1, 0, -3), true);
  assert.equal(ondaAcerta(0, 0, 1, 1, -3), true);
  assert.equal(ondaAcerta(0, 0, 1, -1, -5), true);
  assert.equal(ondaAcerta(0, 0, 1, 2, -3), false);
  assert.equal(ondaAcerta(0, 0, 1, 2, -2), false);
  assert.equal(ondaAcerta(0, 0, 1, 0, 1), false);
  assert.equal(ondaAcerta(0, 0, 1, 0, -6), false);
});

test("onda usa a direção do cliente web (0 baixo, 1 cima, 2 esquerda, 3 direita)", () => {
  assert.equal(ondaAcerta(0, 0, 0, 0, 1), true);
  assert.equal(ondaAcerta(0, 0, 1, 0, -1), true);
  assert.equal(ondaAcerta(0, 0, 2, -1, 0), true);
  assert.equal(ondaAcerta(0, 0, 3, 1, 0), true);
  assert.equal(ondaAcerta(0, 0, 3, 5, 0), true);
  assert.equal(ondaAcerta(0, 0, 3, 5, 1), true);
  assert.equal(ondaAcerta(0, 0, 3, 5, 2), false);
});

test("vaga a 4 sqm põe o alvo no centro do 3x3", () => {
  assert.equal(DISTANCIA_ONDA, 4);
  assert.deepEqual(vaga({ x: 10, y: 10 }, 0, DISTANCIA_ONDA), { x: 14, y: 10 });
  assert.deepEqual(vaga({ x: 10, y: 10 }, 1, DISTANCIA_ONDA), { x: 6, y: 10 });
  assert.deepEqual(vaga({ x: 10, y: 10 }, 2, DISTANCIA_ONDA), { x: 10, y: 14 });
  assert.deepEqual(vaga({ x: 10, y: 10 }, 3, DISTANCIA_ONDA), { x: 10, y: 6 });
  assert.equal(faceDoLado(0), 2);
  assert.equal(faceDoLado(1), 3);
  assert.equal(faceDoLado(2), 1);
  assert.equal(faceDoLado(3), 0);
});

test("conta monstros no feixe, inclusive o miolo em volta do knight", () => {
  const alvo = { x: 10, y: 10 };
  const casa = vaga(alvo, 1, DISTANCIA_ONDA);
  assert.deepEqual(casa, { x: 6, y: 10 });
  const mobs = [
    { x: 9, y: 9 }, { x: 10, y: 10 }, { x: 11, y: 11 },
    { x: 11, y: 10 }, { x: 11, y: 12 }, { x: 12, y: 10 },
  ];
  assert.equal(contarAcertos(casa, faceDoLado(1), mobs), 4);
});

test("lado de trás acompanha a última direção do alvo", () => {
  assert.equal(ladoAtras(1, 0), 1);
  assert.equal(ladoAtras(-1, 0), 0);
  assert.equal(ladoAtras(0, 1), 3);
  assert.equal(ladoAtras(0, -1), 2);
  assert.equal(ladoAtras(1, 1), 1);
  assert.equal(ladoAtras(-1, 1), 0);
  assert.equal(ladoAtras(0, 0), -1);
});

test("melhor lado prioriza a vaga de trás e só troca com 2 monstros a mais", () => {
  const alvo = { x: 10, y: 10 };
  const anel = [
    { x: 9, y: 9 }, { x: 9, y: 10 }, { x: 9, y: 11 },
    { x: 10, y: 9 }, { x: 10, y: 11 },
    { x: 11, y: 9 }, { x: 11, y: 10 }, { x: 11, y: 11 },
  ];
  // O anel 3x3 é o mesmo para qualquer lado; atrás ganha por ser a vaga de trás.
  assert.equal(melhorLado(alvo, { x: 6, y: 10 }, anel, 1, null, DISTANCIA_ONDA), 1);

  // Dois monstros no "cabo" do lado leste: aí vale sair de trás.
  const cabo = [{ x: 12, y: 10 }, { x: 13, y: 10 }];
  assert.equal(melhorLado(alvo, { x: 6, y: 10 }, cabo, 1, null, DISTANCIA_ONDA), 0);

  // Um só monstro no cabo não paga a troca.
  assert.equal(melhorLado(alvo, { x: 6, y: 10 }, [{ x: 12, y: 10 }], 1, null, DISTANCIA_ONDA), 1);
});

test("histerese: fica no lado atual sem vantagem de 2", () => {
  const alvo = { x: 10, y: 10 };
  const umNoCabo = [{ x: 10, y: 10 }, { x: 12, y: 10 }];
  assert.equal(decidirLado({
    alvo: alvo,
    pos: { x: 6, y: 10 },
    monstros: umNoCabo,
    ladoAtual: 1,
    preferido: -1,
    distancia: DISTANCIA_ONDA,
  }), 1);

  const doisNoCabo = [{ x: 10, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 }];
  assert.equal(decidirLado({
    alvo: alvo,
    pos: { x: 6, y: 10 },
    monstros: doisNoCabo,
    ladoAtual: 1,
    preferido: -1,
    distancia: DISTANCIA_ONDA,
  }), 0);
});

test("sem monstros a vaga de trás vence; sem direção, a mais perto", () => {
  const alvo = { x: 10, y: 10 };
  assert.equal(ladoMaisPerto(alvo, { x: 0, y: 10 }, DISTANCIA_ONDA, null), 1);
  assert.equal(melhorLado(alvo, { x: 0, y: 10 }, [], 2, null, DISTANCIA_ONDA), 2);
  assert.equal(melhorLado(alvo, { x: 0, y: 10 }, [], -1, null, DISTANCIA_ONDA), 1);
});

test("vaga bloqueada pelo mapa é descartada", () => {
  const alvo = { x: 10, y: 10 };
  const caminavel = (x, y) => !(x === 6 && y === 10);
  assert.equal(ladoMaisPerto(alvo, { x: 0, y: 10 }, DISTANCIA_ONDA, caminavel), 0);
  assert.equal(melhorLado(alvo, { x: 0, y: 10 }, [], 1, caminavel, DISTANCIA_ONDA), 0);
});
