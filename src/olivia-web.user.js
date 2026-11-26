// ==UserScript==
// @name         Olivia Web - anti-bot
// @namespace    olivia.web
// @version      0.1.0
// @description  Responde "Não" nas janelas anti-bot do LOW web e conta por sessão.
// @match        https://lowmmorpg.com/juego/*
// @match        https://*.lowmmorpg.com/juego/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
//
// Regras de segurança (ver docs/ANALISE-CLIENTE-WEB.md §5):
//  - não envolve WebSocket, JSON, canvas, addEventListener nem métodos de Red;
//  - não dispara eventos sintéticos;
//  - o painel fica fora de #menu-arriba e não usa as cores do Olivia desktop.
(function () {
  "use strict";

  const CHAVE_LIGADO = "ovw.antibot";
  const CHAVE_CONTADOR = "ovw.antibot.sessao";
  const CHAVE_ENSAIO = "ovw.ensaio";
  const ATRASO_MIN = 700;
  const ATRASO_MAX = 1600;

  const estado = {
    ligado: ler(CHAVE_LIGADO) !== "0",
    ensaio: ler(CHAVE_ENSAIO) === "1",
    respondidas: Number(ler(CHAVE_CONTADOR) || 0) || 0,
    ultima: "",
  };
  const respondidos = new Set();

  function ler(chave) {
    try { return localStorage.getItem(chave); } catch (e) { return null; }
  }
  function gravar(chave, valor) {
    try { localStorage.setItem(chave, String(valor)); } catch (e) {}
  }
  function lerSessao(chave) {
    try { return sessionStorage.getItem(chave); } catch (e) { return null; }
  }
  function gravarSessao(chave, valor) {
    try { sessionStorage.setItem(chave, String(valor)); } catch (e) {}
  }

  // O contador é por sessão do navegador; o liga/desliga é preferência.
  estado.respondidas = Number(lerSessao(CHAVE_CONTADOR) || 0) || 0;

  function agora() {
    const d = new Date();
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function atraso() {
    return ATRASO_MIN + Math.floor(Math.random() * (ATRASO_MAX - ATRASO_MIN));
  }

  function botaoNao(mensagem) {
    const botoes = Array.isArray(mensagem && mensagem.b) ? mensagem.b : [];
    return botoes.find(function (b) {
      return /^(no|não|nao)$/i.test(String((b && b.tx) || "").trim());
    }) || null;
  }

  function responder(id, chave) {
    const Red = window.Red;
    if (!Red || typeof Red.enviar !== "function") return false;
    const EresBot = window.EresBot;
    // Preferir o mesmo caminho da interface; cair para o envio direto se a janela mudou.
    if (EresBot && typeof EresBot.tocar === "function" && EresBot.m && EresBot.m.id === id) {
      EresBot.tocar(chave);
      return true;
    }
    return Red.enviar({ t: "chat", canal: "local", texto: "/ebr " + id + " " + chave }) !== false;
  }

  function aoReceber(mensagem) {
    if (!estado.ligado) return;
    if (!mensagem || mensagem.cerrar) return;
    if (!mensagem.id || respondidos.has(mensagem.id)) return;
    const botao = botaoNao(mensagem);
    if (!botao) return;

    respondidos.add(mensagem.id);
    setTimeout(function () {
      if (!estado.ligado) return;
      if (estado.ensaio) {
        console.info("[Olivia] ensaio: responderia id=" + mensagem.id + " chave=" + botao.k);
        return;
      }
      if (!responder(mensagem.id, botao.k)) return;
      estado.respondidas += 1;
      gravarSessao(CHAVE_CONTADOR, estado.respondidas);
      estado.ultima = agora();
      pintar();
    }, atraso());
  }

  // ---- painel -------------------------------------------------------------

  let painel = null;
  let linhaStatus = null;
  let linhaContador = null;
  let caixa = null;

  function criarPainel() {
    if (painel) return;
    painel = document.createElement("div");
    painel.id = "ovw-painel";
    Object.assign(painel.style, {
      position: "fixed",
      left: "8px",
      bottom: "8px",
      zIndex: "60",
      minWidth: "196px",
      padding: "8px 10px",
      borderRadius: "6px",
      background: "rgba(16, 26, 34, .93)",
      border: "1px solid #3d5566",
      color: "#dfe7ee",
      font: "12px/1.45 system-ui, sans-serif",
      pointerEvents: "auto",
    });

    const titulo = document.createElement("div");
    titulo.textContent = "Olivia";
    Object.assign(titulo.style, { fontWeight: "600", letterSpacing: ".02em", marginBottom: "4px" });
    painel.appendChild(titulo);

    const rotulo = document.createElement("label");
    Object.assign(rotulo.style, { display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" });
    caixa = document.createElement("input");
    caixa.type = "checkbox";
    caixa.checked = estado.ligado;
    caixa.addEventListener("change", function () {
      estado.ligado = caixa.checked;
      gravar(CHAVE_LIGADO, estado.ligado ? "1" : "0");
      pintar();
    });
    const texto = document.createElement("span");
    texto.textContent = "Responder «Não» no anti-bot";
    rotulo.appendChild(caixa);
    rotulo.appendChild(texto);
    painel.appendChild(rotulo);

    linhaStatus = document.createElement("div");
    Object.assign(linhaStatus.style, { marginTop: "4px", color: "#9fb3c2" });
    painel.appendChild(linhaStatus);

    linhaContador = document.createElement("div");
    Object.assign(linhaContador.style, { color: "#cfe3f2" });
    painel.appendChild(linhaContador);

    const zerar = document.createElement("button");
    zerar.type = "button";
    zerar.textContent = "zerar";
    Object.assign(zerar.style, {
      marginTop: "4px",
      padding: "0",
      border: "0",
      background: "none",
      color: "#6f8a9c",
      font: "11px system-ui, sans-serif",
      textDecoration: "underline",
      cursor: "pointer",
    });
    zerar.addEventListener("click", function () {
      estado.respondidas = 0;
      gravarSessao(CHAVE_CONTADOR, 0);
      pintar();
    });
    painel.appendChild(zerar);

    document.body.appendChild(painel);
    pintar();
  }

  function pintar() {
    if (!painel) return;
    if (caixa) caixa.checked = estado.ligado;
    const pronto = !!(window.Red && window.EresBot);
    linhaStatus.textContent = !estado.ligado
      ? "desligado"
      : estado.ensaio
        ? "ensaio (não envia)"
        : !pronto
          ? "aguardando o jogo…"
          : estado.ultima
            ? "ativo · última " + estado.ultima
            : "ativo";
    linhaContador.textContent = "respondidas nesta sessão: " + estado.respondidas;
  }

  // ---- inicialização ------------------------------------------------------

  function assinar() {
    if (!window.Red || typeof window.Red.al !== "function") return false;
    window.Red.al("eresBot", aoReceber);
    return true;
  }

  function iniciar() {
    if (document.documentElement.dataset.ovw === "1") return;
    document.documentElement.dataset.ovw = "1";

    criarPainel();
    if (!assinar()) {
      const timer = setInterval(function () {
        if (assinar()) {
          clearInterval(timer);
          pintar();
        }
      }, 500);
    }
    setInterval(pintar, 2000);
  }

  if (document.body) iniciar();
  else document.addEventListener("DOMContentLoaded", iniciar, { once: true });
})();
