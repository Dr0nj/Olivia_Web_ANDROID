// Desvio local de monstro, inspirado no "occupied_detour" do WaypointController
// do desktop: quando o personagem não sai do lugar, a célula da frente está
// ocupada. Em vez de pular o waypoint, procura um vizinho andável que aproxime
// do destino e manda o `ir` para ele. A próxima leitura do estado reavalia.
//
// É puro: recebe `caminhavel(x,y)` e a lista de monstros. Não conhece Red/J.

const DIRECOES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function chave(x, y) {
  return x + "," + y;
}

function cheb(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Retorna o primeiro sqm de um desvio curto até um vizinho que aproxime do
 * destino, ou null se não há desvio melhor.
 * opcoes: { raio=5, passos=4, bloqueados=Set }
 */
export function planejarDesvio(pos, destino, caminhavel, monstros, opcoes) {
  if (!pos || !destino || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)
      || !Number.isFinite(destino.x) || !Number.isFinite(destino.y)) return null;
  const cfg = Object.assign({ raio: 5, passos: 4, raioMonstros: 3, bloqueados: null }, opcoes || {});
  const bloqueados = cfg.bloqueados instanceof Set ? cfg.bloqueados : new Set();
  const ocupados = new Set();
  for (const m of Array.isArray(monstros) ? monstros : []) {
    if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    if (Math.max(Math.abs(m.x - pos.x), Math.abs(m.y - pos.y)) <= cfg.raioMonstros) {
      ocupados.add(chave(m.x, m.y));
    }
  }

  const inicio = { x: Math.round(pos.x), y: Math.round(pos.y) };
  const alvo = { x: Math.round(destino.x), y: Math.round(destino.y) };
  const pode = function (x, y) {
    if (Math.abs(x - inicio.x) > cfg.raio || Math.abs(y - inicio.y) > cfg.raio) return false;
    if (x === inicio.x && y === inicio.y) return true;
    const k = chave(x, y);
    if (bloqueados.has(k) || ocupados.has(k)) return false;
    try {
      return caminhavel ? !!caminhavel(x, y) : true;
    } catch (e) {
      return true;
    }
  };

  const fila = [inicio];
  const anterior = new Map([[chave(inicio.x, inicio.y), null]]);
  const passos = new Map([[chave(inicio.x, inicio.y), 0]]);
  let melhor = null;
  let melhorNota = null;
  const nota = function (c) {
    return [cheb(c, alvo), manhattan(c, alvo), passos.get(chave(c.x, c.y))];
  };
  const menor = function (a, b) {
    if (!b) return true;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return a[i] < b[i];
    }
    return false;
  };

  while (fila.length) {
    const atual = fila.shift();
    const d = passos.get(chave(atual.x, atual.y));
    if (!(atual.x === inicio.x && atual.y === inicio.y)) {
      const n = nota(atual);
      if (menor(n, melhorNota)) {
        melhor = atual;
        melhorNota = n;
      }
    }
    if (d >= cfg.passos) continue;
    for (const [dx, dy] of DIRECOES) {
      const nx = atual.x + dx;
      const ny = atual.y + dy;
      const k = chave(nx, ny);
      if (!pode(nx, ny) || anterior.has(k)) continue;
      anterior.set(k, chave(atual.x, atual.y));
      passos.set(k, d + 1);
      fila.push({ x: nx, y: ny });
    }
  }

  if (!melhor) return null;
  const notaInicio = [cheb(inicio, alvo), manhattan(inicio, alvo), 0];
  if (!menor(melhorNota, notaInicio)) return null;

  // Reconstrói do melhor até o início e devolve o primeiro passo.
  let atual = melhor;
  let pai = anterior.get(chave(atual.x, atual.y));
  while (pai && pai !== chave(inicio.x, inicio.y)) {
    const [px, py] = pai.split(",").map(Number);
    atual = { x: px, y: py };
    pai = anterior.get(pai);
  }
  return { x: atual.x, y: atual.y };
}
