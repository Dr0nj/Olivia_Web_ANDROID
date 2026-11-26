package web.olivia;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

/**
 * Concha do Olivia no Android: WebView em primeiro plano, tela ligada,
 * driver reinjetado a cada navegação e painel nativo (fora do DOM do jogo).
 */
public class MainActivity extends Activity {
    static final String JOGO = "https://lowmmorpg.com/juego/";

    private WebView web;
    private Painel painel;
    private final Handler laco = new Handler(Looper.getMainLooper());
    private String driver = "";
    private long ultimaInjecao = 0;
    private volatile long ultimoEstado = 0;
    private int injecoes = 0;
    private volatile boolean emRota = false;
    private volatile boolean emFrente = false;
    private int cutucadas = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        driver = Utilidades.lerAsset(this, "driver.js");

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.BLACK);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        configurar(web);

        raiz.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        painel = new Painel(this, new Painel.Acoes() {
            @Override public void iniciarRota(String json, boolean repetir) {
                chamarJs("Olivia.rota(" + json + ", { repetir: " + repetir + ", origem: 'painel' })");
            }
            @Override public void definirRepetir(boolean repetir) {
                chamarJs("Olivia.motor.rota.repetir(" + repetir + ")");
            }
            @Override public void parar() { chamarJs("Olivia.parar()"); }
            @Override public void seguir(long id) { chamarJs("Olivia.seguir(" + id + ")"); }
            @Override public void ligarAntiBot(boolean ligado) { chamarJs("Olivia.antibot.definirLigado(" + ligado + ")"); }
            @Override public void ligarColeta(boolean ligado) { chamarJs("Olivia.coletar.definir(" + ligado + ")"); }
            @Override public void zerar() { chamarJs("Olivia.zerar()"); }
            @Override public void recarregar() { web.reload(); }
            @Override public void listarJogadores(final Painel.RetornoLista retorno) {
                if (web == null) { retorno.pronto("[]"); return; }
                web.evaluateJavascript(
                        "(function(){try{return JSON.stringify(window.Olivia?Olivia.jogadores():[])}catch(e){return '[]'}})()",
                        new android.webkit.ValueCallback<String>() {
                            @Override
                            public void onReceiveValue(String valor) {
                                String json = "[]";
                                try {
                                    Object o = new org.json.JSONTokener(valor).nextValue();
                                    if (o instanceof String) json = (String) o;
                                } catch (Exception ignorado) {
                                }
                                retorno.pronto(json);
                            }
                        });
            }
            @Override public void posicaoAtual(final Painel.RetornoTexto retorno) {
                if (web == null) { retorno.pronto(""); return; }
                web.evaluateJavascript(
                        "(function(){try{var j=window.Olivia?Olivia.estado().jogo:null;return j&&j.pos?JSON.stringify([j.pos.x,j.pos.y]):''}catch(e){return ''}})()",
                        new android.webkit.ValueCallback<String>() {
                            @Override
                            public void onReceiveValue(String valor) {
                                String json = "";
                                try {
                                    Object o = new org.json.JSONTokener(valor).nextValue();
                                    if (o instanceof String) json = (String) o;
                                } catch (Exception ignorado) {
                                }
                                retorno.pronto(json);
                            }
                        });
            }
        });
        raiz.addView(painel.raiz(), new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        setContentView(raiz);
        web.loadUrl(JOGO);

        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1);
        }
        try {
            startForegroundService(new Intent(this, OliviaService.class));
        } catch (Exception e) {
            // Sem serviço o app ainda funciona enquanto estiver em primeiro plano.
        }

        laco.postDelayed(this::vigiar, 1500);
        laco.postDelayed(this::presenca, 2500);
    }

    /**
     * Enquanto a rota/seguidor está ativo, entrega ao WebView uma tecla de verdade
     * (evento confiável). O detector do cliente (Calidad) conta `ir` sem tecla/clique
     * nos últimos 2 s e liga o bit 64; um par Shift continua a janela aberta sem
     * mexer no personagem (o jogo ignora Shift sozinho).
     */
    private void presenca() {
        if (emFrente && emRota && web != null) cutucar();
        laco.postDelayed(this::presenca, 1200);
    }

    private void cutucar() {
        if (web == null || !web.hasWindowFocus()) return;
        long agora = SystemClock.uptimeMillis();
        KeyEvent baixo = new KeyEvent(agora, agora, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SHIFT_LEFT, 0);
        KeyEvent cima = new KeyEvent(agora, agora + 18, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_SHIFT_LEFT, 0);
        web.dispatchKeyEvent(baixo);
        web.dispatchKeyEvent(cima);
        cutucadas += 1;
    }

    private void configurar(WebView v) {
        WebView.setWebContentsDebuggingEnabled(true);
        WebSettings s = v.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setTextZoom(100);

        v.addJavascriptInterface(new Ponte(), "OliviaAndroid");
        v.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                injetar(true);
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                injetar(false);
            }
        });
    }

    /** Injeta o driver. Idempotente: o próprio script se ignora se já estiver montado. */
    void injetar(boolean forcar) {
        if (web == null || driver.isEmpty()) return;
        long agora = System.currentTimeMillis();
        if (!forcar && agora - ultimaInjecao < 1200) return;
        ultimaInjecao = agora;
        injecoes += 1;
        String js = "window.__OVW_NATIVO=true;\n" + driver;
        web.evaluateJavascript(js, null);
        painel.nota("driver injetado (" + injecoes + ")");
    }

    void chamarJs(String js) {
        if (web == null) return;
        web.evaluateJavascript("javascript:(function(){try{" + js + "}catch(e){console.warn('[Olivia]',e)}})()", null);
    }

    /** Se o driver parar de publicar (reload do VersionWeb), reinjeta. */
    private void vigiar() {
        if (!emFrente) {
            laco.postDelayed(this::vigiar, 2500);
            return;
        }
        long agora = System.currentTimeMillis();
        if (ultimoEstado == 0 || agora - ultimoEstado > 6000) {
            injetar(false);
        }
        laco.postDelayed(this::vigiar, 2500);
    }

    private final class Ponte {
        @JavascriptInterface
        public void estado(final String json) {
            ultimoEstado = System.currentTimeMillis();
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        JSONObject s = new JSONObject(json);
                        emRota = !"parada".equals(s.optString("modo", "parada"));
                        painel.atualizar(s);
                    } catch (Exception e) {
                        painel.nota("estado inválido: " + e.getClass().getSimpleName());
                    }
                }
            });
        }

        @JavascriptInterface
        public void evento(final String json) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    painel.evento(json);
                }
            });
        }
    }

    @Override
    protected void onPause() {
        emFrente = false;
        // Página oculta + ações = bit 512 do detector. Para o laço enquanto some.
        if (web != null) {
            web.evaluateJavascript("try{if(window.Olivia&&Olivia.suspender)Olivia.suspender()}catch(e){}", null);
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        emFrente = true;
        if (web != null) {
            web.evaluateJavascript("try{if(window.Olivia&&Olivia.retomarMotor)Olivia.retomarMotor()}catch(e){}", null);
        }
    }

    @Override
    public void onBackPressed() {
        // Voltar dentro do jogo fecharia o personagem (e a sessão). Minimiza o app.
        moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        laco.removeCallbacksAndMessages(null);
        try {
            stopService(new Intent(this, OliviaService.class));
        } catch (Exception e) {
            // ignorado
        }
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
