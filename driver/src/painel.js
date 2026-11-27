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
      const hunt = Array.isArray(p)
        ? p[2] === "h" || p[2] === true
        : !!(p.hunt === true || p.hunt === "h" || p.caca === true || p.h === "h" || p.h === true);
      if (Array.isArray(p)) return { x: Number(p[0]), y: Number(p[1]), pausaMs: 0, hunt: hunt };
      return {
        x: Number(p.x),
        y: Number(p.y),
        pausaMs: Number(p.pausaMs) || 0,
        hunt: hunt,
      };
    });
  }

  function textoRota(pontos) {
    return JSON.stringify(pontos.map(function (p) {
      if (!p.hunt && !(p.pausaMs > 0)) return [p.x, p.y];
      const o = { x: p.x, y: p.y };
      if (p.pausaMs > 0) o.pausaMs = p.pausaMs;
      if (p.hunt) o.hunt = true;
      return o;
    }));
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

    function marcarPonto(caca) {
      let pos = null;
      try {
        const st = window.Olivia && window.Olivia.estado ? window.Olivia.estado() : null;
        pos = st && st.jogo ? st.jogo.pos : null;
      } catch (e) {
        pos = null;
      }
      if (!pos || !Number.isInteger(pos.x) || !Number.isInteger(pos.y)) {
        alert("Posição indisponível (fora do jogo?)");
        return;
      }
      let pontos;
      try {
        pontos = lerRota(campoRota.value || "[]");
      } catch (e) {
        alert("Rota inválida: " + e.message);
        return;
      }
      const ultimo = pontos[pontos.length - 1];
      if (ultimo && ultimo.x === pos.x && ultimo.y === pos.y) {
        if (!!ultimo.hunt === !!caca) return;
        ultimo.hunt = !!caca;
      } else {
        pontos.push({ x: pos.x, y: pos.y, pausaMs: 0, hunt: !!caca });
      }
      campoRota.value = textoRota(pontos);
      try { localStorage.setItem("ovw.rota", campoRota.value); } catch (e) { /* sem storage */ }
      atualizar();
    }

    const marcar = linha({ marginTop: "4px" });
    marcar.appendChild(botao("Marcar aqui", function () { marcarPonto(false); }));
    marcar.appendChild(botao("Ponto de caça", function () { marcarPonto(true); }));
    raiz.appendChild(marcar);

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

    const linhaRtc = linha({ marginTop: "2px" });
    partes.rtc = document.createElement("input");
    partes.rtc.type = "checkbox";
    try { partes.rtc.checked = localStorage.getItem("ovw.rtcSempre") === "1"; } catch (e) { /* sem storage */ }
    partes.rtc.addEventListener("change", function () {
      const ligado = partes.rtc.checked;
      if (window.Olivia && window.Olivia.rtc) window.Olivia.rtc.definir(ligado);
      atualizar();
    });
    linhaRtc.appendChild(partes.rtc);
    linhaRtc.appendChild(el("span", null, "Manter RTC ligado"));
    raiz.appendChild(linhaRtc);

    const linhaRetarget = linha({ marginTop: "2px" });
    partes.retarget = document.createElement("input");
    partes.retarget.type = "checkbox";
    let retargetSalvo = null;
    try { retargetSalvo = JSON.parse(localStorage.getItem("ovw.retarget") || "null"); } catch (e) { retargetSalvo = null; }
    partes.retarget.checked = !!(retargetSalvo && retargetSalvo.ligado);
    partes.retargetSqm = el("input", {
      width: "30px",
      padding: "3px",
      border: "1px solid #3d5566",
      borderRadius: "4px",
      background: "#0d1720",
      color: "#cfe3f2",
      font: "10.5px ui-monospace, monospace",
      textAlign: "center",
    });
    partes.retargetSqm.type = "number";
    partes.retargetSqm.min = "1";
    partes.retargetSqm.max = "8";
    partes.retargetSqm.value = String(retargetSalvo && Number(retargetSalvo.sqm) ? retargetSalvo.sqm : 6);
    partes.retargetSqm.disabled = !partes.retarget.checked;
    partes.retarget.addEventListener("change", function () {
      if (window.Olivia && window.Olivia.retarget) {
        window.Olivia.retarget.definir(partes.retarget.checked, Number(partes.retargetSqm.value) || 6);
      }
      partes.retargetSqm.disabled = !partes.retarget.checked;
      atualizar();
    });
    partes.retargetSqm.addEventListener("change", function () {
      if (window.Olivia && window.Olivia.retarget) {
        window.Olivia.retarget.definir(partes.retarget.checked, Number(partes.retargetSqm.value) || 6);
      }
    });
    linhaRetarget.appendChild(partes.retarget);
    linhaRetarget.appendChild(el("span", null, "Re-target após"));
    linhaRetarget.appendChild(partes.retargetSqm);
    linhaRetarget.appendChild(el("span", null, "sqm"));
    raiz.appendChild(linhaRetarget);

    // Configuração do ponto de caça (HuntSpotSettings do desktop).
    const secao = document.createElement("details");
    secao.style.marginTop = "6px";
    const resumo = document.createElement("summary");
    resumo.textContent = "Ponto de caça";
    resumo.style.cursor = "pointer";
    resumo.style.color = "#cfe3f2";
    secao.appendChild(resumo);

    const grade = el("div", {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "4px",
      marginTop: "4px",
    });
    const regras = motor.rota.cacaConfig();
    const campos = [
      { chave: "raioLimpo", rotulo: "Livre (sqm)", min: 1, max: 7, fator: 1 },
      { chave: "minParadoMs", rotulo: "Mínimo (s)", min: 0, max: 60, fator: 1000 },
      { chave: "tetoMs", rotulo: "Teto (s)", min: 10, max: 900, fator: 1000 },
      { chave: "manaMinPct", rotulo: "Mana (%)", min: 0, max: 100, fator: 1 },
      { chave: "sairComMobs", rotulo: "Sair c/ mobs", min: 0, max: 10, fator: 1 },
      { chave: "tremMobs", rotulo: "Trem (mobs)", min: 0, max: 30, fator: 1 },
    ];
    partes.cacaCampos = {};
    campos.forEach(function (c) {
      const caixa = el("label", { display: "flex", flexDirection: "column", fontSize: "9.5px", color: "#9fb3c2" });
      caixa.appendChild(el("span", null, c.rotulo));
      const campo = el("input", {
        width: "100%",
        boxSizing: "border-box",
        padding: "2px 4px",
        border: "1px solid #3d5566",
        borderRadius: "3px",
        background: "#0d1720",
        color: "#cfe3f2",
        font: "10.5px ui-monospace, monospace",
      });
      campo.type = "number";
      campo.min = String(c.min);
      campo.max = String(c.max);
      campo.value = String(Math.round((regras[c.chave] || 0) / c.fator));
      partes.cacaCampos[c.chave] = { campo: campo, fator: c.fator };
      caixa.appendChild(campo);
      grade.appendChild(caixa);
    });
    secao.appendChild(grade);
    const statusCaca = el("div", { fontSize: "9.5px", color: "#6f8a9c", marginTop: "3px" },
      "Chegou no sqm: segura até sobrar o limite de monstros.");
    secao.appendChild(statusCaca);
    secao.appendChild(botao("Salvar caça", function () {
      const novo = {};
      Object.keys(partes.cacaCampos).forEach(function (chave) {
        const info = partes.cacaCampos[chave];
        novo[chave] = Math.round(Number(info.campo.value) || 0) * info.fator;
      });
      let aplicado;
      try {
        aplicado = window.Olivia && window.Olivia.caca
          ? window.Olivia.caca.definir(novo)
          : motor.rota.definirCaca(novo);
      } catch (e) {
        aplicado = motor.rota.definirCaca(novo);
      }
      statusCaca.textContent = "Caça: livre " + aplicado.raioLimpo + " sqm · mínimo "
        + Math.round(aplicado.minParadoMs / 1000) + " s · teto "
        + Math.round(aplicado.tetoMs / 1000) + " s · mana " + aplicado.manaMinPct + "%";
    }));
    raiz.appendChild(secao);

    const seguir = linha({ marginTop: "6px" });
    partes.idAlvo = el("input", {
      width: "72px",
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

    partes.distancia = el("input", {
      width: "34px",
      padding: "4px 3px",
      border: "1px solid #3d5566",
      borderRadius: "4px",
      background: "#0d1720",
      color: "#cfe3f2",
      font: "11px ui-monospace, monospace",
      textAlign: "center",
    });
    partes.distancia.type = "number";
    partes.distancia.min = "0";
    partes.distancia.max = "8";
    partes.distancia.title = "distância em sqm (0 = mesmo tile)";
    try { partes.distancia.value = localStorage.getItem("ovw.seguirSqm") || "1"; } catch (e) { partes.distancia.value = "1"; }
    seguir.appendChild(partes.distancia);

    seguir.appendChild(botao("Seguir", function () {
      const id = Number(partes.idAlvo.value);
      if (!Number.isInteger(id) || id <= 0) return;
      const onda = !!(partes.onda && partes.onda.checked);
      let dist = Number(partes.distancia.value);
      if (!Number.isFinite(dist)) dist = 1;
      dist = Math.max(0, Math.min(8, Math.round(dist)));
      if (!onda) {
        try { localStorage.setItem("ovw.seguirSqm", String(dist)); } catch (e) { /* sem storage */ }
      }
      motor.seguir(id, onda ? 4 : dist, { onda: onda });
      atualizar();
    }));
    raiz.appendChild(seguir);

    const linhaOnda = linha({ marginTop: "2px" });
    partes.onda = document.createElement("input");
    partes.onda.type = "checkbox";
    partes.onda.checked = !!(window.Olivia && window.Olivia.onda && window.Olivia.onda.ligado());
    partes.onda.addEventListener("change", function () {
      const ligado = partes.onda.checked;
      if (window.Olivia && window.Olivia.onda) window.Olivia.onda.definir(ligado);
      else motor.definirOnda(ligado);
      if (ligado) {
        try { localStorage.setItem("ovw.seguirSqm", partes.distancia.value); } catch (e) { /* sem storage */ }
        partes.distancia.value = "4";
      } else {
        let guardado = "1";
        try { guardado = localStorage.getItem("ovw.seguirSqm") || "1"; } catch (e) { /* sem storage */ }
        partes.distancia.value = guardado;
      }
      partes.distancia.disabled = ligado;
      atualizar();
    });
    linhaOnda.appendChild(partes.onda);
    linhaOnda.appendChild(el("span", null, "Seguir knight (onda 4 sqm)"));
    raiz.appendChild(linhaOnda);

    if (partes.onda.checked) {
      partes.distancia.value = "4";
      partes.distancia.disabled = true;
    }

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
    const ci = motor.rota.cacaInfo ? motor.rota.cacaInfo() : null;
    const caca = ci && ci.ativo
      ? " · caça " + Math.floor(ci.tempoMs / 1000) + "s (" + ci.perto + " mobs)"
      : "";

    partes.estado.textContent = modo === "parada" ? "parada" : modo;
    partes.modo.textContent = modo === "rota"
      ? "rota · Waypoint " + indice + "/" + motor.rota.total()
        + " · volta " + motor.rota.volta()
        + (alvo ? " (" + alvo.x + "," + alvo.y + ")" : "")
        + caca
      : modo === "seguir"
        ? "seguindo " + (motor.seguindoId() || "?")
          + (motor.seguidor.onda() ? " · onda" : "")
        : "parada · Waypoint " + indice + "/" + motor.rota.total();

    const pausa = Math.ceil(motor.pausaRestante() / 1000);
    const suplemento = pausa > 0 ? " · pausa " + pausa + "s" : "";
    partes.numeros.textContent = "tempo " + tempo(s.duracaoMs) + " · xp/h " + s.xpHora.toLocaleString("pt-BR")
      + suplemento;
    partes.contadores.textContent = "pontos " + s.pontos + " · voltas " + s.voltas + " · mortes " + s.mortes;
    partes.desafio.textContent = "desafio " + s.antiBot + "/" + s.janelas + " · " + motor.rota.situacao();

    if (partes.rtc && window.Olivia && window.Olivia.rtc) {
      const ligado = !!window.Olivia.rtc.ligado();
      if (partes.rtc.checked !== ligado) partes.rtc.checked = ligado;
    }
    if (partes.retarget && window.Olivia && window.Olivia.retarget) {
      const r = window.Olivia.retarget.estado();
      if (partes.retarget.checked !== !!r.ligado) partes.retarget.checked = !!r.ligado;
      if (document.activeElement !== partes.retargetSqm) {
        partes.retargetSqm.value = String(r.sqm || 6);
      }
      partes.retargetSqm.disabled = !r.ligado;
    }

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
