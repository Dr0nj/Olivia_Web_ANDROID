import test from "node:test";
import assert from "node:assert/strict";
import { criarRota } from "../src/rota.js";

test("rota recusa lista vazia e ponto inválido", () => {
  const rota = criarRota();
  assert.throws(() => rota.carregar([]));
  assert.throws(() => rota.carregar([{ x: "a", y: 2 }]));
});

test("rota avança ao chegar e conclui no último ponto", () => {
  const rota = criarRota();
  assert.equal(rota.carregar([[10, 10], [11, 10]]), 2);
  assert.equal(rota.iniciar(0), true);

  assert.deepEqual(
    rota.passo({ pos: { x: 9, y: 10 }, agora: 0 }),
    { acao: "ir", x: 10, y: 10, indice: 0 }
  );
  const avancar = rota.passo({ pos: { x: 10, y: 10 }, agora: 100 });
  assert.equal(avancar.acao, "avancar");
  assert.equal(avancar.indice, 1);
  assert.deepEqual(rota.passo({ pos: { x: 11, y: 10 }, agora: 200 }), { acao: "concluir", total: 2, voltas: 1 });
  assert.equal(rota.situacao(), "concluida");
  assert.equal(rota.passo({ pos: { x: 11, y: 10 }, agora: 300 }), null);
});

test("rota começa pelo waypoint mais próximo da posição", () => {
  const rota = criarRota();
  rota.carregar([[0, 0], [10, 0], [20, 0]]);
  rota.iniciar(0, { x: 19, y: 0, z: 0 });
  assert.equal(rota.indice(), 2);
  assert.deepEqual(rota.passo({ pos: { x: 19, y: 0 }, agora: 10 }), { acao: "ir", x: 20, y: 0, indice: 2 });
});

test("chegada perto conta só depois de ficar parado", () => {
  const rota = criarRota({ raioChegada: 1, settleMs: 600 });
  rota.carregar([[10, 10]]);
  rota.iniciar(0);

  assert.equal(rota.passo({ pos: { x: 9, y: 10 }, agora: 0 }).acao, "ir");
  assert.equal(rota.passo({ pos: { x: 9, y: 10 }, agora: 300 }).acao, "ir");
  const perto = rota.passo({ pos: { x: 9, y: 10 }, agora: 700 });
  assert.equal(perto.acao, "concluir");
});

test("pula o ponto travado depois de N tentativas e vai para o próximo", () => {
  const rota = criarRota({ pularApos: 2, timeoutMs: 2500 });
  rota.carregar([[5, 5], [15, 5]]);
  rota.iniciar(0);

  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 0 }).acao, "ir");
  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 3000 }).acao, "repetir");
  const pulou = rota.passo({ pos: { x: 0, y: 0 }, agora: 6000 });
  assert.equal(pulou.acao, "pular");
  assert.equal(pulou.indice, 1);
  assert.equal(pulou.restantes, 1);
  assert.equal(rota.indice(), 1);
  assert.deepEqual(rota.passo({ pos: { x: 0, y: 0 }, agora: 6100 }), { acao: "ir", x: 15, y: 5, indice: 1 });
});

test("sem caminho espera e tenta de novo; desiste no limite", () => {
  const rota = criarRota({ pularApos: 1, timeoutMs: 2500, esperaMs: 1000, esperasMax: 2 });
  rota.carregar([[5, 5]]);
  rota.iniciar(0);

  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 0 }).acao, "ir");
  const sem = rota.passo({ pos: { x: 0, y: 0 }, agora: 3000 });
  assert.equal(sem.acao, "sem_caminho");
  assert.equal(sem.esperas, 1);
  assert.equal(rota.situacao(), "esperando");

  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 3500 }).acao, "esperar");
  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 4100 }).motivo, "recomeco");
  assert.equal(rota.situacao(), "andando");

  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 7000 }).acao, "sem_caminho");
  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 8100 }).motivo, "recomeco");
  const fim = rota.passo({ pos: { x: 0, y: 0 }, agora: 11000 });
  assert.equal(fim.acao, "desistir");
  assert.equal(fim.motivo, "sem_caminho");
  assert.equal(rota.situacao(), "desistiu");
});

test("rota sem posição espera sem contar timeout", () => {
  const rota = criarRota({ timeoutMs: 100 });
  rota.carregar([[1, 1]]);
  rota.iniciar(0);
  assert.deepEqual(rota.passo({ pos: null, agora: 9999 }), { acao: "esperar", motivo: "sem-posicao" });
  assert.equal(rota.situacao(), "andando");
});

test("rota fechada repete a volta em vez de concluir", () => {
  const rota = criarRota({ repetir: true });
  rota.carregar([[1, 1], [2, 1]]);
  rota.iniciar(0);

  rota.passo({ pos: { x: 1, y: 1 }, agora: 100 });
  const d = rota.passo({ pos: { x: 2, y: 1 }, agora: 200 });
  assert.deepEqual(d, { acao: "volta", volta: 1, total: 2 });
  assert.equal(rota.situacao(), "andando");
  assert.equal(rota.indice(), 0);
  assert.equal(rota.volta(), 1);

  assert.deepEqual(rota.passo({ pos: { x: 2, y: 1 }, agora: 300 }), { acao: "ir", x: 1, y: 1, indice: 0 });
});

test("rota repetida respeita voltasMax", () => {
  const rota = criarRota({ repetir: true, voltasMax: 2 });
  rota.carregar([[1, 1]]);
  rota.iniciar(0);

  assert.deepEqual(rota.passo({ pos: { x: 1, y: 1 }, agora: 10 }), { acao: "volta", volta: 1, total: 1 });
  const d = rota.passo({ pos: { x: 1, y: 1 }, agora: 20 });
  assert.equal(d.acao, "concluir");
  assert.equal(d.voltas, 2);
  assert.equal(rota.situacao(), "concluida");
});

test("perna longa ganha prazo proporcional à distância", () => {
  const rota = criarRota({ timeoutMs: 1000, msPorTile: 300 });
  rota.carregar([[30, 30]]);
  rota.iniciar(0);
  rota.passo({ pos: { x: 0, y: 0 }, agora: 0 });
  assert.equal(rota.passo({ pos: { x: 15, y: 15 }, agora: 5000 }).acao, "ir");
  // Sem progresso desde 5000: 15 tiles * 300 ms = 4500 ms de prazo.
  assert.equal(rota.passo({ pos: { x: 15, y: 15 }, agora: 9600 }).acao, "repetir");
});

test("perna longa tem teto de prazo", () => {
  const rota = criarRota({ timeoutMs: 1000, msPorTile: 300, timeoutMaxMs: 4000 });
  rota.carregar([[200, 200]]);
  rota.iniciar(0);
  rota.passo({ pos: { x: 0, y: 0 }, agora: 0 });
  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 4100 }).acao, "repetir");
});

test("volta concluída limpa os pontos pulados", () => {
  const rota = criarRota({ repetir: true, pularApos: 1 });
  rota.carregar([[5, 5], [6, 5]]);
  rota.iniciar(0);
  rota.passo({ pos: { x: 0, y: 0 }, agora: 0 });
  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 3000 }).acao, "pular");
  assert.deepEqual(rota.pulados(), [0]);
  assert.equal(rota.passo({ pos: { x: 6, y: 5 }, agora: 3100 }).acao, "volta");
  assert.deepEqual(rota.pulados(), []);
});

test("progresso renova o prazo da perna", () => {
  const rota = criarRota({ timeoutMs: 2500, msPorTile: 350 });
  rota.carregar([[30, 0]]);
  rota.iniciar(0);
  rota.passo({ pos: { x: 0, y: 0 }, agora: 0 });

  // Anda 2 tiles a cada 2 s: nunca pode contar como travamento.
  for (let i = 1; i <= 6; i += 1) {
    const d = rota.passo({ pos: { x: i * 2, y: 0 }, agora: i * 2000 });
    assert.notEqual(d.acao, "repetir", "renovou errado no passo " + i);
    assert.notEqual(d.acao, "pular");
  }
});

test("atraso exato espera depois de cada waypoint", () => {
  const rota = criarRota();
  rota.definirAtraso({ modo: "exato", ms: 1000 });
  rota.carregar([[1, 1], [2, 1]]);
  rota.iniciar(0);

  assert.equal(rota.passo({ pos: { x: 1, y: 1 }, agora: 100 }).acao, "avancar");
  assert.deepEqual(rota.passo({ pos: { x: 1, y: 1 }, agora: 500 }), { acao: "esperar", motivo: "pausa" });
  const d = rota.passo({ pos: { x: 1, y: 1 }, agora: 1200 });
  assert.equal(d.acao, "ir");
  assert.equal(d.x, 2);
});

test("atraso aleatório usa o intervalo configurado", () => {
  const rota = criarRota({ aleatorio: () => 0.5 });
  rota.definirAtraso({ modo: "aleatorio", minMs: 1000, maxMs: 3000 });
  rota.carregar([[1, 1], [2, 1]]);
  rota.iniciar(0);

  rota.passo({ pos: { x: 1, y: 1 }, agora: 1000 });
  assert.deepEqual(rota.passo({ pos: { x: 1, y: 1 }, agora: 2500 }), { acao: "esperar", motivo: "pausa" });
  assert.equal(rota.passo({ pos: { x: 1, y: 1 }, agora: 3100 }).acao, "ir");
});

test("pausaMs do ponto vence o atraso global", () => {
  const rota = criarRota();
  rota.definirAtraso({ modo: "exato", ms: 5000 });
  rota.carregar([{ x: 1, y: 1, pausaMs: 1000 }]);
  rota.iniciar(0);

  rota.passo({ pos: { x: 1, y: 1 }, agora: 0 });
  assert.deepEqual(rota.passo({ pos: { x: 1, y: 1 }, agora: 900 }), { acao: "esperar", motivo: "pausa" });
  assert.equal(rota.passo({ pos: { x: 1, y: 1 }, agora: 1100 }).acao, "concluir");
});

test("atraso desligado não espera", () => {
  const rota = criarRota();
  rota.definirAtraso({ modo: "off" });
  rota.carregar([[1, 1], [2, 1]]);
  rota.iniciar(0);
  rota.passo({ pos: { x: 1, y: 1 }, agora: 100 });
  assert.equal(rota.passo({ pos: { x: 1, y: 1 }, agora: 200 }).acao, "ir");
});

test("posicionar retoma a rota de um índice", () => {
  const rota = criarRota();
  rota.carregar([[1, 1], [2, 2], [3, 3]]);
  rota.iniciar(0);
  assert.equal(rota.posicionar(2), true);
  assert.equal(rota.indice(), 2);
  assert.deepEqual(rota.alvo(), { x: 3, y: 3 });
  assert.equal(rota.passo({ pos: { x: 9, y: 9 }, agora: 100 }).x, 3);
});

function cacaConfig(extra) {
  return Object.assign({
    raioLimpo: 2,
    minParadoMs: 1000,
    tetoMs: 30000,
    manaMinPct: 30,
    sairComMobs: 0,
    tremMobs: 0,
  }, extra || {});
}

test("rota lê o ponto de caça em objeto e em lista compacta", () => {
  const rota = criarRota();
  rota.carregar([[1, 1], [2, 1, "h"], { x: 3, y: 1, hunt: true }]);
  assert.deepEqual(rota.pontos().map((p) => p.hunt), [false, true, true]);
});

test("só entra no ponto de caça pisando no sqm exato e segura até limpar", () => {
  const rota = criarRota({ caca: cacaConfig(), aleatorio: () => 0 });
  rota.carregar([{ x: 10, y: 10, hunt: true }, [12, 10]]);
  rota.iniciar(0, { x: 9, y: 10 });

  // A chegada por raio não vale para ponto de caça.
  assert.equal(rota.passo({ pos: { x: 9, y: 10 }, agora: 0 }).acao, "ir");
  assert.equal(rota.passo({ pos: { x: 9, y: 10 }, agora: 700 }).acao, "ir");

  const entrou = rota.passo({ pos: { x: 10, y: 10 }, agora: 800, mobs: [], manaPct: 100 });
  assert.equal(entrou.acao, "cacar");
  assert.equal(entrou.emPonto, true);
  assert.equal(rota.situacao(), "cacando");

  // O primeiro tick ainda vê a mudança de sqm como "andando".
  assert.equal(rota.passo({ pos: { x: 10, y: 10 }, agora: 900, mobs: [], manaPct: 100 }).acao, "cacar");
  assert.equal(rota.passo({ pos: { x: 10, y: 10 }, agora: 1400, mobs: [], manaPct: 100 }).acao, "cacar");
  // 1,5 s depois de parado (1400) e já passou do mínimo (1 s): sai e avança.
  const saiu = rota.passo({ pos: { x: 10, y: 10 }, agora: 2900, mobs: [], manaPct: 100 });
  assert.equal(saiu.acao, "avancar");
  assert.equal(saiu.fimCaca, true);
  assert.equal(rota.indice(), 1);
  assert.equal(rota.situacao(), "andando");
});

test("ponto de caça com monstro espera o teto de segurança", () => {
  const rota = criarRota({
    caca: cacaConfig({ minParadoMs: 0, tetoMs: 10000 }),
    aleatorio: () => 0,
  });
  rota.carregar([{ x: 10, y: 10, hunt: true }]);
  rota.iniciar(0, { x: 10, y: 10 });
  rota.passo({ pos: { x: 10, y: 10 }, agora: 0, mobs: [{ x: 10, y: 10 }], manaPct: 100 });
  const teto = rota.passo({ pos: { x: 10, y: 10 }, agora: 10000, mobs: [{ x: 10, y: 10 }], manaPct: 100 });
  assert.equal(teto.acao, "concluir");
  assert.equal(teto.fimCaca, true);
  assert.match(teto.cacaMotivo, /teto/);
});

test("preso com trem entra em caça no lugar sem pular o waypoint", () => {
  const rota = criarRota({
    caca: cacaConfig({ tremMobs: 3 }),
    aleatorio: () => 0,
    timeoutMs: 60000,
    timeoutMaxMs: 60000,
  });
  rota.carregar([[20, 0]]);
  rota.iniciar(0, { x: 0, y: 0 });

  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 0 }).acao, "ir");
  const preso = rota.passo({
    pos: { x: 0, y: 0 },
    agora: 1600,
    mobs: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
    manaPct: 100,
  });
  assert.equal(preso.acao, "cacar");
  assert.equal(preso.emPonto, false);
  assert.equal(rota.indice(), 0, "não pode pular o waypoint");

  rota.passo({ pos: { x: 0, y: 0 }, agora: 1700, mobs: [], manaPct: 100 });
  const soltou = rota.passo({ pos: { x: 0, y: 0 }, agora: 3200, mobs: [], manaPct: 100 });
  assert.equal(soltou.acao, "caca_fim");
  // Continua indo para o MESMO waypoint.
  assert.equal(rota.passo({ pos: { x: 0, y: 0 }, agora: 3300, mobs: [], manaPct: 100 }).x, 20);
});

test("trecho saindo de ponto de caça espera caminho em vez de pular", () => {
  const rota = criarRota({
    caca: cacaConfig({ minParadoMs: 0 }),
    aleatorio: () => 0,
    pularApos: 2,
    timeoutMs: 1000,
    timeoutMaxMs: 1000,
  });
  rota.carregar([{ x: 10, y: 10, hunt: true }, [20, 10]]);
  rota.iniciar(0, { x: 10, y: 10 });

  // Limpa e sai do ponto de caça já mirando o próximo.
  rota.passo({ pos: { x: 10, y: 10 }, agora: 0, mobs: [], manaPct: 100 });
  rota.passo({ pos: { x: 10, y: 10 }, agora: 100, mobs: [], manaPct: 100 });
  const saiu = rota.passo({ pos: { x: 10, y: 10 }, agora: 1600, mobs: [], manaPct: 100 });
  assert.equal(saiu.acao, "avancar");
  assert.equal(rota.indice(), 1);

  // Sem progresso: repete uma vez e depois espera (caça no lugar), sem pular.
  assert.equal(rota.passo({ pos: { x: 10, y: 10 }, agora: 1700, mobs: [], manaPct: 100 }).acao, "ir");
  assert.equal(rota.passo({ pos: { x: 10, y: 10 }, agora: 2800, mobs: [], manaPct: 100 }).acao, "repetir");
  const espera = rota.passo({ pos: { x: 10, y: 10 }, agora: 3900, mobs: [], manaPct: 100 });
  assert.equal(espera.acao, "cacar");
  assert.equal(espera.emPonto, false);
  assert.equal(rota.indice(), 1);
});
