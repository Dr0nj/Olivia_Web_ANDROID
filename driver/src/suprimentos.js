// Estimativa de consumo de suprimentos por item, como o SupplyEstimator do
// desktop. O total sozinho engana: poções de vida caem enquanto as de mana sobem
// com loot, e o saldo agregado parece "sem consumo" para sempre.
//
// Cada amostra guarda o acumulado de saída (gasto) e entrada (loot). O tempo
// restante usa o saldo líquido; se o loot repõe tudo, mostramos "loot repõe".
const JANELA_MS = 10 * 60000;
const MINIMO_MS = 30000;
const MINIMO_CONSUMO = 3;
const RECENTE_MS = 120000;
const LOOT_MAX = 20;

// Mesmas "suprimentos conhecidas" do desktop (SupplyEstimator): poções de mana e
// a runa 5002 aparecem mesmo sem uso; o resto só aparece depois de ser consumido.
function conhecido(id) {
  const n = Number(id);
  return (n >= 4101 && n <= 4105) || n === 5002;
}

export function criarSuprimentos(opcoes) {
  const cfg = Object.assign({
    janelaMs: JANELA_MS,
    minimoMs: MINIMO_MS,
    minimoConsumo: MINIMO_CONSUMO,
    recenteMs: RECENTE_MS,
    lootMax: LOOT_MAX,
  }, opcoes || {});

  let modo = "total";
  let totalAmostras = [];
  let ultimo = new Map();
  const registros = new Map();

  function chave(item) {
    return String(item && item.id != null ? item.id : item && item.nome ? item.nome : "item");
  }

  function registrarTotal(contagem, agora) {
    if (!Number.isFinite(contagem)) return;
    modo = "total";
    totalAmostras.push({ t: agora, v: contagem });
    const corte = agora - cfg.janelaMs * 2;
    while (totalAmostras.length && totalAmostras[0].t < corte) totalAmostras.shift();
  }

  // lista: [{id,nome,tipo,quantidade}] do inventário (poções).
  function registrarItens(lista, agora) {
    modo = "itens";
    const atual = new Map();
    (Array.isArray(lista) ? lista : []).forEach(function (item) {
      if (!item) return;
      const k = chave(item);
      const q = Math.max(0, Number(item.quantidade) || 0);
      const anterior = atual.get(k);
      if (anterior) {
        anterior.quantidade += q;
      } else {
        atual.set(k, {
          id: item.id,
          nome: item.nome || "",
          tipo: item.tipo || "outro",
          quantidade: q,
        });
      }
    });

    // Item que sumiu do inventário entra com 0 para detectar esgotamento.
    for (const [k, h] of registros) {
      if (!atual.has(k)) {
        atual.set(k, { id: h.id, nome: h.nome, tipo: h.tipo, quantidade: 0 });
      }
    }

    for (const [k, item] of atual) {
      let h = registros.get(k);
      if (!h) {
        h = {
          id: item.id,
          nome: item.nome,
          tipo: item.tipo,
          quantidade: 0,
          out: 0,
          in: 0,
          used: false,
          lastLoss: 0,
          samples: [],
        };
        registros.set(k, h);
      }
      const antes = ultimo.get(k);
      if (antes != null) {
        if (item.quantidade > antes) {
          const delta = item.quantidade - antes;
          if (delta > cfg.lootMax) {
            // Compra/depósito: recomeça a medição desse item.
            h.out = 0;
            h.in = 0;
            h.used = false;
            h.lastLoss = 0;
            h.samples = [];
          } else {
            h.in += delta;
          }
        } else if (item.quantidade < antes) {
          h.out += antes - item.quantidade;
          h.used = true;
          h.lastLoss = agora;
        }
      }
      h.id = item.id;
      h.nome = item.nome || h.nome;
      h.tipo = item.tipo || h.tipo;
      h.quantidade = item.quantidade;
      h.samples.push({ t: agora, out: h.out, in: h.in });
      const corte = agora - cfg.janelaMs * 2;
      while (h.samples.length && h.samples[0].t < corte) h.samples.shift();
    }

    ultimo = new Map();
    for (const [k, item] of atual) ultimo.set(k, item.quantidade);
  }

  function registrar(valor, agora) {
    if (typeof valor === "number") registrarTotal(valor, agora);
    else registrarItens(valor, agora);
  }

  function resumo(agora) {
    if (modo === "total") {
      const taxa = porHoraTotal(agora);
      return {
        itens: [],
        quantidade: totalAmostras.length ? totalAmostras[totalAmostras.length - 1].v : 0,
        consumoHora: taxa,
        gastaHora: taxa,
        repoeHora: 0,
        gastaMin: taxa / 60,
        repoeMin: 0,
        saidas: 0,
        entradas: 0,
        janelaMin: 0,
        restanteMin: restanteTotal(agora),
        status: taxa > 0 ? "estimado" : "coletando dados",
      };
    }

    const itens = [];
    let quantidade = 0;
    let limite = null;
    let gasto = 0;
    let reposto = 0;
    let saidas = 0;
    let entradas = 0;
    let janelaMax = 0;
    let temLoot = false;
    let temEsgotado = false;
    let temColetando = false;

    for (const h of registros.values()) {
      if (!h.used && !conhecido(h.id)) continue;
      const janela = h.samples.filter((a) => a.t >= agora - cfg.janelaMs);
      const primeiro = janela[0];
      const ultimoItem = janela[janela.length - 1];
      const elapsed = primeiro && ultimoItem ? ultimoItem.t - primeiro.t : 0;
      const spent = primeiro && ultimoItem ? h.out - primeiro.out : 0;
      const gained = primeiro && ultimoItem ? h.in - primeiro.in : 0;
      const net = spent - gained;
      const gastoMin = elapsed > 0 ? spent * 60000 / elapsed : 0;
      const repoeMin = elapsed > 0 ? gained * 60000 / elapsed : 0;
      const gastoHora = gastoMin * 60;
      const repoeHora = repoeMin * 60;

      let status;
      let restanteMin = null;
      if (h.quantidade === 0 && h.used) {
        status = "esgotado";
        restanteMin = 0;
        temEsgotado = true;
      } else if (h.used && agora - h.lastLoss > cfg.recenteMs) {
        status = "sem gasto recente";
      } else if (elapsed < cfg.minimoMs || spent < cfg.minimoConsumo) {
        status = "coletando dados";
        temColetando = true;
      } else if (net <= 0) {
        status = "loot repõe";
        temLoot = true;
      } else {
        status = "estimado";
        const porMinuto = net / (elapsed / 60000);
        restanteMin = porMinuto > 0 ? h.quantidade / porMinuto : null;
        if (restanteMin !== null && (limite === null || restanteMin < limite)) {
          limite = restanteMin;
        }
      }

      quantidade += h.quantidade;
      gasto += gastoHora;
      reposto += repoeHora;
      saidas += spent;
      entradas += gained;
      janelaMax = Math.max(janelaMax, elapsed / 60000);
      itens.push({
        id: h.id,
        nome: h.nome,
        tipo: h.tipo,
        quantidade: h.quantidade,
        status: status,
        gastaHora: gastoHora,
        repoeHora: repoeHora,
        gastaMin: gastoMin,
        repoeMin: repoeMin,
        saidas: spent,
        entradas: gained,
        janelaMin: elapsed / 60000,
        restanteMin: restanteMin,
      });
    }

    let status = "coletando dados";
    if (temEsgotado) status = "esgotado";
    else if (limite !== null) status = "estimado";
    else if (temLoot) status = "loot repõe";
    else if (!temColetando && itens.length && itens.every((i) => i.status === "sem gasto recente")) {
      status = "sem gasto recente";
    }

    return {
      itens: itens,
      quantidade: quantidade,
      consumoHora: Math.max(0, gasto - reposto),
      gastaHora: gasto,
      repoeHora: reposto,
      gastaMin: gasto / 60,
      repoeMin: reposto / 60,
      saidas: saidas,
      entradas: entradas,
      janelaMin: janelaMax,
      restanteMin: limite,
      status: status,
    };
  }

  function porHoraTotal(agora) {
    const j = totalAmostras.filter((a) => a.t >= agora - cfg.janelaMs);
    if (j.length < 2) return 0;
    const span = j[j.length - 1].t - j[0].t;
    const consumo = j[0].v - j[j.length - 1].v;
    if (span < cfg.minimoMs || consumo < cfg.minimoConsumo) return 0;
    return (consumo / span) * 3600000;
  }

  function restanteTotal(agora) {
    const taxa = porHoraTotal(agora);
    if (!(taxa > 0)) return null;
    const q = totalAmostras.length ? totalAmostras[totalAmostras.length - 1].v : 0;
    return (q / taxa) * 60;
  }

  // Compatibilidade com o painel antigo e com testes numéricos.
  function porHora(agora) {
    return modo === "total" ? porHoraTotal(agora) : resumo(agora).consumoHora;
  }

  function restanteMin(quantidade, agora) {
    if (modo !== "total") return resumo(agora).restanteMin;
    const taxa = porHoraTotal(agora);
    if (!(taxa > 0)) return null;
    return ((Number(quantidade) || 0) / taxa) * 60;
  }

  function reset() {
    modo = "total";
    totalAmostras = [];
    ultimo = new Map();
    registros.clear();
  }

  function amostras() {
    return modo === "total" ? totalAmostras.slice() : [];
  }

  return {
    registrar,
    porHora,
    restanteMin,
    resumo,
    reset,
    amostras,
  };
}
