// Seguidor: mantém o personagem colado a um alvo (jogador). Se o alvo sair do
// alcance do cliente, espera e volta sozinho quando ele reaparece; só encerra no
// `parar()` explícito, como no desktop.
// Com "seguir knight" (onda) ligado, fica a 4 sqm do alvo, na mesma linha/coluna,
// escolhendo o lado que a área 1,1,3,3,3 acerta mais monstros e virando para o alvo.
import { DISTANCIA_ONDA, decidirLado, faceDoLado, ladoAtras, vaga } from "./onda.js";

export function criarSeguidor(opcoes) {
  const cfg = Object.assign({
    alcance: 1,
    perdaMs: 5000,
    onda: false,
    distanciaOnda: DISTANCIA_ONDA,
    intervaloOndaMs: 1000,
  }, opcoes || {});

  let alvoId = null;
  let vistoEm = 0;
  let situacao = "parada"; // parada | seguindo
  let passoEm = 0;
  // Aviso de alvo fora de vista: sai uma vez por ausência, mas não encerra o modo.
  let avisouPerda = false;

  // Estado do seguir knight.
  let ladoOnda = -1;
  let avaliadoEm = 0;
  let posAlvoAnterior = null;
  let direcaoAlvo = null;

  function seguir(id, agora) {
    alvoId = String(id);
    vistoEm = agora;
    situacao = "seguindo";
    passoEm = 0;
    avisouPerda = false;
    ladoOnda = -1;
    avaliadoEm = 0;
    posAlvoAnterior = null;
    direcaoAlvo = null;
    return true;
  }

  function parar() {
    alvoId = null;
    situacao = "parada";
    passoEm = 0;
    avisouPerda = false;
    ladoOnda = -1;
    avaliadoEm = 0;
    posAlvoAnterior = null;
    direcaoAlvo = null;
  }

  function definirAlcance(v) {
    const n = Number(v);
    cfg.alcance = Number.isFinite(n) ? Math.max(0, Math.min(8, Math.round(n))) : cfg.alcance;
    return cfg.alcance;
  }

  function definirOnda(v) {
    cfg.onda = !!v;
    ladoOnda = -1;
    avaliadoEm = 0;
    return cfg.onda;
  }

  function distancia(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  function alcanceEfetivo() {
    return cfg.onda ? cfg.distanciaOnda : cfg.alcance;
  }

  // Atualiza a direção do alvo a partir do último passo dele. Passos diagonais
  // usam o eixo dominante para não perder a referência de "atrás".
  function lembrarDirecao(alvo) {
    if (posAlvoAnterior
      && (posAlvoAnterior.x !== alvo.x || posAlvoAnterior.y !== alvo.y)) {
      const dx = alvo.x - posAlvoAnterior.x;
      const dy = alvo.y - posAlvoAnterior.y;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx || dy)) {
        direcaoAlvo = { dx: dx, dy: dy };
      }
    }
    posAlvoAnterior = { x: alvo.x, y: alvo.y };
  }

  function passoOnda(alvo, pos, entrada, agora) {
    lembrarDirecao(alvo);

    const preferido = direcaoAlvo ? ladoAtras(direcaoAlvo.dx, direcaoAlvo.dy) : -1;
    const ocupadas = new Set();
    if (Array.isArray(entrada.mobs)) {
      for (const m of entrada.mobs) {
        if (m && Number.isFinite(m.x) && Number.isFinite(m.y)) ocupadas.add(m.x + "," + m.y);
      }
    }
    const podeAndar = function (x, y) {
      if (entrada.caminavel && !entrada.caminavel(x, y)) return false;
      return !ocupadas.has(x + "," + y);
    };

    if (ladoOnda < 0 || agora >= avaliadoEm) {
      avaliadoEm = agora + cfg.intervaloOndaMs;
      ladoOnda = decidirLado({
        alvo: alvo,
        pos: pos,
        monstros: entrada.mobs,
        ladoAtual: ladoOnda,
        preferido: preferido,
        caminavel: podeAndar,
        distancia: cfg.distanciaOnda,
      });
    }

    if (ladoOnda < 0) return { acao: "esperar", motivo: "sem-vaga" };

    const casa = vaga(alvo, ladoOnda, cfg.distanciaOnda);
    const face = faceDoLado(ladoOnda);
    if (pos.x === casa.x && pos.y === casa.y) {
      return {
        acao: "esperar",
        motivo: "vaga-onda",
        face: face,
        lado: ladoOnda,
        vaga: casa,
        preferido: preferido,
      };
    }
    return {
      acao: "ir",
      x: casa.x,
      y: casa.y,
      alvo: alvoId,
      onda: true,
      lado: ladoOnda,
      face: face,
    };
  }

  // Retorna: ir | esperar | passo | perdeu (aviso único) | null
  function passo(entrada) {
    if (situacao !== "seguindo") return null;
    const agora = entrada.agora;
    const alvo = entrada.alvo;
    const pos = entrada.pos;

    if (alvo && Number.isFinite(alvo.x) && Number.isFinite(alvo.y)) {
      vistoEm = agora;
      avisouPerda = false;
      if (!pos) return { acao: "esperar", motivo: "sem-posicao" };
      if (cfg.onda) return passoOnda(alvo, pos, entrada, agora);

      const dist = distancia(pos, alvo);
      if (dist <= cfg.alcance) return { acao: "esperar", motivo: "colado" };

      // Distância 0 = no MESMO tile do alvo. O `ir` do servidor não entra no tile
      // ocupado por outro jogador (testado ao vivo), então o último sqm é por `dir`
      // (o mesmo passo do joystick/teclado), um passo curto de cada vez.
      if (cfg.alcance === 0 && dist === 1) {
        if (passoEm !== 0 && agora - passoEm < 650) return { acao: "esperar", motivo: "subindo" };
        passoEm = agora;
        return {
          acao: "passo",
          dx: Math.sign(alvo.x - pos.x),
          dy: Math.sign(alvo.y - pos.y),
          alvo: alvoId,
        };
      }

      return { acao: "ir", x: alvo.x, y: alvo.y, alvo: alvoId };
    }

    // Alvo fora de vista: NÃO encerra o seguimento. O desktop só para quando o
    // usuário desliga; aqui o modo fica ligado e volta a andar sozinho quando a
    // entidade reaparece. O `perdeu` sai uma vez só para o log avisar.
    if (!avisouPerda && agora - vistoEm > cfg.perdaMs) {
      avisouPerda = true;
      return { acao: "perdeu", alvo: alvoId, desdeMs: agora - vistoEm };
    }
    return { acao: "esperar", motivo: "alvo-fora-de-vista" };
  }

  return {
    seguir,
    parar,
    passo,
    definirAlcance,
    definirOnda,
    alcance: () => cfg.alcance,
    alcanceEfetivo: alcanceEfetivo,
    onda: () => cfg.onda,
    distanciaOnda: () => cfg.distanciaOnda,
    lado: () => ladoOnda,
    alvo: () => alvoId,
    situacao: () => situacao,
  };
}
