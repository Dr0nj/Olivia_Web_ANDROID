import test from "node:test";
import assert from "node:assert/strict";
import { criarRtcSempre } from "../src/rtc.js";

function relogio(inicio) {
  let t = inicio || 0;
  return { agora: () => t, avancar: (ms) => { t += ms; } };
}

function assistente(inicial) {
  return {
    aa: { on: inicial },
    envios: 0,
    mandarAA() { this.envios += 1; },
  };
}

test("liga o RTC desligado pelo mesmo caminho do botão e não repete se já está on", () => {
  const r = relogio(0);
  const a = assistente(false);
  const logs = [];
  const rtc = criarRtcSempre({
    ligado: true,
    obter: () => a,
    agora: r.agora,
    log: (nome) => logs.push(nome),
  });

  assert.equal(rtc.passo().acao, "reativado");
  assert.equal(a.aa.on, true);
  assert.equal(a.envios, 1);
  assert.equal(rtc.passo().acao, "ativo");
  assert.equal(a.envios, 1, "reenviou com o RTC já ligado");
  assert.ok(logs.includes("rtc_reativado"));
});

test("desligado na opção não mexe no RTC", () => {
  const a = assistente(false);
  const rtc = criarRtcSempre({ ligado: false, obter: () => a, agora: () => 0 });
  assert.equal(rtc.passo().acao, "desligado");
  assert.equal(a.aa.on, false);
  assert.equal(a.envios, 0);
});

test("pede a configuração do Hunt Assist quando aa ainda não chegou", () => {
  const r = relogio(0);
  let pedidos = 0;
  const a = { aa: null };
  const rtc = criarRtcSempre({
    ligado: true,
    obter: () => a,
    pedir: () => { pedidos += 1; },
    agora: r.agora,
    pedidoMs: 8000,
  });
  assert.equal(rtc.passo().acao, "pedindo");
  assert.equal(rtc.passo().acao, "pedindo");
  assert.equal(pedidos, 1);
  r.avancar(8000);
  assert.equal(rtc.passo().acao, "pedindo");
  assert.equal(pedidos, 2);
});

test("não interfere com menu/RTC aberto", () => {
  const a = assistente(false);
  const rtc = criarRtcSempre({
    ligado: true,
    obter: () => a,
    interfaceAberta: () => true,
    agora: () => 0,
  });
  assert.equal(rtc.passo().acao, "interface");
  assert.equal(a.aa.on, false);
  assert.equal(a.envios, 0);
});

test("servidor recusando entra em backoff em vez de martelar", () => {
  const r = relogio(0);
  const a = {
    aa: { on: false },
    envios: 0,
    mandarAA() { this.envios += 1; this.aa.on = false; },
  };
  const logs = [];
  const rtc = criarRtcSempre({
    ligado: true,
    obter: () => a,
    agora: r.agora,
    log: (nome) => logs.push(nome),
    maxFalhas: 2,
    cooldownMs: 0,
    backoffMs: 60000,
  });

  assert.equal(rtc.passo().acao, "reativado");
  assert.equal(rtc.passo().acao, "reativado");
  const bloqueio = rtc.passo();
  assert.equal(bloqueio.acao, "backoff");
  assert.equal(a.envios, 2);
  assert.ok(logs.includes("rtc_recusado"));
  r.avancar(60000);
  assert.equal(rtc.passo().acao, "reativado");
});

test("não religa em loop a cada 2 s: espera o cooldown", () => {
  const r = relogio(0);
  const a = {
    aa: { on: false },
    envios: 0,
    mandarAA() { this.envios += 1; this.aa.on = false; },
  };
  const rtc = criarRtcSempre({
    ligado: true,
    obter: () => a,
    agora: r.agora,
    cooldownMs: 15000,
    maxFalhas: 3,
    backoffMs: 60000,
  });

  assert.equal(rtc.passo().acao, "reativado");
  r.avancar(2000);
  assert.equal(rtc.passo().acao, "cooldown", "2 s depois ainda não religa");
  r.avancar(12999);
  assert.equal(rtc.passo().acao, "cooldown");
  assert.equal(a.envios, 1);
  r.avancar(1);
  assert.equal(rtc.passo().acao, "reativado");
  assert.equal(a.envios, 2);
  r.avancar(15000);
  assert.equal(rtc.passo().acao, "reativado");
  assert.equal(a.envios, 3);
  r.avancar(15000);
  assert.equal(rtc.passo().acao, "backoff");
  assert.equal(a.envios, 3, "3 falhas seguidas viram backoff");
});

test("falhas só zeram depois que o RTC fica ligado por alguns segundos", () => {
  const r = relogio(0);
  const a = {
    aa: { on: false },
    envios: 0,
    mandarAA() { this.envios += 1; this.aa.on = true; },
  };
  const rtc = criarRtcSempre({
    ligado: true,
    obter: () => a,
    agora: r.agora,
    cooldownMs: 0,
    estavelMs: 5000,
    maxFalhas: 3,
    backoffMs: 60000,
  });

  assert.equal(rtc.passo().acao, "reativado");
  r.avancar(1000);
  assert.equal(rtc.passo().acao, "ativo");
  a.aa.on = false;
  assert.equal(rtc.passo().acao, "reativado", "caiu antes de 5 s: conta falha");
  a.aa.on = false;
  assert.equal(rtc.passo().acao, "reativado");
  a.aa.on = false;
  assert.equal(rtc.passo().acao, "backoff");
});
