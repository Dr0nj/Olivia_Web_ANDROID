// Escolha de alvo para ataque em área: a mesma ideia do AreaAttack do desktop.
//
// O círculo de 5 SQM (raio 2,5) é a área válida da magia, centrada no ALVO, não no
// personagem. Dá para ficar mais longe que esse círculo. O jogo, porém, só segura um
// alvo dentro de 7 SQM na horizontal e 5 na vertical; fora disso o auto-alvo dele
// desfaz a troca. A lógica é pura: não chama nada do jogo.
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

/** Pontua todos os monstros conhecidos, do melhor para o pior.
 *  O círculo é sempre em volta do candidato, mesmo que ele esteja longe do personagem. */
export function pontuar(jogador, monstros) {
  const lista = (Array.isArray(monstros) ? monstros : []).filter(function (m) {
    return m && Number.isFinite(m.x) && Number.isFinite(m.y);
  });
  const pontos = [];
  for (const candidato of lista) {
    let count = 0;
    for (const outro of lista) {
      if (distancia(candidato, outro) <= RAIO) count += 1;
    }
    pontos.push({
      id: candidato.id,
      count: count,
      distance: jogador ? distancia(jogador, candidato) : 0,
    });
  }
  pontos.sort(function (a, b) {
    if (b.count !== a.count) return b.count - a.count;
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

/** Melhor alvo que o jogo vai segurar, ou null se não melhora o atual.
 *  Empate de contagem não troca. Alvo fora da janela 7x5 não é candidato: o jogo
 *  colocaria outro no lugar. Vizinhos fora da janela ainda contam no círculo. */
export function escolher(jogador, monstros, atualId) {
  if (!jogador) return null;
  const pontos = pontuar(jogador, monstros);
  if (!pontos.length) return null;
  const atual = atualId == null ? null : pontos.find(function (p) { return p.id === atualId; }) || null;
  const melhor = pontos.find(function (p) { return mantem(jogador, monstros, p.id); }) || null;
  if (!melhor) return null;
  if (atual && melhor.count < atual.count + GANHO_MIN) return null;
  return melhor;
}

/** Controlador com histerese: troca no máximo uma vez a cada HOLD_MS. */
export function criarArea(opcoes) {
  const cfg = Object.assign({ agora: () => Date.now(), holdMs: HOLD_MS }, opcoes || {});
  let alvo = null;
  let trocadoEm = 0;

  function passo(jogador, monstros, atualId, agora) {
    const quando = Number.isFinite(agora) ? agora : cfg.agora();
    if (atualId == null) {
      alvo = null;
    } else {
      alvo = atualId;
      if (trocadoEm !== 0 && quando - trocadoEm < cfg.holdMs) return null;
    }
    const escolha = escolher(jogador, monstros, alvo);
    if (!escolha) return null;
    if (escolha.id === alvo) return null;
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
