package web.olivia;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.ScrollView;
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
    static final int LARGURA_DP = 300;

    interface Acoes {
        void iniciarRota(String json, boolean repetir, String atrasoJson);
        void definirCaca(String json);
        void definirRepetir(boolean repetir);
        void parar();
        void seguir(long id);
        void seguir(long id, int distancia);
        void seguir(long id, int distancia, boolean onda);
        void ligarOnda(boolean ligado);
        void ligarAntiBot(boolean ligado);
        void ligarAutoTarefas(boolean ligado);
        void ligarPausaHumana(boolean ligado);
        void ligarReconexao(boolean ligado);
        void ligarArea(boolean ligado);
        void ligarRtcSempre(boolean ligado);
        void otimizarArea();
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
    private TextView engrenagem;
    private View divisor;
    private final TextView statusValor;
    private final TextView statusLinha1;
    private final TextView statusLinha2;
    private final TextView xpValor;
    private final TextView xpDetalhe;
    private final TextView xpSessaoValor;
    private final TextView xpSessaoDetalhe;
    private final TextView goldValor;
    private final TextView goldDetalhe;
    private final TextView supValor;
    private final TextView supDetalhe;
    private final TextView taskValor;
    private final TextView taskDetalhe;
    private final TextView antiValor;
    private final TextView antiDetalhe;
    private final TextView staminaValor;
    private final TextView staminaDetalhe;
    private final TextView voltaValor;
    private final TextView voltaDetalhe;
    private final TextView nota;
    private CheckBox nao;
    private CheckBox repetir;
    private CheckBox autoTarefas;
    private final java.util.ArrayDeque<String> historico = new java.util.ArrayDeque<>();
    private LinearLayout telaHub;
    private LinearLayout telaRota;
    private LinearLayout telaConfig;
    private LinearLayout telaSeguir;
    private ScrollView rolagemCorpo;
    private LinearLayout listaSeguir;
    private EditText distanciaSeguir;
    private CheckBox onda;
    private TextView alvoSeguir;
    private long idSeguir = 0;
    private CheckBox reconexao;
    private EditText campoRota;
    private TextView textoRota;
    private View rodapeFixo;
    private TextView atrasoResumo;
    private TextView atrasoResumoConfig;
    private CheckBox pausaHumana;
    private CheckBox area;
    private CheckBox rtcSempre;
    private String posAtual = "";
    private boolean recolhido = false;

    Painel(Activity ctx, Acoes acoes) {
        this.ctx = ctx;
        this.acoes = acoes;
        this.prefs = ctx.getSharedPreferences("olivia", Context.MODE_PRIVATE);

        raiz = new LinearLayout(ctx);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setBackgroundResource(R.drawable.painel_fundo);
        raiz.setPadding(d(9), d(6), d(9), d(7));

        corpo = new LinearLayout(ctx);
        corpo.setOrientation(LinearLayout.VERTICAL);

        LinearLayout topo = linha();
        TextView titulo = texto("Olivia", 11.5f, Color.rgb(207, 227, 242), true);
        estado = texto("aguardando", 9.5f, Color.rgb(159, 179, 194), false);
        TextView engrenagemLocal = texto("⚙", 14f, Color.rgb(159, 179, 194), false);
        engrenagemLocal.setPadding(d(8), 0, d(2), 0);
        engrenagemLocal.setOnClickListener(v -> abrirConfig());
        engrenagem = engrenagemLocal;
        TextView alternar = texto("≡", 15f, Color.rgb(159, 179, 194), false);
        alternar.setPadding(d(10), 0, d(2), 0);
        alternar.setOnClickListener(v -> {
            recolhido = !recolhido;
            if (rolagemCorpo != null) rolagemCorpo.setVisibility(recolhido ? View.GONE : View.VISIBLE);
            else corpo.setVisibility(recolhido ? View.GONE : View.VISIBLE);
            estado.setVisibility(recolhido ? View.GONE : View.VISIBLE);
            if (engrenagem != null) engrenagem.setVisibility(recolhido ? View.GONE : View.VISIBLE);
            if (divisor != null) divisor.setVisibility(recolhido ? View.GONE : View.VISIBLE);
            if (rodapeFixo != null) rodapeFixo.setVisibility(recolhido ? View.GONE : View.VISIBLE);
            ViewGroup.LayoutParams params = raiz.getLayoutParams();
            if (params != null) {
                if (recolhido) {
                    params.width = ViewGroup.LayoutParams.WRAP_CONTENT;
                    params.height = ViewGroup.LayoutParams.WRAP_CONTENT;
                } else {
                    params.width = d(LARGURA_DP);
                    params.height = ViewGroup.LayoutParams.MATCH_PARENT;
                }
                raiz.setLayoutParams(params);
            }
            raiz.setPadding(d(recolhido ? 7 : 9), d(recolhido ? 3 : 6),
                    d(recolhido ? 7 : 9), d(recolhido ? 3 : 7));
            raiz.postDelayed(this::limitarPainel, 80);
        });
        topo.addView(titulo);
        LinearLayout espaco = new LinearLayout(ctx);
        espaco.setLayoutParams(new LinearLayout.LayoutParams(0, 1, 1f));
        topo.addView(espaco);
        topo.addView(estado);
        topo.addView(engrenagemLocal);
        topo.addView(alternar);
        raiz.addView(topo);
        tornarArrastavel(topo);

        View divisorLocal = new View(ctx);
        divisorLocal.setBackgroundColor(Color.argb(110, 58, 127, 154));
        LinearLayout.LayoutParams pd = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, d(1)));
        pd.topMargin = d(2);
        pd.bottomMargin = d(3);
        divisor = divisorLocal;
        raiz.addView(divisorLocal, pd);

        // O painel ocupa a lateral útil inteira; o conteúdo rola dentro dela.
        rolagemCorpo = new ScrollView(ctx);
        rolagemCorpo.setFillViewport(false);
        rolagemCorpo.setVerticalScrollBarEnabled(true);
        rolagemCorpo.setOverScrollMode(View.OVER_SCROLL_NEVER);
        rolagemCorpo.addView(corpo);
        LinearLayout.LayoutParams pr = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
        raiz.addView(rolagemCorpo, pr);

        // Rodapé fixo, sempre no pé da lateral.
        LinearLayout rodape = linha();
        rodape.setPadding(0, d(4), 0, 0);
        nota = texto("", 8.6f, Color.rgb(111, 138, 156), false);
        nota.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        nota.setOnClickListener(v -> dialogoLog());
        rodape.addView(nota);
        rodape.addView(botao("Log", v -> dialogoLog()));
        rodapeFixo = rodape;
        raiz.addView(rodape);

        telaHub = new LinearLayout(ctx);
        telaHub.setOrientation(LinearLayout.VERTICAL);
        corpo.addView(telaHub);

        int ciano = Color.rgb(143, 211, 255);
        int verde = Color.rgb(155, 240, 122);
        int roxo = Color.rgb(211, 159, 255);
        int amarelo = Color.rgb(242, 198, 91);
        int vermelho = Color.rgb(255, 107, 127);
        int suave = Color.rgb(159, 179, 194);

        statusValor = texto("STOPPED", 16f, suave, true);
        statusLinha1 = texto("sem rota", 9.2f, Color.rgb(207, 227, 242), false);
        statusLinha2 = texto("—", 8.2f, suave, false);
        LinearLayout cardStatus = cartao("STATUS DA ROTA", statusValor, statusLinha1, ciano);
        cardStatus.addView(statusLinha2);
        telaHub.addView(cardStatus);

        LinearLayout botoes = linha();
        botoes.setPadding(0, d(4), 0, 0);
        botoes.addView(botaoHub("Rota", v -> abrirTelaRota()));
        botoes.addView(botaoHub("Seguir jogador", v -> abrirTelaSeguir()));
        botoes.addView(botaoHub("Iniciar rota", v -> iniciarRotaSalva()));
        botoes.addView(botaoHub("Parar", v -> acoes.parar()));
        telaHub.addView(botoes);

        xpValor = texto("—", 15.5f, ciano, true);
        xpDetalhe = texto(" ", 8.2f, suave, false);
        xpSessaoValor = texto("—", 15.5f, ciano, true);
        xpSessaoDetalhe = texto(" ", 8.2f, suave, false);
        telaHub.addView(linhaCartoes(
                cartao("XP / HORA", xpValor, xpDetalhe, ciano),
                cartao("XP DA SESSÃO", xpSessaoValor, xpSessaoDetalhe, ciano)));

        goldValor = texto("—", 15.5f, verde, true);
        goldDetalhe = texto(" ", 8.2f, suave, false);
        supValor = texto("—", 15.5f, amarelo, true);
        supDetalhe = texto(" ", 8.2f, suave, false);
        telaHub.addView(linhaCartoes(
                cartao("GOLD COLETADO", goldValor, goldDetalhe, verde),
                cartao("SUPRIMENTOS", supValor, supDetalhe, amarelo)));

        taskValor = texto("—", 15.5f, roxo, true);
        taskDetalhe = texto(" ", 8.2f, suave, false);
        antiValor = texto("—", 15.5f, ciano, true);
        antiDetalhe = texto(" ", 8.2f, suave, false);
        telaHub.addView(linhaCartoes(
                cartao("TASKS", taskValor, taskDetalhe, roxo),
                cartao("ANTI-BOT", antiValor, antiDetalhe, ciano)));

        staminaValor = texto("—", 15.5f, suave, true);
        staminaDetalhe = texto(" ", 8.2f, suave, false);
        voltaValor = texto("—", 15.5f, verde, true);
        voltaDetalhe = texto(" ", 8.2f, suave, false);
        telaHub.addView(linhaCartoes(
                cartao("STAMINA", staminaValor, staminaDetalhe, suave),
                cartao("VOLTAS", voltaValor, voltaDetalhe, verde)));

        telaRota = montarTelaRota();
        corpo.addView(telaRota);

        telaConfig = montarTelaConfig();
        corpo.addView(telaConfig);

        telaSeguir = montarTelaSeguir();
        corpo.addView(telaSeguir);
    }

    private LinearLayout montarTelaSeguir() {
        LinearLayout tela = new LinearLayout(ctx);
        tela.setOrientation(LinearLayout.VERTICAL);
        tela.addView(texto("Seguir jogador", 10.5f, Color.rgb(207, 227, 242), true));
        tela.addView(texto("Jogadores por perto (toque para escolher):",
                8.5f, Color.rgb(111, 138, 156), false));

        listaSeguir = new LinearLayout(ctx);
        listaSeguir.setOrientation(LinearLayout.VERTICAL);
        android.widget.ScrollView rolagem = new android.widget.ScrollView(ctx);
        rolagem.addView(listaSeguir);
        LinearLayout.LayoutParams pr = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, d(104));
        tela.addView(rolagem, pr);

        alvoSeguir = texto("ninguém escolhido", 9.5f, Color.rgb(159, 179, 194), false);
        tela.addView(alvoSeguir);

        LinearLayout linhaDist = linha();
        linhaDist.setPadding(0, d(4), 0, 0);
        linhaDist.addView(texto("distância", 9.5f, Color.rgb(159, 179, 194), false));
        distanciaSeguir = new EditText(ctx);
        distanciaSeguir.setInputType(InputType.TYPE_CLASS_NUMBER);
        distanciaSeguir.setSingleLine(true);
        distanciaSeguir.setTextSize(12f);
        distanciaSeguir.setText(prefs.getInt("seguirSqm", 2) + "");
        distanciaSeguir.setLayoutParams(new LinearLayout.LayoutParams(d(44), ViewGroup.LayoutParams.WRAP_CONTENT));
        linhaDist.addView(distanciaSeguir);
        linhaDist.addView(texto("sqm (0 = mesmo tile)", 9.5f, Color.rgb(159, 179, 194), false));
        tela.addView(linhaDist);

        onda = new CheckBox(ctx);
        estilizarCaixa(onda);
        onda.setText("Seguir knight (onda 4 sqm)");
        onda.setTextSize(9.5f);
        onda.setTextColor(Color.rgb(223, 231, 238));
        onda.setChecked(prefs.getBoolean("seguirOnda", false));
        onda.setPadding(0, d(4), 0, 0);
        onda.setOnCheckedChangeListener((b, marcado) -> {
            prefs.edit().putBoolean("seguirOnda", marcado).apply();
            distanciaSeguir.setEnabled(!marcado);
            if (marcado) distanciaSeguir.setText("4");
            acoes.ligarOnda(marcado);
            nota(marcado ? "seguir knight ligado (vaga da onda)" : "seguir knight desligado");
        });
        tela.addView(onda);
        tela.addView(texto("Fica 4 sqm atrás do alvo, com ele no centro do 3x3 da onda.\n"
                + "Escolhe o lado que mais acerta monstros e vira para o alvo.",
                8.5f, Color.rgb(111, 138, 156), false));
        if (onda.isChecked()) {
            distanciaSeguir.setText("4");
            distanciaSeguir.setEnabled(false);
        }

        LinearLayout acoesSeguir = linha();
        acoesSeguir.setPadding(0, d(4), 0, 0);
        acoesSeguir.addView(botao("Atualizar", v -> carregarJogadores()));
        acoesSeguir.addView(botao("Seguir", v -> seguirSelecionado()));
        acoesSeguir.addView(botao("Parar", v -> acoes.parar()));
        tela.addView(acoesSeguir);

        LinearLayout volta = linha();
        volta.setPadding(0, d(4), 0, 0);
        volta.addView(botao("Voltar", v -> voltarHub()));
        tela.addView(volta);

        tela.setVisibility(View.GONE);
        return tela;
    }

    private void abrirTelaSeguir() {
        if (telaSeguir == null) return;
        telaHub.setVisibility(View.GONE);
        if (telaRota != null) telaRota.setVisibility(View.GONE);
        if (telaConfig != null) telaConfig.setVisibility(View.GONE);
        telaSeguir.setVisibility(View.VISIBLE);
        carregarJogadores();
    }

    private void carregarJogadores() {
        if (listaSeguir == null) return;
        listaSeguir.removeAllViews();
        acoes.listarJogadores(json -> {
            JSONArray lista;
            try {
                lista = new JSONArray(json);
            } catch (Exception e) {
                lista = new JSONArray();
            }
            listaSeguir.removeAllViews();
            if (lista.length() == 0) {
                listaSeguir.addView(texto("ninguém por perto", 9f, Color.rgb(111, 138, 156), false));
                return;
            }
            for (int i = 0; i < lista.length(); i += 1) {
                JSONObject j = lista.optJSONObject(i);
                if (j == null) continue;
                final long id = j.optLong("id", 0);
                final String nome = j.optString("nome", "?");
                int dist = j.optInt("dist", -1);
                String rotulo = nome + "  (" + id + (dist >= 0 ? " · " + dist + " sqm" : "") + ")";
                Button b = botao(rotulo, v -> {
                    idSeguir = id;
                    alvoSeguir.setText("alvo: " + nome + " (" + id + ")");
                    nota("alvo " + nome);
                });
                LinearLayout.LayoutParams pb = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                pb.bottomMargin = d(2);
                b.setLayoutParams(pb);
                listaSeguir.addView(b);
            }
        });
    }

    private void seguirSelecionado() {
        if (idSeguir <= 0) {
            nota("escolha um jogador na lista");
            return;
        }
        int sqm;
        try {
            sqm = Integer.parseInt(distanciaSeguir.getText().toString().trim());
        } catch (Exception e) {
            sqm = 2;
        }
        boolean knight = onda != null && onda.isChecked();
        sqm = knight ? 4 : Math.max(0, Math.min(8, sqm));
        prefs.edit().putInt("seguirSqm", sqm).apply();
        acoes.seguir(idSeguir, sqm, knight);
        voltarHub();
        nota("seguindo " + idSeguir + " · " + sqm + " sqm" + (knight ? " (onda)" : ""));
    }

    private LinearLayout montarTelaConfig() {
        LinearLayout tela = new LinearLayout(ctx);
        tela.setOrientation(LinearLayout.VERTICAL);

        tela.addView(texto("Configurações", 10.5f, Color.rgb(207, 227, 242), true));

        nao = new CheckBox(ctx);
        estilizarCaixa(nao);
        nao.setText("Responder «Não» no anti-bot");
        nao.setTextSize(9.5f);
        nao.setTextColor(Color.rgb(223, 231, 238));
        nao.setChecked(prefs.getBoolean("antibot", true));
        nao.setPadding(0, d(2), 0, 0);
        nao.setOnCheckedChangeListener((b, marcado) -> {
            prefs.edit().putBoolean("antibot", marcado).apply();
            acoes.ligarAntiBot(marcado);
        });
        tela.addView(nao);

        repetir = new CheckBox(ctx);
        estilizarCaixa(repetir);
        repetir.setText("Repetir a rota (laço)");
        repetir.setTextSize(9.5f);
        repetir.setTextColor(Color.rgb(223, 231, 238));
        repetir.setChecked(prefs.getBoolean("repetir", true));
        repetir.setPadding(0, 0, 0, 0);
        repetir.setOnCheckedChangeListener((b, marcado) -> {
            if (prefs.getBoolean("repetir", true) == marcado) return;
            prefs.edit().putBoolean("repetir", marcado).apply();
            acoes.definirRepetir(marcado);
        });
        tela.addView(repetir);

        autoTarefas = new CheckBox(ctx);
        estilizarCaixa(autoTarefas);
        autoTarefas.setText("Repetir tasks e aceitar missões");
        autoTarefas.setTextSize(9.5f);
        autoTarefas.setTextColor(Color.rgb(223, 231, 238));
        autoTarefas.setChecked(prefs.getBoolean("autoTarefas", true));
        autoTarefas.setPadding(0, 0, 0, 0);
        autoTarefas.setOnCheckedChangeListener((b, marcado) -> {
            prefs.edit().putBoolean("autoTarefas", marcado).apply();
            acoes.ligarAutoTarefas(marcado);
        });
        tela.addView(autoTarefas);

        pausaHumana = new CheckBox(ctx);
        estilizarCaixa(pausaHumana);
        pausaHumana.setText("Pausas humanas");
        pausaHumana.setTextSize(9.5f);
        pausaHumana.setTextColor(Color.rgb(223, 231, 238));
        pausaHumana.setChecked(prefs.getBoolean("pausaHumana", true));
        pausaHumana.setPadding(0, d(2), 0, 0);
        pausaHumana.setOnCheckedChangeListener((b, marcado) -> {
            prefs.edit().putBoolean("pausaHumana", marcado).apply();
            acoes.ligarPausaHumana(marcado);
            nota(marcado ? "pausas humanas ligadas" : "pausas humanas desligadas");
        });
        tela.addView(pausaHumana);
        tela.addView(texto("Pausas longas de 8–20 s a cada 15–25 min (não vale no seguir).",
                8.5f, Color.rgb(111, 138, 156), false));

        reconexao = new CheckBox(ctx);
        estilizarCaixa(reconexao);
        reconexao.setText("Reconectar automaticamente");
        reconexao.setTextSize(9.5f);
        reconexao.setTextColor(Color.rgb(223, 231, 238));
        reconexao.setChecked(prefs.getBoolean("reconexao", true));
        reconexao.setPadding(0, d(2), 0, 0);
        reconexao.setOnCheckedChangeListener((b, marcado) -> {
            prefs.edit().putBoolean("reconexao", marcado).apply();
            acoes.ligarReconexao(marcado);
        });
        tela.addView(reconexao);
        tela.addView(texto("Se o WebSocket cair, tenta reconectar a cada 15 s (mesmo personagem).",
                8.5f, Color.rgb(111, 138, 156), false));

        LinearLayout linhaAtraso = linha();
        linhaAtraso.setPadding(0, d(5), 0, 0);
        linhaAtraso.addView(botao("Atraso entre waypoints…", v -> dialogoAtraso()));
        atrasoResumoConfig = texto("sem atraso", 9.5f, Color.rgb(159, 179, 194), false);
        atrasoResumoConfig.setPadding(d(6), 0, 0, 0);
        linhaAtraso.addView(atrasoResumoConfig);
        tela.addView(linhaAtraso);
        tela.addView(texto("Exato usa o \"de\"; aleatório sorteia entre \"de\" e \"até\".",
                8.5f, Color.rgb(111, 138, 156), false));

        area = new CheckBox(ctx);
        estilizarCaixa(area);
        area.setText("Otimizar ataque em área");
        area.setTextSize(9.5f);
        area.setTextColor(Color.rgb(223, 231, 238));
        area.setChecked(prefs.getBoolean("area", false));
        area.setPadding(0, d(5), 0, 0);
        area.setOnCheckedChangeListener((b, marcado) -> {
            prefs.edit().putBoolean("area", marcado).apply();
            acoes.ligarArea(marcado);
            nota(marcado ? "área ligada (círculo de 5 sqm)" : "área desligada");
        });
        tela.addView(area);
        tela.addView(texto("Círculo de 5 sqm (raio 2,5) centrado no alvo: escolhe o monstro\n"
                + "que cobre mais monstros. Só troca com +2 e segura 3 s. Usa as skills do\n"
                + "Hunt Assist (o alvo sozinho do jogo fica desligado).",
                8.5f, Color.rgb(111, 138, 156), false));

        rtcSempre = new CheckBox(ctx);
        estilizarCaixa(rtcSempre);
        rtcSempre.setText("Manter RTC sempre ligado");
        rtcSempre.setTextSize(9.5f);
        rtcSempre.setTextColor(Color.rgb(223, 231, 238));
        rtcSempre.setChecked(prefs.getBoolean("rtcSempre", false));
        rtcSempre.setPadding(0, d(5), 0, 0);
        rtcSempre.setOnCheckedChangeListener((b, marcado) -> {
            prefs.edit().putBoolean("rtcSempre", marcado).apply();
            acoes.ligarRtcSempre(marcado);
            nota(marcado ? "RTC será mantido ligado" : "RTC não será mais forçado");
        });
        tela.addView(rtcSempre);
        tela.addView(texto("Se o jogo desligar o RTC, o Olivia liga de novo usando a mesma\n"
                + "API do botão RTC. Não interfere enquanto o menu do jogo está aberto.",
                8.5f, Color.rgb(111, 138, 156), false));

        LinearLayout ferramentas = linha();
        ferramentas.setPadding(0, d(6), 0, 0);
        ferramentas.addView(botao("Resetar sessão", v -> acoes.zerar()));
        ferramentas.addView(botao("Log", v -> dialogoLog()));
        tela.addView(ferramentas);

        LinearLayout volta = linha();
        volta.setPadding(0, d(5), 0, 0);
        volta.addView(botao("Voltar", v -> voltarHub()));
        tela.addView(volta);

        tela.setVisibility(View.GONE);
        return tela;
    }

    View raiz() {
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(
                d(LARGURA_DP), ViewGroup.LayoutParams.MATCH_PARENT);
        p.gravity = Gravity.TOP | Gravity.START;
        p.setMargins(d(4), d(4), 0, d(4));
        raiz.setLayoutParams(p);
        raiz.postDelayed(this::restaurarPosicao, 300);
        return raiz;
    }

    /** Permite arrastar o painel pela faixa do cabeçalho (aberto ou recolhido). */
    private void tornarArrastavel(final View alca) {
        alca.setOnTouchListener(new View.OnTouchListener() {
            private float inicioX;
            private float inicioY;
            private int margemX;
            private int margemY;
            private boolean arrastando;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                ViewGroup.LayoutParams bruto = raiz.getLayoutParams();
                if (!(bruto instanceof FrameLayout.LayoutParams)) return false;
                FrameLayout.LayoutParams p = (FrameLayout.LayoutParams) bruto;
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        inicioX = e.getRawX();
                        inicioY = e.getRawY();
                        margemX = p.leftMargin;
                        margemY = p.topMargin;
                        arrastando = false;
                        return true;
                    case MotionEvent.ACTION_MOVE: {
                        float dx = e.getRawX() - inicioX;
                        float dy = e.getRawY() - inicioY;
                        if (Math.abs(dx) > d(3) || Math.abs(dy) > d(3)) arrastando = true;
                        p.leftMargin = margemX + (int) dx;
                        p.topMargin = margemY + (int) dy;
                        raiz.setLayoutParams(p);
                        limitarPainel();
                        return true;
                    }
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (arrastando) {
                            ViewGroup.LayoutParams fim = raiz.getLayoutParams();
                            if (fim instanceof FrameLayout.LayoutParams) {
                                FrameLayout.LayoutParams f = (FrameLayout.LayoutParams) fim;
                                prefs.edit().putInt("painelX", f.leftMargin)
                                        .putInt("painelY", f.topMargin).apply();
                            }
                        }
                        return true;
                }
                return false;
            }
        });
    }

    private void limitarPainel() {
        ViewGroup.LayoutParams bruto = raiz.getLayoutParams();
        if (!(bruto instanceof FrameLayout.LayoutParams)) return;
        FrameLayout.LayoutParams p = (FrameLayout.LayoutParams) bruto;
        View pai = (View) raiz.getParent();
        if (pai == null || pai.getWidth() <= 0) return;
        int maxX = Math.max(0, pai.getWidth() - raiz.getWidth());
        int maxY = Math.max(0, pai.getHeight() - raiz.getHeight());
        p.leftMargin = Math.max(0, Math.min(p.leftMargin, maxX));
        p.topMargin = Math.max(0, Math.min(p.topMargin, maxY));
        raiz.setLayoutParams(p);
    }

    private void restaurarPosicao() {
        if (!(raiz.getLayoutParams() instanceof FrameLayout.LayoutParams)) return;
        FrameLayout.LayoutParams p = (FrameLayout.LayoutParams) raiz.getLayoutParams();
        p.leftMargin = prefs.getInt("painelX", d(4));
        p.topMargin = prefs.getInt("painelY", d(4));
        raiz.setLayoutParams(p);
        raiz.postDelayed(this::limitarPainel, 500);
    }

    private LinearLayout montarTelaRota() {
        LinearLayout tela = new LinearLayout(ctx);
        tela.setOrientation(LinearLayout.VERTICAL);

        textoRota = texto("0 pontos", 9.5f, Color.rgb(207, 227, 242), false);
        tela.addView(textoRota);

        LinearLayout primeira = linha();
        primeira.setPadding(0, d(4), 0, 0);
        primeira.addView(botao("Marcar aqui", v -> marcarPontoAtual(false)));
        primeira.addView(botao("Ponto de caça", v -> marcarPontoAtual(true)));
        tela.addView(primeira);

        LinearLayout segunda = linha();
        segunda.setPadding(0, d(3), 0, 0);
        segunda.addView(botao("Desfazer", v -> desfazerPonto()));
        segunda.addView(botao("Caça…", v -> dialogoCaca()));
        tela.addView(segunda);

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

        LinearLayout linhaAtraso = linha();
        linhaAtraso.setPadding(0, d(3), 0, 0);
        linhaAtraso.addView(botao("Atraso…", v -> dialogoAtraso()));
        atrasoResumo = texto("sem atraso", 9.5f, Color.rgb(159, 179, 194), false);
        atrasoResumo.setPadding(d(6), 0, 0, 0);
        linhaAtraso.addView(atrasoResumo);
        tela.addView(linhaAtraso);
        atualizarResumoAtraso();

        TextView dica = texto("Ande e marque os pontos. \"Ponto de caça\" para no sqm, segura até\n"
                + "limpar e só sai com caminho livre; o último ponto deve ficar perto do primeiro.",
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
        if (telaConfig != null) telaConfig.setVisibility(View.GONE);
        if (telaSeguir != null) telaSeguir.setVisibility(View.GONE);
        telaRota.setVisibility(View.VISIBLE);
    }

    private void abrirConfig() {
        if (telaConfig == null) return;
        telaHub.setVisibility(View.GONE);
        if (telaRota != null) telaRota.setVisibility(View.GONE);
        if (telaSeguir != null) telaSeguir.setVisibility(View.GONE);
        telaConfig.setVisibility(View.VISIBLE);
        atualizarResumoAtraso();
    }

    private void voltarHub() {
        if (telaRota == null) return;
        telaRota.setVisibility(View.GONE);
        if (telaConfig != null) telaConfig.setVisibility(View.GONE);
        if (telaSeguir != null) telaSeguir.setVisibility(View.GONE);
        telaHub.setVisibility(View.VISIBLE);
    }

    private void atualizarTextoRota() {
        if (textoRota == null || campoRota == null) return;
        int n = 0;
        int cacas = 0;
        try {
            JSONArray lista = new JSONArray(campoRota.getText().toString().trim());
            n = lista.length();
            for (int i = 0; i < n; i++) {
                if (pontoDeCaca(lista.optJSONArray(i))) cacas += 1;
            }
        } catch (Exception e) {
            n = 0;
        }
        textoRota.setText(n + (n == 1 ? " ponto" : " pontos")
                + (cacas > 0 ? " · " + cacas + " de caça" : "")
                + (n == 0 ? " · ande e marque" : " · toque em Iniciar"));
    }

    private void limparRota() {
        campoRota.setText("");
        prefs.edit().remove("rota").apply();
        atualizarTextoRota();
    }

    private String segundos(int ms) {
        return String.format(Locale.getDefault(), "%.1f", ms / 1000.0);
    }

    private void atualizarResumoAtraso() {
        String resumo;
        if (!prefs.getBoolean("atrasoAtivo", false)) {
            resumo = "sem atraso";
        } else if (prefs.getBoolean("atrasoAleatorio", false)) {
            resumo = segundos(prefs.getInt("atrasoMinMs", 1000))
                    + "–" + segundos(prefs.getInt("atrasoMaxMs", 3000)) + " s";
        } else {
            resumo = segundos(prefs.getInt("atrasoMs", 1000)) + " s fixo";
        }
        if (atrasoResumo != null) atrasoResumo.setText(resumo);
        if (atrasoResumoConfig != null) atrasoResumoConfig.setText(resumo);
    }

    private EditText campoSegundos(int ms) {
        EditText e = new EditText(ctx);
        e.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        e.setSingleLine(true);
        e.setTextSize(12f);
        e.setText(segundos(ms));
        e.setLayoutParams(new LinearLayout.LayoutParams(d(56), ViewGroup.LayoutParams.WRAP_CONTENT));
        return e;
    }

    private double lerSegundos(EditText campo, double padrao) {
        try {
            double v = Double.parseDouble(campo.getText().toString().trim().replace(",", "."));
            return Math.max(0, Math.min(60, v));
        } catch (Exception e) {
            return padrao;
        }
    }

    private void dialogoAtraso() {
        final CheckBox ligado = new CheckBox(ctx);
        ligado.setText("Ativar atraso nos waypoints");
        ligado.setTextSize(10f);
        ligado.setChecked(prefs.getBoolean("atrasoAtivo", false));

        final CheckBox aleatorio = new CheckBox(ctx);
        aleatorio.setText("Aleatório");
        aleatorio.setTextSize(10f);
        aleatorio.setChecked(prefs.getBoolean("atrasoAleatorio", false));

        final EditText de = campoSegundos(prefs.getInt("atrasoMinMs", 1000));
        final EditText ate = campoSegundos(prefs.getInt("atrasoMaxMs", 3000));

        LinearLayout valores = linha();
        valores.addView(texto("de", 9.5f, Color.rgb(159, 179, 194), false));
        valores.addView(de);
        valores.addView(texto("até", 9.5f, Color.rgb(159, 179, 194), false));
        valores.addView(ate);
        valores.addView(texto("s", 9.5f, Color.rgb(159, 179, 194), false));

        final Runnable estado = () -> {
            boolean on = ligado.isChecked();
            de.setEnabled(on);
            ate.setEnabled(on && aleatorio.isChecked());
        };
        ligado.setOnCheckedChangeListener((b, m) -> estado.run());
        aleatorio.setOnCheckedChangeListener((b, m) -> estado.run());

        LinearLayout caixa = new LinearLayout(ctx);
        caixa.setOrientation(LinearLayout.VERTICAL);
        int pad = d(16);
        caixa.setPadding(pad, d(4), pad, 0);
        caixa.addView(ligado);
        caixa.addView(aleatorio);
        caixa.addView(valores);
        TextView dica = texto("Segundos (0 a 60). No modo exato vale só o \"de\".", 8.5f,
                Color.rgb(111, 138, 156), false);
        dica.setPadding(0, d(4), 0, 0);
        caixa.addView(dica);
        estado.run();

        new AlertDialog.Builder(ctx)
                .setTitle("Atraso nos waypoints")
                .setView(caixa)
                .setPositiveButton("Salvar", (d, w) -> {
                    double vDe = lerSegundos(de, 1.0);
                    double vAte = aleatorio.isChecked() ? lerSegundos(ate, 3.0) : vDe;
                    if (vAte < vDe) vAte = vDe;
                    int msDe = (int) Math.round(vDe * 1000);
                    int msAte = (int) Math.round(vAte * 1000);
                    prefs.edit()
                            .putBoolean("atrasoAtivo", ligado.isChecked())
                            .putBoolean("atrasoAleatorio", aleatorio.isChecked())
                            .putInt("atrasoMs", msDe)
                            .putInt("atrasoMinMs", msDe)
                            .putInt("atrasoMaxMs", msAte)
                            .apply();
                    atualizarResumoAtraso();
                    atualizarTextoRota();
                    nota("atraso: " + (ligado.isChecked()
                            ? (aleatorio.isChecked()
                            ? segundos(msDe) + "–" + segundos(msAte) + " s aleatório"
                            : segundos(msDe) + " s exato")
                            : "sem atraso"));
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private String atrasoJson() {
        JSONObject o = new JSONObject();
        try {
            if (!prefs.getBoolean("atrasoAtivo", false)) {
                o.put("modo", "off");
            } else if (prefs.getBoolean("atrasoAleatorio", false)) {
                o.put("modo", "aleatorio");
                o.put("minMs", prefs.getInt("atrasoMinMs", 1000));
                o.put("maxMs", prefs.getInt("atrasoMaxMs", 3000));
            } else {
                o.put("modo", "exato");
                o.put("ms", prefs.getInt("atrasoMs", 1000));
            }
        } catch (Exception ignorado) {
        }
        return o.toString();
    }

    boolean ondaAtiva() {
        return prefs.getBoolean("seguirOnda", false);
    }

    boolean rtcSempreAtivo() {
        return prefs.getBoolean("rtcSempre", false);
    }

    /** Configuração do ponto de caça, no mesmo formato do driver (caca.js). */
    String cacaJson() {        JSONObject o = new JSONObject();
        try {
            o.put("raioLimpo", prefs.getInt("cacaRaio", 3));
            o.put("minParadoMs", prefs.getInt("cacaMinMs", 3000));
            o.put("tetoMs", prefs.getInt("cacaTetoMs", 180000));
            o.put("manaMinPct", prefs.getInt("cacaMana", 30));
            o.put("sairComMobs", prefs.getInt("cacaSairMobs", 0));
            o.put("tremMobs", prefs.getInt("cacaTremMobs", 0));
        } catch (Exception ignorado) {
        }
        return o.toString();
    }

    private EditText campoCaca(int valor) {
        EditText e = new EditText(ctx);
        e.setInputType(InputType.TYPE_CLASS_NUMBER);
        e.setSingleLine(true);
        e.setTextSize(12f);
        e.setText(String.valueOf(valor));
        e.setLayoutParams(new LinearLayout.LayoutParams(d(64), ViewGroup.LayoutParams.WRAP_CONTENT));
        return e;
    }

    private int lerCaca(EditText campo, int padrao, int min, int max) {
        try {
            int v = Integer.parseInt(campo.getText().toString().trim());
            return Math.max(min, Math.min(max, v));
        } catch (Exception e) {
            return padrao;
        }
    }

    private LinearLayout linhaCaca(String rotulo, EditText campo) {
        LinearLayout l = linha();
        TextView t = texto(rotulo, 9.5f, Color.rgb(159, 179, 194), false);
        t.setMinWidth(d(132));
        l.addView(t);
        l.addView(campo);
        return l;
    }

    private void dialogoCaca() {
        final EditText raio = campoCaca(prefs.getInt("cacaRaio", 3));
        final EditText minimo = campoCaca(prefs.getInt("cacaMinMs", 3000) / 1000);
        final EditText teto = campoCaca(prefs.getInt("cacaTetoMs", 180000) / 1000);
        final EditText mana = campoCaca(prefs.getInt("cacaMana", 30));
        final EditText sair = campoCaca(prefs.getInt("cacaSairMobs", 0));
        final EditText trem = campoCaca(prefs.getInt("cacaTremMobs", 0));

        LinearLayout caixa = new LinearLayout(ctx);
        caixa.setOrientation(LinearLayout.VERTICAL);
        int pad = d(16);
        caixa.setPadding(pad, d(2), pad, 0);
        caixa.addView(linhaCaca("Livre a até (sqm)", raio));
        caixa.addView(linhaCaca("Mínimo parado (s)", minimo));
        caixa.addView(linhaCaca("Teto de segurança (s)", teto));
        caixa.addView(linhaCaca("Mana para sair (%)", mana));
        caixa.addView(linhaCaca("Sair com até (mobs)", sair));
        caixa.addView(linhaCaca("Trem: N+ monstros", trem));
        TextView dica = texto("Livre = nenhum monstro a até N sqm. Sai quando sobrarem até\n"
                + "\"sair com\" monstros no raio (0 = só sem nenhum). Trem 0 desliga:\n"
                + "andando com N+ monstros a até 4 sqm e preso 1,5 s, caça no lugar.",
                8.5f, Color.rgb(111, 138, 156), false);
        dica.setPadding(0, d(5), 0, 0);
        caixa.addView(dica);

        ScrollView rolagem = new ScrollView(ctx);
        rolagem.addView(caixa);

        new AlertDialog.Builder(ctx)
                .setTitle("Ponto de caça")
                .setView(rolagem)
                .setPositiveButton("Salvar", (d, w) -> {
                    int r = lerCaca(raio, 3, 1, 7);
                    int mn = lerCaca(minimo, 3, 0, 60) * 1000;
                    int mx = lerCaca(teto, 180, 10, 900) * 1000;
                    if (mn > mx) mn = mx;
                    prefs.edit()
                            .putInt("cacaRaio", r)
                            .putInt("cacaMinMs", mn)
                            .putInt("cacaTetoMs", mx)
                            .putInt("cacaMana", lerCaca(mana, 30, 0, 100))
                            .putInt("cacaSairMobs", lerCaca(sair, 0, 0, 10))
                            .putInt("cacaTremMobs", lerCaca(trem, 0, 0, 30))
                            .apply();
                    acoes.definirCaca(cacaJson());
                    atualizarTextoRota();
                    nota("caça: livre " + r + " sqm · " + (mn / 1000) + "–" + (mx / 1000) + " s");
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private int[] coordenadas(JSONArray ponto) {
        if (ponto == null) return null;
        JSONObject objeto = ponto.optJSONObject(0);
        try {
            if (objeto != null) {
                return new int[]{objeto.optInt("x", -1), objeto.optInt("y", -1)};
            }
            if (ponto.length() >= 2) {
                return new int[]{ponto.getInt(0), ponto.getInt(1)};
            }
        } catch (Exception ignorado) {
        }
        return null;
    }

    private boolean pontoDeCaca(JSONArray ponto) {
        if (ponto == null) return false;
        JSONObject objeto = ponto.optJSONObject(0);
        if (objeto != null) {
            return objeto.optBoolean("hunt", false)
                    || objeto.optBoolean("caca", false)
                    || "h".equals(objeto.optString("h", ""));
        }
        return ponto.length() >= 3
                && ("h".equals(ponto.optString(2, "")) || ponto.optBoolean(2, false));
    }

    private void marcarPontoAtual(boolean caca) {
        acoes.posicaoAtual(texto -> {
            JSONArray lista;
            try {
                lista = new JSONArray(campoRota.getText().toString().trim());
            } catch (Exception e) {
                lista = new JSONArray();
            }
            try {
                JSONArray ponto = new JSONArray(texto);
                int x = ponto.getInt(0);
                int y = ponto.getInt(1);
                if (lista.length() > 0) {
                    JSONArray ultimo = lista.optJSONArray(lista.length() - 1);
                    int[] xy = coordenadas(ultimo);
                    if (xy != null && xy[0] == x && xy[1] == y) {
                        if (caca && !pontoDeCaca(ultimo)) {
                            JSONObject marcado = new JSONObject();
                            marcado.put("x", x);
                            marcado.put("y", y);
                            marcado.put("hunt", true);
                            lista.put(lista.length() - 1, marcado);
                            campoRota.setText(lista.toString());
                            campoRota.setSelection(campoRota.getText().length());
                            atualizarTextoRota();
                            nota("ponto " + x + "," + y + " agora é de caça");
                        } else if (!caca && pontoDeCaca(ultimo)) {
                            JSONArray normal = new JSONArray();
                            normal.put(x);
                            normal.put(y);
                            lista.put(lista.length() - 1, normal);
                            campoRota.setText(lista.toString());
                            campoRota.setSelection(campoRota.getText().length());
                            atualizarTextoRota();
                            nota("ponto " + x + "," + y + " voltou a ser normal");
                        } else {
                            nota("mesmo ponto do anterior");
                        }
                        return;
                    }
                }
                if (caca) {
                    JSONObject marcado = new JSONObject();
                    marcado.put("x", x);
                    marcado.put("y", y);
                    marcado.put("hunt", true);
                    lista.put(marcado);
                } else {
                    lista.put(ponto);
                }
                campoRota.setText(lista.toString());
                campoRota.setSelection(campoRota.getText().length());
                atualizarTextoRota();
                nota((caca ? "ponto de caça " : "ponto ") + x + "," + y + " marcado");
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
        JSONArray ultimo = lista.optJSONArray(lista.length() - 1);
        int[] xy = coordenadas(ultimo);
        int x = xy == null ? -1 : xy[0];
        int y = xy == null ? -1 : xy[1];
        boolean caca = pontoDeCaca(ultimo);
        lista.remove(lista.length() - 1);
        campoRota.setText(lista.toString());
        campoRota.setSelection(campoRota.getText().length());
        atualizarTextoRota();
        nota("removeu " + (caca ? "ponto de caça " : "") + x + "," + y);
    }

    /** Inicia a última rota salva direto do hub, sem abrir a tela de edição. */
    private void iniciarRotaSalva() {
        String bruto = prefs.getString("rota", "").trim();
        try {
            JSONArray lista = new JSONArray(bruto);
            if (lista.length() == 0) throw new Exception("rota vazia");
            String normal = lista.toString();
            prefs.edit().putString("rota", normal).apply();
            acoes.definirCaca(cacaJson());
            acoes.iniciarRota(normal, repetir.isChecked(), atrasoJson());
            voltarHub();
            nota("rota iniciada · " + lista.length() + " pontos"
                    + (repetir.isChecked() ? " · repetindo" : ""));
        } catch (Exception e) {
            nota("nenhuma rota salva; monte a rota primeiro");
            abrirTelaRota();
        }
    }

    private void iniciarRotaDaTela() {
        String bruto = campoRota.getText().toString().trim();
        try {
            JSONArray lista = new JSONArray(bruto);
            if (lista.length() == 0) throw new Exception("rota vazia");
            String normal = lista.toString();
            prefs.edit().putString("rota", normal).apply();
            acoes.definirCaca(cacaJson());
            acoes.iniciarRota(normal, repetir.isChecked(), atrasoJson());
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
            JSONObject autoTarefasJson = s.optJSONObject("autoTarefas");
            JSONObject ondaJson = s.optJSONObject("onda");
            boolean ondaAtiva = ondaJson != null && ondaJson.optBoolean("ligado", false);

            String situacaoRota = rota != null ? rota.optString("situacao", "") : "";
            boolean pausaUi = s.optBoolean("pausaUi", false);
            long pausaRota = s.optLong("pausa", 0);
            int totalRota = rota != null ? rota.optInt("total", 0) : 0;
            int indiceRota = rota != null ? Math.min(rota.optInt("indice", 0) + 1, totalRota) : 0;
            int voltaRota = rota != null ? rota.optInt("volta", 0) : 0;
            int nivel = jogo != null && jogo.has("nivel") && !jogo.isNull("nivel")
                    ? jogo.optInt("nivel", 0) : 0;
            JSONObject alvoRota = rota != null ? rota.optJSONObject("alvo") : null;

            String status;
            int corStatus;
            if ("parada".equals(modo)) {
                status = "STOPPED";
                corStatus = Color.rgb(255, 107, 127);
            } else if (pausaUi || pausaRota > 0
                    || "esperando".equals(situacaoRota) || "pausada".equals(situacaoRota)) {
                status = "PAUSA";
                corStatus = Color.rgb(242, 198, 91);
            } else if ("cacando".equals(situacaoRota)) {
                status = "CAÇANDO";
                corStatus = Color.rgb(211, 159, 255);
            } else if ("seguir".equals(modo)) {
                status = "SEGUINDO";
                corStatus = Color.rgb(143, 211, 255);
            } else {
                status = "ANDANDO";
                corStatus = Color.rgb(155, 240, 122);
            }
            statusValor.setText(status);
            statusValor.setTextColor(corStatus);

            String ponto = totalRota > 0
                    ? "ponto " + indiceRota + "/" + totalRota
                    : "sem rota";
            if (alvoRota != null) {
                ponto += " · " + alvoRota.optInt("x", 0) + "," + alvoRota.optInt("y", 0);
            }
            statusLinha1.setText((nivel > 0 ? "nv " + nivel + " · " : "") + ponto);

            long duracao = sessao != null ? sessao.optLong("duracaoMs", 0) : 0;
            int voltas = sessao != null ? sessao.optInt("voltas", 0) : voltaRota;
            String pausaTexto = pausaRota > 0
                    ? " · pausa " + Math.round(pausaRota / 1000.0) + "s"
                    : pausaUi ? " · menu aberto" : "";
            statusLinha2.setText("volta " + voltas + " · " + tempo(duracao) + pausaTexto);

            long xpHora = sessao != null ? sessao.optLong("xpHora", 0) : 0;
            xpValor.setText(numero(xpHora));
            xpDetalhe.setText("média da sessão");
            long xpSessao = sessao != null ? sessao.optLong("xp", 0) : 0;
            xpSessaoValor.setText(numero(xpSessao));
            xpSessaoDetalhe.setText("XP ganho");

            long goldTotal = sessao != null ? sessao.optLong("ouro", 0) : 0;
            goldValor.setText(numero(goldTotal));
            long goldAgora = sup != null ? sup.optLong("oro", 0) : 0;
            goldDetalhe.setText("agora " + numero(goldAgora));

            double minSup = sup != null ? sup.optDouble("restanteMin", -1) : -1;
            if (sup != null && !sup.isNull("restanteMin") && minSup > 0) {
                supValor.setText(tempoSuprimento(minSup));
            } else {
                supValor.setText("—");
            }
            long consumoHora = sup != null ? Math.round(sup.optDouble("consumoHora", 0)) : 0;
            supDetalhe.setText(consumoHora > 0 ? numero(consumoHora) + "/h" : "coletando…");

            int tasks = sessao != null ? sessao.optInt("tasks", 0) : 0;
            taskValor.setText(numero(tasks));
            taskDetalhe.setText("repetidas");
            int anti = sessao != null ? sessao.optInt("antiBot", 0) : 0;
            antiValor.setText(numero(anti));
            antiDetalhe.setText("respostas");

            double est = jogo != null ? jogo.optDouble("estamina", Double.NaN) : Double.NaN;
            if (Double.isNaN(est)) {
                staminaValor.setText("—");
                staminaValor.setTextColor(Color.rgb(159, 179, 194));
                staminaDetalhe.setText("sem leitura");
            } else {
                staminaValor.setText(staminaTexto(est));
                staminaValor.setTextColor(est >= 40 ? Color.rgb(155, 240, 122)
                        : est >= 30 ? Color.rgb(242, 198, 91) : Color.rgb(255, 107, 127));
                staminaDetalhe.setText(est >= 40 ? "cheia" : est >= 30 ? "normal" : "baixa");
            }

            voltaValor.setText(numero(voltas));
            voltaDetalhe.setText("completas");

            if (jogo != null) {
                JSONObject pos = jogo.optJSONObject("pos");
                if (pos != null) {
                    posAtual = "[[" + pos.optInt("x", 0) + "," + pos.optInt("y", 0) + "]]";
                }
                if (jogo.optBoolean("emJogo", false) && "fora do jogo".equals(nota.getText().toString())) {
                    nota.setText("");
                }
            }

            if (rota != null && totalRota > 0
                    && repetir.isChecked() != rota.optBoolean("repetir", true)) {
                repetir.setChecked(rota.optBoolean("repetir", true));
            }

            estado.setText(pausaUi ? "menu do jogo · pausado"
                    : "seguir".equals(modo) && s.has("seguir") && !s.isNull("seguir")
                    ? "seguindo " + s.optString("seguir") + (ondaAtiva ? " · onda" : "")
                    : modo);
            // Mantém o cabeçalho coerente com o estado recolhido.
            estado.setVisibility(recolhido ? View.GONE : View.VISIBLE);
            if (engrenagem != null) engrenagem.setVisibility(recolhido ? View.GONE : View.VISIBLE);
            if (divisor != null) divisor.setVisibility(recolhido ? View.GONE : View.VISIBLE);

            if (antibot != null) {
                boolean ligado = antibot.optBoolean("ligado", true);
                if (nao.isChecked() != ligado) nao.setChecked(ligado);
            }

            JSONObject pausa = s.optJSONObject("pausaHumana");
            if (pausa != null) {
                boolean lig = pausa.optBoolean("ligado", true);
                if (pausaHumana.isChecked() != lig) pausaHumana.setChecked(lig);
            }

            JSONObject recon = s.optJSONObject("reconexao");
            if (recon != null && reconexao != null) {
                boolean lig = recon.optBoolean("ligado", true);
                if (reconexao.isChecked() != lig) reconexao.setChecked(lig);
            }

            JSONObject areaJson = s.optJSONObject("area");
            if (areaJson != null && area != null) {
                boolean lig = areaJson.optBoolean("ligado", false);
                if (area.isChecked() != lig) area.setChecked(lig);
            }
            JSONObject rtcJson = s.optJSONObject("rtc");
            if (rtcJson != null && rtcSempre != null) {
                boolean lig = rtcJson.optBoolean("ligado", false);
                if (rtcSempre.isChecked() != lig) rtcSempre.setChecked(lig);
            }

            if (ondaJson != null && onda != null) {
                boolean lig = ondaJson.optBoolean("ligado", false);
                if (onda.isChecked() != lig) onda.setChecked(lig);
            }

            if (autoTarefasJson != null) {
                boolean ligado = autoTarefasJson.optBoolean("ligado", true);
                if (autoTarefas.isChecked() != ligado) autoTarefas.setChecked(ligado);
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

    /** Cartão compacto do hub: título pequeno, valor e detalhe. */
    private LinearLayout cartao(String titulo, TextView valor, TextView detalhe, int cor) {
        LinearLayout card = new LinearLayout(ctx);
        card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable fundo = new GradientDrawable();
        fundo.setColor(Color.argb(205, 12, 20, 27));
        fundo.setCornerRadius(d(9));
        fundo.setStroke(Math.max(1, d(1)), Color.argb(85, 61, 85, 102));
        card.setBackground(fundo);
        card.setPadding(d(7), d(5), d(7), d(5));

        TextView tituloView = texto(titulo, 7.8f, Color.argb(220, 111, 138, 156), true);
        tituloView.setLetterSpacing(0.06f);
        card.addView(tituloView);

        valor.setTextSize(15.5f);
        valor.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        valor.setSingleLine(true);
        valor.setEllipsize(TextUtils.TruncateAt.END);
        valor.setPadding(0, d(1), 0, 0);
        card.addView(valor);

        detalhe.setTextSize(8.2f);
        detalhe.setTextColor(Color.rgb(159, 179, 194));
        detalhe.setSingleLine(true);
        detalhe.setEllipsize(TextUtils.TruncateAt.END);
        card.addView(detalhe);
        return card;
    }

    private LinearLayout linhaCartoes(LinearLayout esquerda, LinearLayout direita) {
        LinearLayout linha = linha();
        linha.setPadding(0, d(4), 0, 0);
        linha.setBaselineAligned(false);
        LinearLayout.LayoutParams p1 = new LinearLayout.LayoutParams(0, d(52), 1f);
        p1.rightMargin = d(3);
        LinearLayout.LayoutParams p2 = new LinearLayout.LayoutParams(0, d(52), 1f);
        p2.leftMargin = d(3);
        linha.addView(esquerda, p1);
        linha.addView(direita, p2);
        return linha;
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
        b.setTextColor(Color.rgb(214, 236, 248));
        b.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        b.setLetterSpacing(0.03f);
        b.setAllCaps(false);
        b.setBackgroundResource(R.drawable.botao);
        b.setMinHeight(0);
        b.setMinimumHeight(0);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setPadding(d(11), d(4), d(11), d(4));
        if (Build.VERSION.SDK_INT >= 21) {
            b.setStateListAnimator(null);
            b.setElevation(0f);
        }
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(0, 0, d(5), 0);
        b.setLayoutParams(p);
        b.setOnClickListener(aoClicar);
        return b;
    }

    /** Botão compacto: quatro cabem na largura da lateral sem quebrar linha. */
    private Button botaoHub(String t, View.OnClickListener aoClicar) {
        Button b = botao(t, aoClicar);
        b.setTextSize(7.8f);
        b.setPadding(d(2), d(4), d(2), d(4));
        b.setSingleLine(true);
        b.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        p.setMargins(d(1), 0, d(1), 0);
        b.setLayoutParams(p);
        return b;
    }

    private void estilizarCaixa(CheckBox c) {
        if (Build.VERSION.SDK_INT >= 21) {
            c.setButtonTintList(android.content.res.ColorStateList.valueOf(Color.rgb(95, 211, 255)));
        }
    }

    private int d(int dp) {
        return Math.round(dp * ctx.getResources().getDisplayMetrics().density);
    }

    private static String numero(long valor) {
        return String.format(Locale.getDefault(), "%,d", valor);
    }

    /** Minutos restantes estimados -> "~1h 20" / "~12min". */
    private static String tempoSuprimento(double minutos) {
        if (!(minutos > 0)) return "—";
        long total = Math.round(minutos);
        if (total >= 60) {
            long h = total / 60;
            long m = total % 60;
            return m == 0 ? "~" + h + "h" : "~" + h + "h " + m;
        }
        return "~" + Math.max(1, total) + "min";
    }

    /** Stamina do jogo vem em horas decimais; mostra h:mm. */
    private static String staminaTexto(double horas) {
        long totalMin = Math.max(0, Math.round(horas * 60));
        return String.format(Locale.getDefault(), "%d:%02d", totalMin / 60, totalMin % 60);
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
