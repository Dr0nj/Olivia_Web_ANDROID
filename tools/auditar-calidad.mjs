#!/usr/bin/env node
// Auditoria das regras do detector (Calidad) no red.js publicado.
// Uso: node tools/auditar-calidad.mjs [url-do-jogo]
// Sai com código 1 se alguma regra conhecida desapareceu (o detector mudou).

const JOGO = process.argv[2] || "https://lowmmorpg.com/juego/";

const REGRAS = [
  ["eventos sintéticos (isTrusted)", /isTrusted/],
  ["embrulho de WebSocket", /WebSocket\.prototype\.send|wsSend/],
  ["embrulho de JSON", /JSON\.stringify!==|JSON\.parse!==/],
  ["embrulho de canvas", /fillText!==|strokeText!==/],
  ["embrulho de addEventListener", /addEventListener!==/],
  ["embrulho de Function.toString", /F\.toString!==|fts/],
  ["ações sem input (ACC)", /ACC=new Set|ACC\s*=\s*new Set/],
  ["página oculta (document.hidden)", /document\.hidden/],
  ["painéis de bot no DOM", /cave ?bot|waypoints\?/i],
  ["cores do Olivia desktop", /ecee91|1e1816/i],
  ["diagnóstico no ping", /q:bits/],
  ["assinatura HMAC (Sello)", /Sello|hmac/i],
];

const texto = async (url) => {
  const r = await fetch(url, { headers: { "cache-control": "no-store" } });
  if (!r.ok) throw new Error(`${r.status} em ${url}`);
  return r.text();
};

const html = await texto(JOGO);
const src = (html.match(/js\/red\.js\?v=[\w.-]+/) || [])[0];
if (!src) {
  console.error("FALHA: não achei js/red.js no HTML do jogo.");
  process.exit(1);
}
const url = new URL(src, JOGO).href;
const js = await texto(url);

console.log(`red.js: ${url}`);
console.log(`tamanho: ${js.length.toLocaleString("pt-BR")} bytes\n`);

let faltando = 0;
for (const [nome, re] of REGRAS) {
  const ok = re.test(js);
  if (!ok) faltando += 1;
  console.log(`${ok ? "ok  " : "MUDOU"}  ${nome}`);
}

console.log("");
if (faltando) {
  console.log(`${faltando} regra(s) conhecida(s) não encontrada(s): revise docs/ANALISE-CLIENTE-WEB.md §5.`);
  process.exit(1);
}
console.log("Todas as regras conhecidas continuam presentes.");
