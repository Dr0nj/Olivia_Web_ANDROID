// Junta os módulos do driver em um único userscript (dist/olivia-web.user.js).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const ordem = [
  "log",
  "sessao",
  "humano",
  "caca",
  "rota",
  "onda",
  "seguidor",
  "area",
  "suprimentos",
  "antibot",
  "ponte",
  "motor",
  "painel",
  "index",
];

const corpo = ordem
  .map((nome) => readFileSync(join(raiz, "driver", "src", nome + ".js"), "utf8"))
  .join("\n\n")
  .replace(/^import[^\n]*\n/gm, "")
  .replace(/^export\s+/gm, "");

const pacote = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));

const cabecalho = `// ==UserScript==
// @name         Olivia Web
// @namespace    olivia.web
// @version      ${pacote.version}
// @description  Olivia no cliente web do LOW: desafio, rotas, ponto de caça, seguidor e sessão.
// @match        https://lowmmorpg.com/juego/*
// @match        https://*.lowmmorpg.com/juego/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
`;

mkdirSync(join(raiz, "dist"), { recursive: true });
const saida = join(raiz, "dist", "olivia-web.user.js");
writeFileSync(saida, cabecalho + "(function () {\n" + corpo + "\n})();\n", "utf8");
console.log("gerado: " + saida);
