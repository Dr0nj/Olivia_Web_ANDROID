// Seguir knight: mantém o personagem na vaga da onda, com o alvo no centro do 3x3.
//
// Área real da Energy Surge vista no jogo: 2 pisos retos e depois 3 fileiras de 3
// (1,1,3,3,3), na direção em que o personagem está virado. A 4 sqm do alvo, a
// fileira 3x3 fica centrada no alvo: o knight ocupa o centro dos 9 e os dois pisos
// retos ficam atrás dele, entre o knight e quem está seguindo.
//
// Isto só escolhe a vaga e a direção. Nenhuma magia é disparada daqui.
export const DISTANCIA_ONDA = 4;

// Lados do eixo em volta do alvo: 0=leste(+x), 1=oeste(-x), 2=sul(+y), 3=norte(-y).
export const EIXOS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Direção para olhar da vaga até o alvo, no formato do cliente web:
// 0=baixo, 1=cima, 2=esquerda, 3=direita (o mesmo `a` de {t:"pc",k:"xd"}).
export const FACE_ALVO = [2, 3, 1, 0];

function passoDaFace(face) {
  if (face === 0) return [0, 1];
  if (face === 1) return [0, -1];
  if (face === 2) return [-1, 0];
  if (face === 3) return [1, 0];
  return [0, 0];
}

/** A área 1,1,3,3,3 saindo de (px,py) virada para `face` acerta (mx,my)? */
export function ondaAcerta(px, py, face, mx, my) {
  const passo = passoDaFace(face);
  const dx = passo[0];
  const dy = passo[1];
  if (!dx && !dy) return false;
  const along = (mx - px) * dx + (my - py) * dy;
  const lado = Math.abs((mx - px) * dy - (my - py) * dx);
  return along >= 1 && along <= 5 && (along <= 2 ? lado === 0 : lado <= 1);
}

/** Vaga de um lado do alvo, a `distancia` sqm (4 = 3x3 centrado no alvo). */
export function vaga(alvo, lado, distancia) {
  const d = EIXOS[lado];
  const n = Number.isFinite(distancia) ? distancia : DISTANCIA_ONDA;
  return { x: alvo.x + d[0] * n, y: alvo.y + d[1] * n };
}

export function faceDoLado(lado) {
  return Number.isInteger(lado) && lado >= 0 && lado < FACE_ALVO.length ? FACE_ALVO[lado] : -1;
}

/** Monstros vivos que a onda acerta saindo desta vaga, virada para o alvo. */
export function contarAcertos(posicao, face, monstros) {
  const lista = Array.isArray(monstros) ? monstros : [];
  let total = 0;
  for (const m of lista) {
    if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    if (ondaAcerta(posicao.x, posicao.y, face, m.x, m.y)) total += 1;
  }
  return total;
}

/** Quantos monstros ficam de cada lado da linha do feixe (o menor dos lados). */
export function equilibrio(alvo, lado, monstros) {
  const d = EIXOS[lado];
  const lista = Array.isArray(monstros) ? monstros : [];
  let esquerda = 0;
  let direita = 0;
  for (const m of lista) {
    if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) continue;
    const rx = m.x - alvo.x;
    const ry = m.y - alvo.y;
    if (Math.abs(rx) > 5 || Math.abs(ry) > 5) continue;
    const perpendicular = rx * d[1] - ry * d[0];
    if (perpendicular > 0) esquerda += 1;
    else if (perpendicular < 0) direita += 1;
  }
  return Math.min(esquerda, direita);
}

/** Vaga atrás do alvo conforme a última direção em que ele andou. */
export function ladoAtras(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return -1;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 : 0;
  return dy > 0 ? 3 : 2;
}

function podeAndar(caminavel, casa) {
  return !caminavel || caminavel(casa.x, casa.y);
}

/** Vaga válida mais perto de mim (desempate quando não há monstro na onda). */
export function ladoMaisPerto(alvo, pos, distancia, caminavel) {
  let melhor = -1;
  let custo = Infinity;
  for (let lado = 0; lado < EIXOS.length; lado += 1) {
    const casa = vaga(alvo, lado, distancia);
    if (!podeAndar(caminavel, casa)) continue;
    const d = Math.abs(casa.x - pos.x) + Math.abs(casa.y - pos.y);
    if (d < custo) {
      custo = d;
      melhor = lado;
    }
  }
  if (melhor >= 0) return melhor;
  // Todas as vagas parecem bloqueadas: escolhe a mais perto mesmo assim.
  custo = Infinity;
  for (let lado = 0; lado < EIXOS.length; lado += 1) {
    const casa = vaga(alvo, lado, distancia);
    const d = Math.abs(casa.x - pos.x) + Math.abs(casa.y - pos.y);
    if (d < custo) {
      custo = d;
      melhor = lado;
    }
  }
  return melhor;
}

/** Melhor lado para a onda: mais monstros no feixe. Se o alvo tem direção
 *  conhecida, a vaga de trás (preferido) ganha, a não ser que outro lado acerte
 *  pelo menos 2 monstros a mais. Sem monstros, usa a vaga de trás. */
export function melhorLado(alvo, pos, monstros, preferido, caminavel, distancia) {
  let melhor = -1;
  let melhorAcertos = 0;
  let melhorEquilibrio = -1;
  let melhorCusto = Infinity;

  for (let lado = 0; lado < EIXOS.length; lado += 1) {
    const casa = vaga(alvo, lado, distancia);
    if (!podeAndar(caminavel, casa)) continue;
    const acertos = contarAcertos(casa, FACE_ALVO[lado], monstros);
    if (acertos === 0) continue;
    const bal = equilibrio(alvo, lado, monstros);
    const custo = Math.abs(casa.x - pos.x) + Math.abs(casa.y - pos.y);
    if (acertos > melhorAcertos
      || (acertos === melhorAcertos && (bal > melhorEquilibrio
        || (bal === melhorEquilibrio && custo < melhorCusto)))) {
      melhor = lado;
      melhorAcertos = acertos;
      melhorEquilibrio = bal;
      melhorCusto = custo;
    }
  }

  if (preferido >= 0) {
    const casa = vaga(alvo, preferido, distancia);
    if (podeAndar(caminavel, casa)) {
      const acertos = contarAcertos(casa, FACE_ALVO[preferido], monstros);
      if (melhor < 0 || melhorAcertos < acertos + 2) return preferido;
    }
  }

  if (melhor >= 0) return melhor;
  return ladoMaisPerto(alvo, pos, distancia, caminavel);
}

/** Escolhe o lado com histerese: troca com +2 monstros de vantagem; se o lado
 *  atual não acerta ninguém e outro acerta, troca na hora. */
export function decidirLado(opcoes) {
  const cfg = opcoes || {};
  const alvo = cfg.alvo;
  const pos = cfg.pos;
  const monstros = Array.isArray(cfg.monstros) ? cfg.monstros : [];
  const ladoAtual = Number.isInteger(cfg.ladoAtual) ? cfg.ladoAtual : -1;
  const preferido = Number.isInteger(cfg.preferido) ? cfg.preferido : -1;
  const caminavel = cfg.caminavel;
  const distancia = cfg.distancia;

  const melhor = melhorLado(alvo, pos, monstros, preferido, caminavel, distancia);
  if (ladoAtual < 0 || melhor < 0 || ladoAtual === melhor) return melhor;

  // O alvo mudou de direção e a melhor vaga agora é a de trás: acompanha sem
  // esperar vantagem, para o feixe voltar a apontar para onde ele está indo.
  if (preferido >= 0 && melhor === preferido) return melhor;

  const casaAtual = vaga(alvo, ladoAtual, distancia);
  if (!podeAndar(caminavel, casaAtual)) return melhor;

  const acertosAtual = contarAcertos(casaAtual, FACE_ALVO[ladoAtual], monstros);
  const acertosMelhor = contarAcertos(vaga(alvo, melhor, distancia), FACE_ALVO[melhor], monstros);
  if (acertosMelhor === 0) return melhor;
  if (acertosAtual === 0 || acertosMelhor >= acertosAtual + 2) return melhor;
  return ladoAtual;
}
