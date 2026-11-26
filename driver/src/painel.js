// Painel do Olivia no navegador. Fica fora de #hud/#menu-arriba e evita cores e
// palavras que o detector do jogo usa como assinatura (ver docs/ANALISE-CLIENTE-WEB.md).
export function criarPainel(opcoes) {
  const cfg = Object.assign({ motor: null, antibot: null }, opcoes || {});
  const motor = cfg.motor;
  const antibot = cfg.antibot;

  let raiz = null;
  const partes = {};
  let timer = null;

  function el(tag, estilo, texto) {
    const e = document.createElement(tag);
    if (estilo) Object.assign(e.style, estilo);
    if (texto != null) e.textContent = texto;
    return e;
  }

  function botao(texto, aoClicar) {
    const b = el("button", {
      flex: "1",
      padding: "5px 8px",
      border: "1px solid #3d5566",
      borderRadius: "4px",
      background: "#16232d",
      color: "#dfe7ee",
      font: "11px system-ui, sans-serif",
      cursor: "pointer",
    }, texto);
    b.type = "button";
    b.addEventListener("click", aoClicar);
    return b;
  }

  function linha(estilo) {
    return el("div", Object.assign({ display: "flex", gap: "6px", alignItems: "center" }, estilo));
  }

  function lerRota(texto) {
    const bruto = JSON.parse(texto);
    if (!Array.isArray(bruto)) throw new Error("JSON precisa ser uma lista");
    return bruto.map(function (p) {
      if (Array.isArray(p)) return { x: Number(p[0]), y: Number(p[1]) };
      return { x: Number(p.x), y: Number(p.y), pausaMs: Number(p.pausaMs) || 0 };
    });
  }

  function montar() {
    if (raiz) return;
    raiz = el("div", {
      position: "fixed",
      left: "8px",
      bottom: "8px",
      zIndex: "60",
      width: "246px",
      padding: "8px 10px",
      borderRadius: "6px",
      background: "rgba(16, 26, 34, .94)",
      border: "1px solid #3d5566",
      color: "#dfe7ee",
      font: "11.5px/1.5 system-ui, sans-serif",
      boxShadow: "0 2px 10px rgba(0,0,0,.35)",
      pointerEvents: "auto",
      touchAction: "manipulation",
    });
    raiz.id = "ovw-painel";

    const topo = linha({ justifyContent: "space-between", marginBottom: "4px" });
    topo.appendChild(el("strong", { letterSpacing: ".02em", color: "#cfe3f2" }, "Olivia"));
    partes.estado = el("span", { fontSize: "10.5px", color: "#9fb3c2" }, "aguardando");
    topo.appendChild(partes.estado);
    raiz.appendChild(topo);

    partes.modo = el("div", { color: "#cfe3f2" }, "parada · ponto 0/0");
    raiz.appendChild(partes.modo);

    partes.numeros = el("div", { fontSize: "10.5px", color: "#9fb3c2" }, "tempo 00:00 · xp/h 0");
    raiz.appendChild(partes.numeros);

    partes.contadores = el("div", { fontSize: "10.5px", color: "#9fb3c2" }, "pontos 0 · voltas 0 · mortes 0");
    raiz.appendChild(partes.contadores);

    const desafio = linha({ marginTop: "5px" });
    partes.caixa = document.createElement("input");
    partes.caixa.type = "checkbox";
    partes.caixa.checked = antibot ? antibot.ligado() : true;
    partes.caixa.addEventListener("change", function () {
      if (antibot) antibot.definirLigado(partes.caixa.checked);
      atualizar();
    });
    desafio.appendChild(partes.caixa);
    desafio.appendChild(el("span", null, "Responder «Não» no desafio"));
    raiz.appendChild(desafio);

    partes.desafio = el("div", { fontSize: "10.5px", color: "#9fb3c2" }, "desafio 0/0");
    raiz.appendChild(partes.desafio);

    const campoRota = el("textarea", {
      width: "100%",
      height: "42px",
      marginTop: "6px",
      padding: "4px 5px",
      boxSizing: "border-box",
      resize: "vertical",
      border: "1px solid #3d5566",
      borderRadius: "4px",
      background: "#0d1720",
      color: "#cfe3f2",
      font: "10.5px ui-monospace, monospace",
    });
    campoRota.placeholder = "[[33000,32000],[33001,32000]]";
    try { campoRota.value = localStorage.getItem("ovw.rota") || ""; } catch (e) {}
    raiz.appendChild(campoRota);

    const acoes = linha({ marginTop: "6px" });
    acoes.appendChild(botao("Iniciar", function () {
      try {
        const pontos = lerRota(campoRota.value || "[]");
        localStorage.setItem("ovw.rota", campoRota.value);
        motor.iniciarRota(pontos, "painel-web", { repetir: partes.repetir.checked });
      } catch (e) {
        alert("Rota inválida: " + e.message);
      }
      atualizar();
    }));
    acoes.appendChild(botao("Parar", function () {
      motor.parar("painel");
      atualizar();
    }));
    raiz.appendChild(acoes);

    const repetir = linha({ marginTop: "4px" });
    partes.repetir = document.createElement("input");
    partes.repetir.type = "checkbox";
    partes.repetir.checked = motor.rota.repetir();
    partes.repetir.addEventListener("change", function () {
      motor.rota.repetir(partes.repetir.checked);
    });
    repetir.appendChild(partes.repetir);
    repetir.appendChild(el("span", null, "Repetir a rota"));
    raiz.appendChild(repetir);

    const seguir = linha({ marginTop: "6px" });
    partes.idAlvo = el("input", {
      width: "82px",
      padding: "4px 5px",
      border: "1px solid #3d5566",
      borderRadius: "4px",
      background: "#0d1720",
      color: "#cfe3f2",
      font: "11px system-ui, sans-serif",
    });
    partes.idAlvo.placeholder = "id do jogador";
    partes.idAlvo.inputMode = "numeric";
    seguir.appendChild(partes.idAlvo);
    seguir.appendChild(botao("Seguir", function () {
      const id = Number(partes.idAlvo.value);
      if (!Number.isInteger(id) || id <= 0) return;
      motor.seguir(id);
      atualizar();
    }));
    raiz.appendChild(seguir);

    const rodape = linha({ marginTop: "6px", justifyContent: "space-between" });
    partes.log = el("span", { fontSize: "10px", color: "#6f8a9c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, "");
    rodape.appendChild(partes.log);
    rodape.appendChild(botao("zerar", function () {
      motor.sessao.reset();
      if (antibot && antibot.zerar) antibot.zerar();
      atualizar();
    }));
    raiz.appendChild(rodape);

    raiz.addEventListener("pointerdown", function (e) { e.stopPropagation(); }, { passive: true });
    document.body.appendChild(raiz);

    timer = setInterval(atualizar, 500);
    atualizar();
  }

  function doisDigitos(n) { return String(n).padStart(2, "0"); }

  function tempo(ms) {
    const s = Math.floor(ms / 1000);
    return doisDigitos(Math.floor(s / 60)) + ":" + doisDigitos(s % 60);
  }

  function atualizar() {
    if (!raiz) return;
    const s = motor.sessao.snapshot();
    const modo = motor.modo();
    const alvo = motor.rota.alvo();
    const indice = Math.min(motor.rota.indice() + 1, motor.rota.total());

    partes.estado.textContent = modo === "parada" ? "parada" : modo;
    partes.modo.textContent = modo === "rota"
      ? "rota · ponto " + indice + "/" + motor.rota.total()
        + " · volta " + motor.rota.volta()
        + (alvo ? " (" + alvo.x + "," + alvo.y + ")" : "")
      : modo === "seguir"
        ? "seguindo " + (motor.seguindoId() || "?")
        : "parada · ponto " + indice + "/" + motor.rota.total();

    const pausa = Math.ceil(motor.pausaRestante() / 1000);
    const suplemento = pausa > 0 ? " · pausa " + pausa + "s" : "";
    partes.numeros.textContent = "tempo " + tempo(s.duracaoMs) + " · xp/h " + s.xpHora.toLocaleString("pt-BR")
      + suplemento;
    partes.contadores.textContent = "pontos " + s.pontos + " · voltas " + s.voltas + " · mortes " + s.mortes;
    partes.desafio.textContent = "desafio " + s.antiBot + "/" + s.janelas + " · " + motor.rota.situacao();

    const ultimo = motor.log.ultimos(1)[0];
    partes.log.textContent = ultimo ? ultimo.nome : "";
    partes.log.title = ultimo ? JSON.stringify(ultimo) : "";
  }

  function desmontar() {
    if (timer) clearInterval(timer);
    timer = null;
    if (raiz) raiz.remove();
    raiz = null;
  }

  return { montar, desmontar, atualizar, raiz: () => raiz };
}
