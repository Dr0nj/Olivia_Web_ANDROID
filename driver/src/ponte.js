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
      Pelea: window.Pelea,
      MenuLow: window.MenuLow,
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
    // O painel do cliente guarda a stamina em segundos em `MenuLow.energia.a`.
    const energiaSeg = w.MenuLow && w.MenuLow.energia
      && Number.isFinite(w.MenuLow.energia.a) ? w.MenuLow.energia.a : null;

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
      estamina: energiaSeg !== null
        ? energiaSeg / 3600
        : yo && Number.isFinite(yo.estamina) ? yo.estamina : null,
      vida: vida,
      vidaMax: yo && Number.isFinite(yo.vidaMax) ? yo.vidaMax : null,
      mana: yo && Number.isFinite(yo.mana) ? yo.mana : null,
      manaMax: yo && Number.isFinite(yo.manaMax) ? yo.manaMax : null,
    };
  }

  function entidade(id) {
    const e = entidadeDe("j" + id) || entidadeDe("m" + id);
    if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y)) return null;
    return {
      x: e.x,
      y: e.y,
      nome: e.nombre || e.nome || null,
      piso: Number.isFinite(e.piso) ? e.piso : null,
      mundo: Number.isFinite(e.mundo) ? e.mundo : null,
      morto: !!e.muerto,
    };
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

  // Monstros vivos visíveis (entidades "m..."), para a escolha de alvo em área.
  function monstros() {
    const w = cru();
    const j = w.J;
    if (!j || !j.ents || typeof j.ents[Symbol.iterator] !== "function") return [];
    const eu = minhaEntidade();
    const lista = [];
    for (const [chave, e] of j.ents) {
      if (!chave || chave[0] !== "m") continue;
      const id = Number(chave.slice(1));
      if (!Number.isFinite(id)) continue;
      if (!e || e.muerto || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      if (eu) {
        if (eu.mundo != null && e.mundo != null && e.mundo !== eu.mundo) continue;
        if (eu.piso != null && e.piso != null && e.piso !== eu.piso) continue;
      }
      lista.push({ id: id, x: e.x, y: e.y });
    }
    return lista;
  }

  // Alvo atual do cliente quando é monstro (a UI guarda em `Pelea.obj`).
  function objetivo() {
    const w = cru();
    const p = w.Pelea;
    if (!p || !p.obj || p.obj.tipo !== "m") return null;
    const id = Number(p.obj.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  // Mesmo caminho da interface (`Pelea.poner`); cai para o envio direto se mudar.
  function mirar(id) {
    const w = cru();
    try {
      if (w.Pelea && typeof w.Pelea.poner === "function") {
        w.Pelea.poner("m", id, true);
        return true;
      }
    } catch (e) {
      // sem Pelea: manda a mesma mensagem
    }
    return enviar({ t: "objetivo", monstruo: id });
  }

  // Gira sem andar. Formato da tecla Ctrl+seta do cliente:
  // a = 0 baixo, 1 cima, 2 esquerda, 3 direita.
  function girar(face) {
    const a = Number(face);
    if (!Number.isInteger(a) || a < 0 || a > 3) return false;
    return enviar({ t: "pc", k: "xd", d: { a: a } });
  }

  // Assina sem duplicar. O cliente pode trocar `Red.manejadores[tipo]` inteiro
  // (o `vb03.js` faz isso com `tareaRepetir`), então o chamador pode repetir
  // esta função depois do `load` e a cada ciclo para recolocar o handler.
  function garantirHandler(tipo, fn) {
    const w = cru();
    const manejadores = w.Red && w.Red.manejadores;
    if (!manejadores || typeof manejadores !== "object") return false;
    const lista = manejadores[tipo] || (manejadores[tipo] = []);
    if (!Array.isArray(lista)) return false;
    if (!lista.includes(fn)) lista.push(fn);
    return true;
  }

  function aoReceber(tipo, fn) {
    if (garantirHandler(tipo, fn)) return true;
    const w = cru();
    if (!w.Red || typeof w.Red.al !== "function") return false;
    w.Red.al(tipo, fn);
    return true;
  }

  // Estado atual da task no HUD do cliente. O `Hud.tareas` substitui o item
  // inteiro em cada mensagem `tarea`/`tareas`.
  function tarefa(id) {
    const w = cru();
    const lista = w.Hud && Array.isArray(w.Hud.listaTareas) ? w.Hud.listaTareas : null;
    if (!lista) return null;
    const alvo = Number(id);
    for (const t of lista) {
      if (!t || Number(t.id) !== alvo) continue;
      const numero = function (v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      return {
        id: alvo,
        estado: Number.isFinite(Number(t.estado)) ? Number(t.estado) : null,
        vezes: numero(t.vezes),
        matados: numero(t.matados),
        meta: numero(t.meta),
        nombre: t.nombre || null,
      };
    }
    return null;
  }

  // O popup atual do `tareaRepetir` é o aviso compacto `#aviso-tarea`; a versão
  // antiga do cliente usava um `.lo-dlg`. Fecha pelo método interno, sem clique
  // sintético. Se o aviso existe, não fecha outro diálogo por engano.
  function fecharAvisoTarefa() {
    try {
      if (typeof document.getElementById !== "function") return false;
      const aviso = document.getElementById("aviso-tarea");
      if (aviso) {
        if (typeof aviso._quitar === "function") aviso._quitar();
        return "aviso";
      }
    } catch (e) { /* sem aviso */ }
    try {
      if (typeof document.querySelectorAll !== "function") return false;
      const dialogos = document.querySelectorAll("#hud .lo-dlg");
      const ultimo = dialogos.length ? dialogos[dialogos.length - 1] : null;
      if (ultimo && typeof ultimo._cerrar === "function") {
        ultimo._cerrar();
        return "dialogo";
      }
    } catch (e) { /* sem diálogo */ }
    return false;
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

  function caminavel(x, y) {
    const w = cru();
    let m = null;
    try {
      if (typeof mapa !== "undefined") m = mapa;
    } catch (e) {
      m = null;
    }
    if (!m) m = w.mapa || null;
    if (!m || typeof m.caminable !== "function") return true;
    try {
      return !!m.caminable(x, y);
    } catch (e) {
      return true;
    }
  }

  // Interface do jogo aberta (inventário, opções, task, RTC etc). É só leitura de
  // estado/DOM: não envolve função nenhuma do cliente e não altera a página.
  // O objetivo é parar o laço enquanto o jogador mexe na interface e evitar que o
  // watchdog reinjete o driver durante um menu pesado.
  function interfaceAberta() {
    const w = cru();
    try {
      if (w.MenuLow && typeof w.MenuLow.abierto === "function" && w.MenuLow.abierto()) return true;
    } catch (e) { /* sem menu */ }
    try {
      if (w.Hud && w.Hud.ventanaTipo) return true;
      const ventana = document.getElementById("ventana");
      if (ventana && ventana.hidden === false) return true;
      const menu = document.getElementById("vmenu");
      if (menu && menu.hidden === false) return true;
      // Aviso compacto de task completa (versão atual do cliente).
      if (document.getElementById("aviso-tarea")) return true;
      // Diálogos do próprio cliente (NPC, banco, task, RTC...). A coleção é viva
      // e só o tamanho é consultado; não força layout.
      if (document.getElementsByClassName("lo-dlg").length > 0) return true;
    } catch (e) { /* DOM ainda carregando */ }
    return false;
  }

  return {
    pronto, estado, entidade, jogadores, enviar, aoReceber, garantirHandler,
    responderEresBot, inventario, suprimentos, caminavel, monstros, objetivo,
    mirar, girar, tarefa, fecharAvisoTarefa, interfaceAberta,
  };
}
