// Teste de integração do bundle publicado (dist/olivia-web.user.js) contra um
// cliente LOW falso: monta o painel, responde o desafio e executa uma rota.
// Também garante que nada de `Red`, `WebSocket`, `JSON` ou `addEventListener` foi embrulhado.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
execFileSync(process.execPath, [join(raiz, "tools", "build.mjs")], { stdio: "ignore" });
const bundle = readFileSync(join(raiz, "dist", "olivia-web.user.js"), "utf8");

const intervalos = [];
afterEach(() => {
  while (intervalos.length) {
    const id = intervalos.pop();
    clearInterval(id.id || id);
  }
});

function elemento(tag) {
  return {
    tag,
    style: {},
    dataset: {},
    filhos: [],
    textContent: "",
    value: "",
    checked: false,
    appendChild(f) { this.filhos.push(f); return f; },
    addEventListener() {},
    remove() {},
  };
}

function cenario(opcoes) {
  const cfg = opcoes || {};
  const enviados = [];
  const assinantes = new Map();

  const Red = {
    enviar(msg) { enviados.push(msg); return true; },
    al(tipo, fn) {
      assinantes.set(tipo, (assinantes.get(tipo) || []).concat(fn));
      return true;
    },
    emitir(tipo, msg) {
      (assinantes.get(tipo) || []).forEach((fn) => fn(msg));
    },
  };
  const J = {
    enJuego: true,
    yo: { nome: "Teste", x: 10, y: 10, exp: 1000, vida: 100, mana: 50, piso: 1 },
    ents: new Map(),
  };
  const Hud = {
    inv: cfg.inv || { mochila: [], botin: [], oro: 0 },
    datos: { objetos: {} },
    yo: null,
  };
  const EresBot = { m: null, tocar(k) { enviados.push({ eresbot: k }); } };

  const janela = {
    Red,
    J,
    Hud,
    EresBot,
    localStorage: cfg.localStorage || {
      dados: {},
      getItem(k) { return k in this.dados ? this.dados[k] : null; },
      setItem(k, v) { this.dados[k] = String(v); },
      removeItem(k) { delete this.dados[k]; },
    },
  };

  const documento = {
    documentElement: { dataset: {} },
    body: elemento("body"),
    hidden: false,
    ouvintes: {},
    createElement: elemento,
    addEventListener(tipo, fn) {
      (this.ouvintes[tipo] = this.ouvintes[tipo] || []).push(fn);
    },
    emitir(tipo) {
      (this.ouvintes[tipo] || []).forEach((fn) => fn());
    },
  };

  const antes = {
    enviar: Red.enviar,
    al: Red.al,
    stringify: JSON.stringify,
    parse: JSON.parse,
    addEventListener: globalThis.addEventListener,
  };

  const janelaAntiga = globalThis.window;
  const documentoAntigo = globalThis.document;
  const localStorageAntigo = globalThis.localStorage;
  const intervaloAntigo = globalThis.setInterval;
  globalThis.setInterval = (fn, ms) => {
    const id = intervaloAntigo(fn, ms);
    intervalos.push({ id, fn, ms });
    return id;
  };
  globalThis.window = janela;
  globalThis.document = documento;
  globalThis.localStorage = janela.localStorage;

  try {
    new Function("window", "document", "localStorage", bundle)(janela, documento, janela.localStorage);
  } finally {
    globalThis.setInterval = intervaloAntigo;
    globalThis.window = janelaAntiga;
    globalThis.document = documentoAntigo;
    globalThis.localStorage = localStorageAntigo;
  }

  return { janela, Red, J, Hud, enviados, antes, assinantes, documento };
}

// Roda os temporizadores de um período, sem esperar de verdade.
function avancar(ms) {
  for (const t of intervalos.slice()) {
    if (!t.fn) continue;
    const vezes = Math.floor(ms / t.ms);
    for (let i = 0; i < vezes; i += 1) t.fn();
  }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

test("o bundle monta o Olivia e assina o eresBot", () => {
  const { janela, assinantes } = cenario();
  assert.ok(janela.Olivia, "window.Olivia ausente");
  assert.equal(typeof janela.Olivia.rota, "function");
  assert.equal(janela.Olivia.modo(), "parada");
  assert.equal((assinantes.get("eresBot") || []).length, 1, "não assinou eresBot");
});

test("suspende quando a página fica oculta e retoma ao voltar", () => {
  const { janela, documento } = cenario();
  janela.Olivia.rota([[10, 10]], { origem: "teste" });
  assert.equal(janela.Olivia.motor.rodando(), true);

  documento.hidden = true;
  documento.emitir("visibilitychange");
  assert.equal(janela.Olivia.motor.rodando(), false, "continuou rodando com a página oculta");

  documento.hidden = false;
  documento.emitir("visibilitychange");
  assert.equal(janela.Olivia.motor.rodando(), true, "não retomou ao voltar");

  // `retomar` criou um intervalo depois que o cenario restaurou o setInterval
  // real; encerra explicitamente para o node --test não ficar preso.
  janela.Olivia.suspender();
  janela.Olivia.parar();
});

test("o bundle expõe seguir knight e vira para o alvo na vaga", () => {
  const { janela, J, enviados } = cenario();
  J.miId = 1;
  J.ents.set("j1", { x: 0, y: 10, piso: 0, mundo: 0 });
  J.ents.set("j7", { x: 10, y: 10, piso: 0, mundo: 0, nombre: "Knight" });

  janela.Olivia.onda.definir(true);
  janela.Olivia.seguir(7, 4);
  janela.Olivia.motor.tick();
  assert.deepEqual(enviados.at(-1), { t: "ir", x: 6, y: 10 });

  J.ents.get("j1").x = 6;
  janela.Olivia.motor.tick();
  assert.deepEqual(enviados.at(-1), { t: "pc", k: "xd", d: { a: 3 } });
  janela.Olivia.parar();
});

test("responde «Não» com /ebr e conta na sessão", async () => {
  const { janela, Red, enviados } = cenario();
  Red.emitir("eresBot", { id: "jan-1", seg: 20, b: [{ tx: "Sí", k: "a" }, { tx: "No", k: "b" }] });

  await espera(1800);

  const resposta = enviados.find((m) => m.t === "chat" && m.texto === "/ebr jan-1 b");
  assert.ok(resposta, "não respondeu /ebr jan-1 b: " + JSON.stringify(enviados));
  assert.equal(janela.Olivia.sessao.snapshot().antiBot, 1);
  assert.equal(janela.Olivia.sessao.snapshot().janelas, 1);
});

test("executa rota ponto a ponto e conclui", () => {
  const { janela, J, enviados } = cenario();
  const motor = janela.Olivia.motor;

  assert.equal(janela.Olivia.rota([[10, 10], [11, 10], [12, 10]]), 3);

  J.yo.x = 10; J.yo.y = 10; motor.tick();
  J.yo.x = 10; J.yo.y = 10; motor.tick();

  const ir = enviados.filter((m) => m.t === "ir");
  assert.ok(ir.some((m) => m.x === 11 && m.y === 10), "não mandou ir para 11,10: " + JSON.stringify(ir));

  J.yo.x = 11; J.yo.y = 10; motor.tick();
  motor.tick();
  J.yo.x = 12; J.yo.y = 10; motor.tick();

  assert.equal(motor.modo(), "parada");
  assert.equal(janela.Olivia.sessao.snapshot().pontos, 3);
  assert.ok(enviados.some((m) => m.t === "parar"), "não mandou parar ao concluir");
});

test("fecha o popup e repete a task que finalizou", () => {
  const { Red, enviados } = cenario();

  Red.emitir("tareaRepetir", { id: 77, titulo: "Task complete", texto: "Rats" });
  const repetir = enviados.find((m) => m.t === "tarea" && m.id === 77);
  assert.ok(repetir, "não enviou a ação da task: " + JSON.stringify(enviados));
  assert.equal(repetir.accion, "repetir");

  Red.emitir("tareaRepetir", { id: 78, titulo: "Task complete" });
  const outra = enviados.find((m) => m.t === "tarea" && m.id === 78);
  assert.ok(outra);
  assert.equal(outra.accion, "repetir");
});

test("aceita oferta de missão bônus e fecha o popup", () => {
  const { janela, Red, enviados } = cenario();
  Red.emitir("bonusOferta", { id: 55, titulo: "Misión bonus", texto: "Mate 10 ratos" });
  const bonus = enviados.find((m) => m.t === "bonus" && m.id === 55);
  assert.ok(bonus, "não aceitou o bônus: " + JSON.stringify(enviados));
  assert.equal(bonus.accion, "aceptar");
  assert.equal(janela.Olivia.autoTarefas.ligado(), true);
});

test("com o automático desligado não mexe em task nem bônus", () => {
  const { janela, Red, enviados } = cenario();
  janela.Olivia.autoTarefas.definir(false);
  const antes = enviados.length;
  Red.emitir("tareaRepetir", { id: 91 });
  Red.emitir("bonusOferta", { id: 92 });
  assert.equal(enviados.length, antes, "enviou algo com o automático desligado");
});

test("não embrulha API nenhuma do cliente", () => {
  const { janela, Red, antes } = cenario();
  assert.equal(Red.enviar, antes.enviar);
  assert.equal(Red.al, antes.al);
  assert.equal(JSON.stringify, antes.stringify);
  assert.equal(JSON.parse, antes.parse);
  assert.equal(janela.Red, Red);
});

test("rota com repetir dá voltas e continua andando", () => {
  const { janela, J, enviados } = cenario();
  const motor = janela.Olivia.motor;

  assert.equal(janela.Olivia.rota([[10, 10], [11, 10]], { repetir: true }), 2);

  J.yo.x = 10; J.yo.y = 10; motor.tick(); // chega no 1º
  J.yo.x = 11; J.yo.y = 10; motor.tick(); // chega no 2º → fecha volta

  const s = janela.Olivia.sessao.snapshot();
  assert.equal(s.voltas, 1);
  assert.equal(s.pontos, 2);
  assert.equal(motor.modo(), "rota", "parou em vez de repetir");
  assert.equal(motor.rota.indice(), 0);

  motor.tick(); // o tick seguinte volta a andar para o 1º ponto
  assert.ok(enviados.some((m) => m.t === "ir" && m.x === 10 && m.y === 10), "não voltou ao 1º ponto");

  // Segunda volta também anda.
  J.yo.x = 10; J.yo.y = 10; motor.tick();
  assert.equal(motor.rota.indice(), 1);
  assert.equal(janela.Olivia.sessao.snapshot().voltas, 1);
});

test("rota é salva e retomada após reinjetar o driver", () => {
  const primeiro = cenario();
  primeiro.janela.Olivia.rota([[10, 10], [11, 10]], { repetir: true });
  primeiro.janela.Olivia.motor.tick();
  avancar(3000);

  const salvo = primeiro.janela.localStorage.getItem("ovw.rota.estado");
  assert.ok(salvo, "não salvou o estado da rota");
  const dados = JSON.parse(salvo);
  assert.equal(dados.ativa, true);
  assert.equal(dados.pontos.length, 2);

  // "Recarrega" a página: novo driver, mesmo armazenamento, mesmo personagem.
  const segundo = cenario({ localStorage: primeiro.janela.localStorage });
  assert.equal(segundo.janela.Olivia.modo(), "rota", "não retomou a rota");
  assert.equal(segundo.janela.Olivia.motor.rota.total(), 2);
  assert.equal(segundo.janela.Olivia.motor.rota.repetir(), true);
});

test("marca de ponto de caça e configuração são salvas e retomadas", () => {
  const primeiro = cenario();
  primeiro.janela.Olivia.caca.definir({
    raioLimpo: 4,
    minParadoMs: 5000,
    tetoMs: 120000,
    manaMinPct: 40,
    sairComMobs: 1,
    tremMobs: 5,
  });
  primeiro.janela.Olivia.rota([[10, 10, "h"], [11, 10]], { repetir: true });
  avancar(3000);

  const salvo = JSON.parse(primeiro.janela.localStorage.getItem("ovw.rota.estado"));
  assert.equal(salvo.pontos[0].hunt, true, "não salvou a marca de caça");
  assert.equal(primeiro.janela.localStorage.getItem("ovw.caca") != null, true);

  const segundo = cenario({ localStorage: primeiro.janela.localStorage });
  assert.equal(segundo.janela.Olivia.motor.rota.cacaConfig().tremMobs, 5);
  assert.equal(segundo.janela.Olivia.motor.rota.pontos()[0].hunt, true);
});

test("parar de propósito não é retomado ao reinjetar", () => {
  const primeiro = cenario();
  primeiro.janela.Olivia.rota([[10, 10]], { repetir: true });
  primeiro.janela.Olivia.parar();
  avancar(3000);

  const segundo = cenario({ localStorage: primeiro.janela.localStorage });
  assert.equal(segundo.janela.Olivia.modo(), "parada");
});

test("contadores da sessão voltam após reinjetar", () => {
  const primeiro = cenario();
  primeiro.janela.Olivia.motor.tick(); // registra o personagem
  primeiro.janela.Olivia.sessao.pontoConcluido();
  primeiro.janela.Olivia.sessao.voltaConcluida();
  primeiro.janela.Olivia.sessao.antiBotRespondida();
  avancar(3000);

  const segundo = cenario({ localStorage: primeiro.janela.localStorage });
  const s = segundo.janela.Olivia.sessao.snapshot();
  assert.equal(s.personagem, "Teste");
  assert.equal(s.pontos, 1);
  assert.equal(s.voltas, 1);
  assert.equal(s.antiBot, 1);
});

test("conta poções de vida e mana do inventário", () => {
  const { janela } = cenario({
    inv: {
      mochila: [
        { objeto: 4201, nombre: "Small Health Potion", cant: 15 },
        { objeto: 4101, nombre: "Small Mana Potion", cant: 30 },
        { objeto: 4301, nombre: "Arrow", cant: 500 },
      ],
      botin: [],
      oro: 1234,
    },
  });

  const estado = janela.Olivia.estado();
  assert.equal(estado.suprimentos.vida, 15);
  assert.equal(estado.suprimentos.mana, 30);
  assert.equal(estado.suprimentos.oro, 1234);
  assert.equal(estado.suprimentos.itens, 545);
});
