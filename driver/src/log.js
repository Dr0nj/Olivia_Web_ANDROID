// Registro de eventos em memória, com saída opcional (console, ponte nativa, storage).
export function criarLog(registrar, limite = 500) {
  const eventos = [];

  function evento(nome, dados) {
    const registro = Object.assign({ t: Date.now(), nome }, dados || {});
    eventos.push(registro);
    if (eventos.length > limite) eventos.shift();
    if (typeof registrar === "function") {
      try { registrar(registro); } catch (e) { /* log nunca derruba o motor */ }
    }
    return registro;
  }

  return {
    evento,
    ultimos: (n) => eventos.slice(-(n || 10)),
    todos: () => eventos.slice(),
  };
}
