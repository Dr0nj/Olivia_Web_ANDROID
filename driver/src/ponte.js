// Ponte com o cliente web. É o único arquivo que conhece `Red`, `J`, `Hud` e `EresBot`.
//
// Atenção: `J.yo` é o retrato do login e NÃO acompanha o personagem. A posição real
// está na entidade `J.ents.get("j" + J.miId)`; vida/mana/exp vivos estão em `Hud.yo`
// (o próprio `Hud.ponerYo` copia os campos para lá).
export function criarPonteNavegador() {
  function cru() {
    return {
      Red: window.Red,
      J: window.J,
      Hud: window.Hud,
      EresBot: window.EresBot,
    };
  }

  function pronto() {
    const w = cru();
    return !!(w.Red && w.J);
  }

  function entidadeDe(chave) {
    const w = cru();
    const mapa = w.J && w.J.ents;
    if (!mapa || typeof mapa.get !== "function") return null;
    return mapa.get(chave) || null;
  }

  function eu() {
    const w = cru();
    const j = w.J || {};
    return (w.Hud && w.Hud.yo) || j.yo || null;
  }

  function minhaEntidade() {
    const w = cru();
    const j = w.J;
    if (!j || !j.ents || j.miId == null) return null;
    return entidadeDe("j" + j.miId);
  }

  function estado() {
    const w = cru();
    const j = w.J || {};
    const yo = eu();
    const ent = minhaEntidade();

    const x = ent && Number.isFinite(ent.x) ? ent.x : yo && Number.isFinite(yo.x) ? yo.x : null;
    const y = ent && Number.isFinite(ent.y) ? ent.y : yo && Number.isFinite(yo.y) ? yo.y : null;
    const piso = ent && Number.isFinite(ent.piso) ? ent.piso : yo && Number.isFinite(yo.piso) ? yo.piso : null;
    const vida = yo && Number.isFinite(yo.vida) ? yo.vida : null;

    // `exp` é o XP dentro do nível; `expNivel` é o XP acumulado até o nível atual.
    const expNivel = yo && Number.isFinite(yo.expNivel) ? yo.expNivel : 0;
    const exp = yo && Number.isFinite(yo.exp) ? yo.exp : null;

    return {
      emJogo: !!j.enJuego,
      pos: x !== null && y !== null ? { x: x, y: y, z: piso } : null,
      vivo: !(yo && yo.muerto) && (vida === null || vida > 0),
      nome: (yo && (yo.nombre || yo.nome)) || (ent && ent.nombre) || null,
      nivel: yo && Number.isFinite(yo.nivel) ? yo.nivel : null,
      xp: exp === null ? null : expNivel + exp,
      xpNivel: exp,
      xpProximo: yo && Number.isFinite(yo.expSig) ? yo.expSig : null,
      estamina: yo && Number.isFinite(yo.estamina) ? yo.estamina : null,
      vida: vida,
      vidaMax: yo && Number.isFinite(yo.vidaMax) ? yo.vidaMax : null,
      mana: yo && Number.isFinite(yo.mana) ? yo.mana : null,
      manaMax: yo && Number.isFinite(yo.manaMax) ? yo.manaMax : null,
    };
  }

  function entidade(id) {
    const e = entidadeDe("j" + id) || entidadeDe("m" + id);
    if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y)) return null;
    return { x: e.x, y: e.y, nome: e.nombre || e.nome || null };
  }

  // Jogadores visíveis (entidades "j..."), do mais perto para o mais longe.
  function jogadores() {
    const w = cru();
    const j = w.J;
    if (!j || !j.ents || typeof j.ents[Symbol.iterator] !== "function") return [];
    const meu = minhaEntidade();
    const lista = [];
    for (const [chave, e] of j.ents) {
      if (!chave || chave[0] !== "j") continue;
      const id = Number(chave.slice(1));
      if (!Number.isFinite(id) || id === j.miId) continue;
      if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      const dist = meu ? Math.max(Math.abs(e.x - meu.x), Math.abs(e.y - meu.y)) : null;
      lista.push({ id: id, nome: e.nombre || e.nome || "", x: e.x, y: e.y, dist: dist });
    }
    lista.sort(function (a, b) {
      if (a.dist === null) return 1;
      if (b.dist === null) return -1;
      return a.dist - b.dist;
    });
    return lista;
  }

  function enviar(msg) {
    const w = cru();
    if (!w.Red || typeof w.Red.enviar !== "function") return false;
    return w.Red.enviar(msg) !== false;
  }

  function aoReceber(tipo, fn) {
    const w = cru();
    if (!w.Red || typeof w.Red.al !== "function") return false;
    w.Red.al(tipo, fn);
    return true;
  }

  // Mesmo caminho da interface; cai para o envio direto se a janela já mudou.
  function responderEresBot(id, chave) {
    const w = cru();
    if (!w.Red) return false;
    if (w.EresBot && typeof w.EresBot.tocar === "function" && w.EresBot.m && w.EresBot.m.id === id) {
      w.EresBot.tocar(chave);
      return true;
    }
    return enviar({ t: "chat", canal: "local", texto: "/ebr " + id + " " + chave });
  }

  function inventario() {
    const w = cru();
    const inv = (w.Hud && w.Hud.inv) || {};
    const somar = function (lista) {
      const mapa = {};
      (Array.isArray(lista) ? lista : []).forEach(function (o) {
        if (!o || !o.objeto) return;
        mapa[o.objeto] = (mapa[o.objeto] || 0) + (o.cant || 1);
      });
      return mapa;
    };
    return {
      mochila: somar(inv.mochila),
      botin: somar(inv.botin),
      oro: Number(inv.oro) || 0,
    };
  }

  // Poções e afins: usa o nome do item (Hud preenche `nombre`) ou a tabela do jogo.
  function suprimentos() {
    const w = cru();
    const inv = (w.Hud && w.Hud.inv) || {};
    const tabela = (w.Hud && w.Hud.datos && w.Hud.datos.objetos) || {};
    let vida = 0;
    let mana = 0;
    let itens = 0;

    (Array.isArray(inv.mochila) ? inv.mochila : []).forEach(function (o) {
      if (!o) return;
      const qtd = Number(o.cant) || 0;
      itens += qtd;
      const nome = o.nombre || (tabela[o.objeto] && tabela[o.objeto][0]) || "";
      if (/health potion|poci[oó]n de vida|po[cç][aã]o de vida/i.test(nome)) vida += qtd;
      else if (/mana potion|poci[oó]n de man[aá]|po[cç][aã]o de man[aá]/i.test(nome)) mana += qtd;
    });

    return { vida: vida, mana: mana, itens: itens, oro: Number(inv.oro) || 0 };
  }

  return { pronto, estado, entidade, jogadores, enviar, aoReceber, responderEresBot, inventario, suprimentos };
}
