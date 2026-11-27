import test from "node:test";
import assert from "node:assert/strict";
import { escolherRetarget, RETARGET_SQM_PADRAO } from "../src/retarget.js";

test("não troca enquanto o alvo está dentro do limite", () => {
  const alvo = { id: 1, x: 5, y: 5 };
  assert.equal(escolherRetarget({ x: 0, y: 0 }, alvo, [{ id: 2, x: 1, y: 0 }], 5), null);
  assert.equal(RETARGET_SQM_PADRAO, 6);
});

test("troca por um monstro mais próximo quando o alvo passou do limite", () => {
  const escolha = escolherRetarget(
    { x: 0, y: 0 },
    { id: 1, x: 8, y: 0 },
    [
      { id: 1, x: 8, y: 0 },
      { id: 2, x: 3, y: 2 },
      { id: 3, x: 4, y: 1 },
    ],
    5
  );
  assert.equal(escolha.id, 2);
  assert.equal(escolha.distancia, 3);
  assert.equal(escolha.antes, 8);
});

test("não troca se o mais próximo não é mais perto que o atual", () => {
  assert.equal(
    escolherRetarget({ x: 0, y: 0 }, { id: 1, x: 6, y: 0 }, [{ id: 2, x: 6, y: 1 }], 5),
    null
  );
});

test("ignora o próprio alvo e dados inválidos", () => {
  assert.equal(
    escolherRetarget({ x: 0, y: 0 }, { id: 1, x: 8, y: 0 }, [{ id: 1, x: 0, y: 0 }], 5),
    null
  );
  assert.equal(escolherRetarget(null, null, [], 5), null);
});
