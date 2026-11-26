package web.olivia;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

/**
 * Painel nativo. Não cria nó no DOM do jogo: o detector não vê nome, cor nem
 * elemento nenhum desta interface.
 */
class Painel {
    interface Acoes {
        void iniciarRota(String json, boolean repetir);
        void definirRepetir(boolean repetir);
        void parar();
        void seguir(long id);
        void ligarAntiBot(boolean ligado);
        void zerar();
        void recarregar();
        void listarJogadores(RetornoLista retorno);
        void posicaoAtual(RetornoTexto retorno);
    }

    interface RetornoLista {
        void pronto(String json);
    }

    interface RetornoTexto {
        void pronto(String texto);
    }

    private final Activity ctx;
    private final Acoes acoes;
    private final SharedPreferences prefs;
    private final LinearLayout raiz;
    private final LinearLayout corpo;
    private final TextView estado;
    private final TextView numeros;
    private final TextView contadores;
    private final TextView vida;
    private final TextView suprimentos;
    private final TextView desafio;
    private final TextView nota;
    private final CheckBox nao;
    private final CheckBox repetir;
    private final java.util.ArrayDeque<String> historico = new java.util.ArrayDeque<>();
    private LinearLayout telaHub;
    private LinearLayout telaRota;
    private EditText campoRota;
    private TextView textoRota;
    private String posAtual = "";
    private boolean recolhido = false;

    Painel(Activity ctx, Acoes acoes) {
        this.ctx = ctx;
        this.acoes = acoes;
        this.prefs = ctx.getSharedPreferences("olivia", Context.MODE_PRIVATE);

        raiz = new LinearLayout(ctx);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setBackgroundColor(Color.argb(238, 16, 26, 34));
        raiz.setPadding(d(8), d(5), d(8), d(6));

        corpo = new LinearLayout(ctx);
        corpo.setOrientation(LinearLayout.VERTICAL);

        LinearLayout topo = linha();
        TextView titulo = texto("Olivia", 11.5f, Color.rgb(207, 227, 242), true);
        estado = texto("aguardando", 9.5f, Color.rgb(159, 179, 194), false);
        TextView alternar = texto("≡", 15f, Color.rgb(159, 179, 194), false);
        alternar.setPadding(d(10), 0, d(2), 0);
        alternar.setOnClickListener(v -> {
            recolhido = !recolhido;
            corpo.setVisibility(recolhido ? View.GONE : View.VISIBLE);
        });
        topo.addView(titulo);
        LinearLayout espaco = new LinearLayout(ctx);
        espaco.setLayoutParams(new LinearLayout.LayoutParams(0, 1, 1f));
        topo.addView(espaco);
        topo.addView(estado);
        topo.addView(alternar);
        raiz.addView(topo);

        raiz.addView(corpo);

        telaHub = new LinearLayout(ctx);
        telaHub.setOrientation(LinearLayout.VERTICAL);
        corpo.addView(telaHub);

        numeros = texto("tempo 00:00 · xp/h 0", 9.5f, Color.rgb(159, 179, 194), false);
        contadores = texto("pontos 0 · voltas 0 · mortes 0", 9.5f, Color.rgb(159, 179, 194), false);
        vida = texto("nv — · vida — · mana —", 9.5f, Color.rgb(159, 179, 194), false);
        suprimentos = texto("poções —", 9.5f, Color.rgb(159, 179, 194), false);
        desafio = texto("desafio 0/0 · parada", 9.5f, Color.rgb(207, 227, 242), false);
        telaHub.addView(numeros);
        telaHub.addView(contadores);
        telaHub.addView(vida);
        telaHub.addView(suprimentos);
        telaHub.addView(desafio);

        LinearLayout desafioLinha = linha();
        desafioLinha.setPadding(0, d(4), 0, 0);
        nao = new CheckBox(ctx);
        nao.setText("Responder «Não»");
        nao.setTextSize(9.5f);
        nao.setTextColor(Color.rgb(223, 231, 238));
        nao.setChecked(prefs.getBoolean("antibot", true));
        nao.setPadding(0, 0, 0, 0);
        nao.setOnCheckedChangeListener((b, marcado) -> {
            prefs.edit().putBoolean("antibot", marcado).apply();
            acoes.ligarAntiBot(marcado);
        });
        desafioLinha.addView(nao);

        repetir = new CheckBox(ctx);
        repetir.setText("Repetir");
        repetir.setTextSize(9.5f);
        repetir.setTextColor(Color.rgb(223, 231, 238));
        repetir.setChecked(prefs.getBoolean("repetir", true));
        repetir.setPadding(d(8), 0, 0, 0);
        repetir.setOnCheckedChangeListener((b, marcado) -> {
            if (prefs.getBoolean("repetir", true) == marcado) return;
            prefs.edit().putBoolean("repetir", marcado).apply();
            acoes.definirRepetir(marcado);
        });
        desafioLinha.addView(repetir);

        telaHub.addView(desafioLinha);

        LinearLayout botoes = linha();
        botoes.setPadding(0, d(4), 0, 0);
        botoes.addView(botao("Rota", v -> abrirTelaRota()));
        botoes.addView(botao("Seguir", v -> dialogoSeguir()));
        botoes.addView(botao("Parar", v -> acoes.parar()));
        telaHub.addView(botoes);

        LinearLayout rodape = linha();
        rodape.setPadding(0, d(3), 0, 0);
        nota = texto("", 8.8f, Color.rgb(111, 138, 156), false);
        nota.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        nota.setOnClickListener(v -> dialogoLog());
        rodape.addView(nota);
        rodape.addView(botao("zerar", v -> acoes.zerar()));
        rodape.addView(botao("log", v -> dialogoLog()));
        rodape.addView(botao("web", v -> dialogoRecarregar()));
        telaHub.addView(rodape);

        telaRota = montarTelaRota();
        corpo.addView(telaRota);
    }

    View raiz() {
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.gravity = Gravity.TOP | Gravity.START;
        p.setMargins(d(4), d(4), 0, 0);
        raiz.setLayoutParams(p);
        return raiz;
    }

    private LinearLayout montarTelaRota() {
        LinearLayout tela = new LinearLayout(ctx);
        tela.setOrientation(LinearLayout.VERTICAL);

        textoRota = texto("0 pontos", 9.5f, Color.rgb(207, 227, 242), false);
        tela.addView(textoRota);

        LinearLayout primeira = linha();
        primeira.setPadding(0, d(4), 0, 0);
        primeira.addView(botao("Marcar aqui", v -> marcarPontoAtual()));
        primeira.addView(botao("Desfazer", v -> desfazerPonto()));
        tela.addView(primeira);

        campoRota = new EditText(ctx);
        campoRota.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        campoRota.setTypeface(Typeface.MONOSPACE);
        campoRota.setTextSize(10.5f);
        campoRota.setMinLines(2);
        campoRota.setMaxLines(4);
        campoRota.setMinWidth(d(210));
        campoRota.setHint("[[128,96],[130,99]]");
        LinearLayout.LayoutParams pc = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pc.topMargin = d(4);
        tela.addView(campoRota, pc);

        LinearLayout linha1 = linha();
        linha1.setPadding(0, d(3), 0, 0);
        linha1.addView(botao("Salvar…", v -> dialogoSalvarRota()));
        linha1.addView(botao("Abrir…", v -> dialogoRotasSalvas()));
        linha1.addView(botao("Limpar", v -> limparRota()));
        tela.addView(linha1);

        LinearLayout linha2 = linha();
        linha2.setPadding(0, d(3), 0, 0);
        linha2.addView(botao("Iniciar", v -> iniciarRotaDaTela()));
        linha2.addView(botao("Voltar", v -> voltarHub()));
        tela.addView(linha2);

        TextView dica = texto("Ande e toque em Marcar aqui; o último ponto deve ficar perto do primeiro.",
                8.4f, Color.rgb(111, 138, 156), false);
        dica.setPadding(0, d(3), 0, 0);
        tela.addView(dica);

        tela.setVisibility(View.GONE);
        return tela;
    }

    private void abrirTelaRota() {
        if (telaRota == null) return;
        if (campoRota.getText().toString().trim().isEmpty()) {
            String ultima = prefs.getString("rota", "");
            if ("[[33000,32000]]".equals(ultima)) ultima = "";
            campoRota.setText(ultima.isEmpty() ? posAtual : ultima);
        }
        atualizarTextoRota();
        telaHub.setVisibility(View.GONE);
        telaRota.setVisibility(View.VISIBLE);
    }

    private void voltarHub() {
        if (telaRota == null) return;
        telaRota.setVisibility(View.GONE);
        telaHub.setVisibility(View.VISIBLE);
    }

    private void atualizarTextoRota() {
        if (textoRota == null || campoRota == null) return;
        int n;
        try {
            n = new JSONArray(campoRota.getText().toString().trim()).length();
        } catch (Exception e) {
            n = 0;
        }
        textoRota.setText(n + (n == 1 ? " ponto" : " pontos")
                + (n == 0 ? " · ande e marque" : " · toque em Iniciar"));
    }

    private void limparRota() {
        campoRota.setText("");
        prefs.edit().remove("rota").apply();
        atualizarTextoRota();
    }

    private void marcarPontoAtual() {
        acoes.posicaoAtual(texto -> {
            JSONArray lista;
            try {
                lista = new JSONArray(campoRota.getText().toString().trim());
            } catch (Exception e) {
                lista = new JSONArray();
            }
            try {
                JSONArray ponto = new JSONArray(texto);
                if (lista.length() > 0) {
                    JSONArray ultimo = lista.optJSONArray(lista.length() - 1);
                    if (ultimo != null
                            && ultimo.optInt(0) == ponto.getInt(0)
                            && ultimo.optInt(1) == ponto.getInt(1)) {
                        nota("mesmo ponto do anterior");
                        return;
                    }
                }
                lista.put(ponto);
                campoRota.setText(lista.toString());
                campoRota.setSelection(campoRota.getText().length());
                atualizarTextoRota();
                nota("ponto " + ponto.getInt(0) + "," + ponto.getInt(1) + " marcado");
            } catch (Exception e) {
                nota("posição indisponível (fora do jogo?)");
            }
        });
    }

    private void desfazerPonto() {
        JSONArray lista;
        try {
            lista = new JSONArray(campoRota.getText().toString().trim());
        } catch (Exception e) {
            nota("rota vazia");
            return;
        }
        if (lista.length() == 0) {
            nota("nada para desfazer");
            return;
        }
        int x = lista.optJSONArray(lista.length() - 1) != null ? lista.optJSONArray(lista.length() - 1).optInt(0, -1) : -1;
        int y = lista.optJSONArray(lista.length() - 1) != null ? lista.optJSONArray(lista.length() - 1).optInt(1, -1) : -1;
        lista.remove(lista.length() - 1);
        campoRota.setText(lista.toString());
        campoRota.setSelection(campoRota.getText().length());
        atualizarTextoRota();
        nota("removeu " + x + "," + y);
    }

    private void iniciarRotaDaTela() {
        String bruto = campoRota.getText().toString().trim();
        try {
            JSONArray lista = new JSONArray(bruto);
            if (lista.length() == 0) throw new Exception("rota vazia");
            String normal = lista.toString();
            prefs.edit().putString("rota", normal).apply();
            acoes.iniciarRota(normal, repetir.isChecked());
            voltarHub();
            nota("rota com " + lista.length() + " pontos" + (repetir.isChecked() ? " · repetindo" : ""));
        } catch (Exception e) {
            nota("rota inválida: " + e.getMessage());
        }
    }

    void atualizar(JSONObject s) {
        try {
            String modo = s.optString("modo", "parada");
            JSONObject rota = s.optJSONObject("rota");
            JSONObject sessao = s.optJSONObject("sessao");
            JSONObject jogo = s.optJSONObject("jogo");
            JSONObject antibot = s.optJSONObject("antibot");
            JSONObject sup = s.optJSONObject("suprimentos");

            estado.setText("seguir".equals(modo) && s.has("seguir") && !s.isNull("seguir")
                    ? "seguindo " + s.optString("seguir")
                    : modo);

            if (rota != null) {
                int total = rota.optInt("total", 0);
                int indice = Math.min(rota.optInt("indice", 0) + 1, total);
                String situacao = rota.optString("situacao", "");
                int volta = rota.optInt("volta", 0);
                String alvo = total > 0
                        ? " · ponto " + indice + "/" + total + " · volta " + volta
                        : "";
                long pausa = s.optLong("pausa", 0);
                String espera = pausa > 0 ? " · pausa " + Math.round(pausa / 1000.0) + "s" : "";
                desafio.setText("desafio " + (sessao != null ? sessao.optInt("antiBot", 0) : 0)
                        + "/" + (sessao != null ? sessao.optInt("janelas", 0) : 0)
                        + alvo + (situacao.isEmpty() ? "" : " · " + situacao)
                        + espera);
                if (rota.optInt("total", 0) > 0
                        && repetir.isChecked() != rota.optBoolean("repetir", true)) {
                    repetir.setChecked(rota.optBoolean("repetir", true));
                }
            }

            if (jogo != null) {
                String stam = "";
                double est = jogo.optDouble("estamina", Double.NaN);
                if (!Double.isNaN(est)) {
                    stam = " · " + String.format(Locale.getDefault(), "%.1f", est) + "h";
                }
                String nv = jogo.has("nivel") && !jogo.isNull("nivel") ? "nv " + jogo.optInt("nivel", 0) : "nv —";
                vida.setText(nv
                        + " · vida " + jogo.optInt("vida", 0) + "/" + jogo.optInt("vidaMax", 0)
                        + " · mana " + jogo.optInt("mana", 0) + "/" + jogo.optInt("manaMax", 0)
                        + stam
                        + (jogo.optBoolean("vivo", true) ? "" : " · MORTO"));
                if (jogo.optBoolean("emJogo", false) && "fora do jogo".equals(nota.getText().toString())) {
                    nota.setText("");
                }
            }

            if (sessao != null) {
                String onde = "";
                if (jogo != null) {
                    JSONObject pos = jogo.optJSONObject("pos");
                    if (pos != null) {
                        onde = " · " + pos.optInt("x", 0) + "," + pos.optInt("y", 0);
                        posAtual = "[[" + pos.optInt("x", 0) + "," + pos.optInt("y", 0) + "]]";
                    }
                }
                numeros.setText("tempo " + tempo(sessao.optLong("duracaoMs", 0))
                        + " · xp/h " + String.format(Locale.getDefault(), "%,d", sessao.optLong("xpHora", 0))
                        + onde);
                contadores.setText("pontos " + sessao.optInt("pontos", 0)
                        + " · voltas " + sessao.optInt("voltas", 0)
                        + " · mortes " + sessao.optInt("mortes", 0));
            }

            if (sup != null) {
                String resto = "";
                double min = sup.optDouble("restanteMin", -1);
                if (min > 0 && !sup.isNull("restanteMin")) {
                    resto = min >= 60
                            ? " · ~" + String.format(Locale.getDefault(), "%.1f", min / 60.0) + "h"
                            : " · ~" + Math.round(min) + "min";
                }
                suprimentos.setText("poções " + sup.optInt("vida", 0) + " vida · "
                        + sup.optInt("mana", 0) + " mana"
                        + " · " + sup.optInt("itens", 0) + " itens" + resto);
            }

            if (antibot != null) {
                boolean ligado = antibot.optBoolean("ligado", true);
                if (nao.isChecked() != ligado) nao.setChecked(ligado);
            }

            if (jogo != null && !jogo.optBoolean("emJogo", false)) {
                nota.setText("fora do jogo");
            }
        } catch (Exception e) {
            nota.setText("estado inválido");
        }
    }

    void nota(String texto) {
        nota.setText(texto);
    }

    void evento(String json) {
        try {
            JSONObject e = new JSONObject(json);
            String nome = e.optString("nome", "");
            if (nome.isEmpty()) return;
            nota.setText(nome);
            String detalhe = resumo(e);
            historico.addLast(hora() + "  " + nome + detalhe);
            while (historico.size() > 60) historico.removeFirst();
        } catch (Exception ignorado) {
        }
    }

    private String resumo(JSONObject e) {
        StringBuilder sb = new StringBuilder();
        String[] chaves = {"motivo", "total", "indice", "volta", "tentativa", "alvo", "ms", "id", "chave"};
        for (String k : chaves) {
            if (!e.has(k) || e.isNull(k)) continue;
            String v = String.valueOf(e.opt(k));
            if (v.isEmpty() || v.equals("{}")) continue;
            sb.append(sb.length() == 0 ? "  " : " ").append(k).append("=").append(v);
        }
        return sb.toString();
    }

    private String hora() {
        return new java.text.SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new java.util.Date());
    }

    private void dialogoLog() {
        String texto;
        if (historico.isEmpty()) {
            texto = "sem eventos ainda";
        } else {
            StringBuilder sb = new StringBuilder();
            for (String l : historico) sb.append(l).append('\n');
            texto = sb.toString().trim();
        }

        TextView corpoLog = new TextView(ctx);
        corpoLog.setText(texto);
        corpoLog.setTextSize(10f);
        corpoLog.setTypeface(Typeface.MONOSPACE);
        corpoLog.setTextIsSelectable(true);
        int pad = d(12);
        corpoLog.setPadding(pad, pad, pad, pad);

        android.widget.ScrollView rolagem = new android.widget.ScrollView(ctx);
        rolagem.addView(corpoLog);

        new AlertDialog.Builder(ctx)
                .setTitle("Eventos")
                .setView(rolagem)
                .setPositiveButton("Fechar", null)
                .setNeutralButton("limpar", (d, w) -> historico.clear())
                .show();
    }

    private void dialogoRecarregar() {
        new AlertDialog.Builder(ctx)
                .setTitle("Recarregar o jogo?")
                .setMessage("O cliente web não guarda a sessão: recarregar pede login de novo.")
                .setPositiveButton("Recarregar", (d, w) -> acoes.recarregar())
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private JSONObject lerRotas() {
        try {
            return new JSONObject(prefs.getString("rotas", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private void dialogoSalvarRota() {
        EditText nome = new EditText(ctx);
        nome.setTextSize(13f);
        nome.setSingleLine(true);
        nome.setHint("nome da rota");
        int pad = d(16);
        nome.setPadding(pad, pad, pad, pad);

        new AlertDialog.Builder(ctx)
                .setTitle("Salvar rota")
                .setView(nome)
                .setPositiveButton("Salvar", (d, w) -> {
                    String n = nome.getText().toString().trim();
                    if (n.isEmpty()) {
                        nota("nome vazio");
                        return;
                    }
                    String json;
                    try {
                        JSONArray lista = new JSONArray(campoRota.getText().toString().trim());
                        if (lista.length() == 0) throw new Exception("vazia");
                        json = lista.toString();
                    } catch (Exception e) {
                        nota("rota inválida: " + e.getMessage());
                        return;
                    }
                    JSONObject todas = lerRotas();
                    try {
                        todas.put(n, json);
                        prefs.edit().putString("rotas", todas.toString()).apply();
                        nota("rota \"" + n + "\" salva (" + new JSONArray(json).length() + " pontos)");
                        voltarHub();
                    } catch (Exception e) {
                        nota("não consegui salvar");
                    }
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void dialogoRotasSalvas() {
        JSONObject todas = lerRotas();
        if (todas.length() == 0) {
            nota("nenhuma rota salva ainda");
            return;
        }

        List<String> nomes = new ArrayList<>();
        Iterator<String> chaves = todas.keys();
        while (chaves.hasNext()) nomes.add(chaves.next());
        java.util.Collections.sort(nomes);

        new AlertDialog.Builder(ctx)
                .setTitle("Rotas salvas")
                .setItems(nomes.toArray(new String[0]), (d, i) -> dialogoRotaSalva(nomes.get(i)))
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void dialogoRotaSalva(String nome) {
        final String json = lerRotas().optString(nome, "");
        if (json.isEmpty()) {
            nota("rota vazia");
            return;
        }
        int pontos;
        try {
            pontos = new JSONArray(json).length();
        } catch (Exception e) {
            pontos = 0;
        }

        new AlertDialog.Builder(ctx)
                .setTitle(nome)
                .setMessage(pontos + " pontos\n" + json)
                .setPositiveButton("Usar", (d, w) -> {
                    campoRota.setText(json);
                    campoRota.setSelection(json.length());
                    atualizarTextoRota();
                    nota("rota \"" + nome + "\" carregada");
                })
                .setNeutralButton("Apagar", (d, w) -> confirmarApagarRota(nome))
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void confirmarApagarRota(String nome) {
        new AlertDialog.Builder(ctx)
                .setTitle("Apagar \"" + nome + "\"?")
                .setPositiveButton("Apagar", (d, w) -> {
                    JSONObject todas = lerRotas();
                    todas.remove(nome);
                    prefs.edit().putString("rotas", todas.toString()).apply();
                    nota("rota \"" + nome + "\" apagada");
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void dialogoSeguir() {
        acoes.listarJogadores(json -> {
            JSONArray lista;
            try {
                lista = new JSONArray(json);
            } catch (Exception e) {
                lista = new JSONArray();
            }
            if (lista.length() == 0) {
                nota("ninguém por perto");
                dialogoSeguirManual();
                return;
            }

            final String[] rotulos = new String[lista.length()];
            final long[] ids = new long[lista.length()];
            for (int i = 0; i < lista.length(); i += 1) {
                JSONObject j = lista.optJSONObject(i);
                if (j == null) continue;
                ids[i] = j.optLong("id", 0);
                String nome = j.optString("nome", "?");
                int dist = j.optInt("dist", -1);
                rotulos[i] = nome + "  (" + ids[i] + (dist >= 0 ? " · " + dist + " tiles" : "") + ")";
            }

            new AlertDialog.Builder(ctx)
                    .setTitle("Seguir jogador")
                    .setItems(rotulos, (d, i) -> {
                        if (ids[i] > 0) acoes.seguir(ids[i]);
                    })
                    .setNeutralButton("ID...", (d, w) -> dialogoSeguirManual())
                    .setNegativeButton("Cancelar", null)
                    .show();
        });
    }

    private void dialogoSeguirManual() {
        EditText campo = new EditText(ctx);
        campo.setInputType(InputType.TYPE_CLASS_NUMBER);
        campo.setTextSize(13f);
        campo.setText(prefs.getString("alvo", ""));
        campo.setHint("id do jogador");

        new AlertDialog.Builder(ctx)
                .setTitle("Seguir por ID")
                .setView(campo)
                .setPositiveButton("Seguir", (d, w) -> {
                    try {
                        long id = Long.parseLong(campo.getText().toString().trim());
                        if (id <= 0) throw new NumberFormatException();
                        prefs.edit().putString("alvo", String.valueOf(id)).apply();
                        acoes.seguir(id);
                    } catch (Exception e) {
                        nota("id inválido");
                    }
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private LinearLayout linha() {
        LinearLayout l = new LinearLayout(ctx);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        return l;
    }

    private TextView texto(String t, float tamanho, int cor, boolean negrito) {
        TextView v = new TextView(ctx);
        v.setText(t);
        v.setTextSize(tamanho);
        v.setTextColor(cor);
        if (negrito) v.setTypeface(Typeface.DEFAULT_BOLD);
        return v;
    }

    private Button botao(String t, View.OnClickListener aoClicar) {
        Button b = new Button(ctx);
        b.setText(t);
        b.setTextSize(9.5f);
        b.setAllCaps(false);
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setPadding(d(10), d(3), d(10), d(3));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(0, 0, d(4), 0);
        b.setLayoutParams(p);
        b.setOnClickListener(aoClicar);
        return b;
    }

    private int d(int dp) {
        return Math.round(dp * ctx.getResources().getDisplayMetrics().density);
    }

    private static String tempo(long ms) {
        long s = Math.max(0, ms) / 1000;
        long h = s / 3600;
        long m = (s % 3600) / 60;
        long seg = s % 60;
        if (h > 0) return String.format(Locale.getDefault(), "%d:%02d:%02d", h, m, seg);
        return String.format(Locale.getDefault(), "%02d:%02d", m, seg);
    }
}
