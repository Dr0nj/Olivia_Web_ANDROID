// Escolha de alvo para ataque em área: mesma lógica do AreaAttack do desktop.
//
// O círculo de 5 SQM (raio 2,5) é a área válida da magia, centrada no ALVO, não no
// personagem. Dá para ficar mais longe que esse círculo. O jogo, porém, só segura um
// alvo dentro de 7 SQM na horizontal e 5 na vertical; fora disso o auto-alvo dele
// desfaz a troca. A lógica é pura: não chama nada do jogo.
//
// 27/11/2026 (igual ao desktop): empate desempata pelo alvo mais CENTRAL (spread) e
// "pega todos" troca com +1, furando a trava de 3 s. O desktop espera quando não tem
// alvo atual; no mobile quem escolhe o alvo é a própria Olivia (o auto-alvo do Hunt
// Assist fica desligado), então sem alvo atual ela escolhe o melhor na hora.
export const RAIO = 2.5;
export const KEEP_X = 7;
export const KEEP_Y = 5;
// Ganho mínimo para trocar: com +1 os monstros andando faziam trocar a cada 0,6 s.
export const GANHO_MIN = 2;
// Depois de uma troca, segura o alvo escolhido por esse tempo antes de reavaliar.
export const HOLD_MS = 3000;

export function distancia(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** A área da magia em volta do alvo (3-5-5-5-3) pega `outro`? */
export function naArea(alvo, outro) {
  return distancia(alvo, outro) <= RAIO;
}

/** Pontua todos os monstros conhecidos, do melhor para o pior.
 *  O círculo é sempre em volta do candidato, mesmo que ele esteja longe do personagem.
 *  `spread` = soma das distâncias até os cobertos: menor = mais central, perde menos
 *  monstro quando eles andam 1 casa. */
export function pontuar(jogador, monstros) {
  const lista = (Array.isArray(monstros) ? monstros : []).filter(function (m) {
    return m && Number.isFinite(m.x) && Number.isFinite(m.y);
  });
  const pontos = [];
  for (const candidato of lista) {
    let count = 0;
    let spread = 0;
    for (const outro of lista) {
      if (naArea(candidato, outro)) {
        count += 1;
        spread += distancia(candidato, outro);
      }
    }
    pontos.push({
      id: candidato.id,
      count: count,
      spread: spread,
      distance: jogador ? distancia(jogador, candidato) : 0,
    });
  }
  pontos.sort(function (a, b) {
    if (b.count !== a.count) return b.count - a.count;
    if (a.spread !== b.spread) return a.spread - b.spread;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.id - b.id;
  });
  return pontos;
}

/** O jogo mantém o alvo nesta janela 7x5 a partir do personagem. */
export function mantem(jogador, monstros, id) {
  if (!jogador) return false;
  const alvo = (Array.isArray(monstros) ? monstros : []).find(function (m) {
    return m && m.id === id;
  });
  if (!alvo) return false;
  return Math.abs(alvo.x - jogador.x) <= KEEP_X && Math.abs(alvo.y - jogador.y) <= KEEP_Y;
}

function dentro(jogador, m) {
  return Math.abs(m.x - jogador.x) <= KEEP_X && Math.abs(m.y - jogador.y) <= KEEP_Y;
}

/** A área em volta do monstro `id` pega TODOS os monstros da janela 7x5 do jogador?
 *  Mesmo caso do desktop: 1 monstro ficava de fora e dava para pegar todos. */
export function cobreTudo(jogador, monstros, id) {
  if (!jogador) return false;
  const lista = Array.isArray(monstros) ? monstros : [];
  const alvo = lista.find(function (m) {
    return m && m.id === id;
  });
  if (!alvo) return false;
  for (const m of lista) {
    if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    if (dentro(jogador, m) && !naArea(alvo, m)) return false;
  }
  return true;
}

/** Melhor alvo que o jogo vai segurar, ou null se não melhora o atual.
 *  Troca com +2; com +1 só se o novo pega TODOS os monstros da janela 7x5.
 *  Alvo fora da janela não é candidato: o jogo colocaria outro no lugar.
 *  Vizinhos fora da janela ainda contam no círculo.
 *  Sem alvo atual (null) escolhe o melhor: no mobile o auto-alvo do jogo está desligado.
 *  Alvo atual desconhecido (id sumiu da lista) espera, como o desktop. */
export function escolher(jogador, monstros, atualId) {
  if (!jogador) return null;
  const lista = (Array.isArray(monstros) ? monstros : []).filter(function (m) {
    return m && Number.isFinite(m.x) && Number.isFinite(m.y);
  });
  const pontos = pontuar(jogador, lista);
  if (!pontos.length) return null;
  const atual = atualId == null ? null : pontos.find(function (p) { return p.id === atualId; }) || null;
  const melhor = pontos.find(function (p) { return mantem(jogador, lista, p.id); }) || null;
  if (!melhor) return null;
  // Sem alvo atual: o mobile precisa escolher o primeiro (não tem auto-alvo do jogo).
  if (atualId == null) return melhor;
  // Alvo atual sumiu da lista: espera (desktop). Quando o cliente devolver null, escolhe.
  if (!atual) return null;
  // "Pega todos": se o atual não cobre a janela inteira e algum candidato cobre,
  // troca com +1 (ou mais). O passo() deixa esse caso furar a trava de 3 s.
  if (!cobreTudo(jogador, lista, atualId)) {
    for (const c of pontos) {
      if (c.id !== atualId && mantem(jogador, lista, c.id) &&
          cobreTudo(jogador, lista, c.id) && c.count > atual.count) return c;
    }
  }
  if (melhor.id === atualId) return null;
  const ganho = melhor.count - atual.count;
  return ganho >= GANHO_MIN ? melhor : null;
}

/** Controlador com histerese: troca no máximo uma vez a cada HOLD_MS; "pega todos" fura. */
export function criarArea(opcoes) {
  const cfg = Object.assign({ agora: () => Date.now(), holdMs: HOLD_MS }, opcoes || {});
  let alvo = null;
  let trocadoEm = 0;

  function passo(jogador, monstros, atualId, agora) {
    const quando = Number.isFinite(agora) ? agora : cfg.agora();
    const semAlvo = atualId == null;
    alvo = semAlvo ? null : atualId;
    const escolha = escolher(jogador, monstros, alvo);
    if (!escolha) return null;
    if (escolha.id === alvo) return null;
    // A trava de 3 s vale para troca comum. "Pega todos" só fura quando o atual
    // NÃO pegava a janela inteira e o escolhido passa a pegar (igual ao desktop).
    const furaHold = !semAlvo && !cobreTudo(jogador, monstros, alvo) &&
      cobreTudo(jogador, monstros, escolha.id);
    if (!semAlvo && trocadoEm !== 0 && quando - trocadoEm < cfg.holdMs && !furaHold) return null;
    alvo = escolha.id;
    trocadoEm = quando;
    return escolha;
  }

  function reset() {
    alvo = null;
    trocadoEm = 0;
  }

  return {
    passo,
    reset,
    alvo: () => alvo,
    segurando: (agora) => trocadoEm !== 0 && (Number.isFinite(agora) ? agora : cfg.agora()) - trocadoEm < cfg.holdMs,
  };
}
