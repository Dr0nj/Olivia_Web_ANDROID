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
