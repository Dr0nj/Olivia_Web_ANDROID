// Re-target por distância: se o alvo atual ficou a mais de N sqm, escolhe o
// monstro mais próximo. A otimização de área tem prioridade e desliga esta regra
// no index (areaLigada vence).
export const RETARGET_SQM_PADRAO = 6;

function cheb(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Retorna null quando não deve trocar; ou {id,x,y,distancia,antes}.
 * `atual` precisa ter x/y além do id. `limite` é em sqm (Chebyshev).
 */
export function escolherRetarget(pos, atual, monstros, limite) {
  if (!pos || !atual || !Number.isFinite(atual.x) || !Number.isFinite(atual.y)) return null;
  const lim = Number.isFinite(Number(limite)) ? Number(limite) : RETARGET_SQM_PADRAO;
  if (lim <= 0) return null;
  const antes = cheb(pos, atual);
  if (antes <= lim) return null;

  let melhor = null;
  let melhorDist = Infinity;
  for (const m of Array.isArray(monstros) ? monstros : []) {
    if (!m || m.id === atual.id || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    const d = cheb(pos, m);
    if (d < melhorDist || (d === melhorDist && melhor && m.id < melhor.id)) {
      melhor = m;
      melhorDist = d;
    }
  }
  if (!melhor || melhorDist >= antes) return null;
  return {
    id: melhor.id,
    x: melhor.x,
    y: melhor.y,
    distancia: melhorDist,
    antes: antes,
  };
}
