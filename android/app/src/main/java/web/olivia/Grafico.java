package web.olivia;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;

import java.util.ArrayList;

/**
 * Sparkline de XP/h da sessão. Desenho nativo (fora do DOM): cartão arredondado,
 * grade discreta, área com degradê e linha suave.
 */
class Grafico extends View {
    private static final int AMOSTRAS = 60;

    private final Paint fundo = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint borda = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint grade = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint linha = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint area = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint texto = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ponto = new Paint(Paint.ANTI_ALIAS_FLAG);

    private final ArrayList<Float> valores = new ArrayList<>();
    private final RectF caixa = new RectF();
    private final Path caminho = new Path();
    private final Path preenchido = new Path();
    private final float densidade;

    Grafico(Context ctx) {
        super(ctx);
        densidade = ctx.getResources().getDisplayMetrics().density;

        fundo.setColor(Color.argb(150, 12, 20, 27));
        borda.setStyle(Paint.Style.STROKE);
        borda.setStrokeWidth(dp(1));
        borda.setColor(Color.argb(120, 61, 85, 102));
        grade.setStyle(Paint.Style.STROKE);
        grade.setStrokeWidth(dp(1));
        grade.setColor(Color.argb(70, 61, 85, 102));
        linha.setStyle(Paint.Style.STROKE);
        linha.setStrokeWidth(dp(1.6f));
        linha.setStrokeCap(Paint.Cap.ROUND);
        linha.setStrokeJoin(Paint.Join.ROUND);
        linha.setColor(Color.rgb(143, 211, 255));
        area.setStyle(Paint.Style.FILL);
        texto.setColor(Color.rgb(111, 138, 156));
        texto.setTextSize(dp(8.5f));
        ponto.setColor(Color.rgb(247, 217, 133));
    }

    private float dp(float v) {
        return v * densidade;
    }

    void adicionar(float valor) {
        valores.add(Math.max(0f, valor));
        while (valores.size() > AMOSTRAS) valores.remove(0);
        invalidate();
    }

    void limpar() {
        valores.clear();
        invalidate();
    }

    @Override
    protected void onMeasure(int largura, int altura) {
        int w = Math.max((int) dp(220), MeasureSpec.getSize(largura));
        setMeasuredDimension(w, (int) dp(46));
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float w = getWidth();
        float h = getHeight();
        caixa.set(dp(1), dp(1), w - dp(1), h - dp(1));
        canvas.drawRoundRect(caixa, dp(6), dp(6), fundo);
        canvas.drawRoundRect(caixa, dp(6), dp(6), borda);

        canvas.drawText("xp/h · últimos 5 min", dp(8), dp(11), texto);

        float topo = dp(17);
        float base = h - dp(7);
        float esq = dp(8);
        float dir = w - dp(8);
        if (dir <= esq || base <= topo) return;

        for (int i = 1; i <= 3; i += 1) {
            float y = topo + (base - topo) * i / 4f;
            canvas.drawLine(esq, y, dir, y, grade);
        }

        if (valores.size() < 2) {
            canvas.drawLine(esq, base, dir, base, linha);
            return;
        }

        float max = 1f;
        for (Float v : valores) if (v != null && v > max) max = v;
        float passo = (dir - esq) / Math.max(1, valores.size() - 1);
        float[] xs = new float[valores.size()];
        float[] ys = new float[valores.size()];
        for (int i = 0; i < valores.size(); i += 1) {
            xs[i] = esq + passo * i;
            ys[i] = base - (base - topo) * Math.min(1f, valores.get(i) / max);
        }

        caminho.reset();
        caminho.moveTo(xs[0], ys[0]);
        for (int i = 1; i < xs.length; i += 1) {
            float mx = (xs[i - 1] + xs[i]) / 2f;
            caminho.cubicTo(mx, ys[i - 1], mx, ys[i], xs[i], ys[i]);
        }

        preenchido.reset();
        preenchido.addPath(caminho);
        preenchido.lineTo(xs[xs.length - 1], base);
        preenchido.lineTo(xs[0], base);
        preenchido.close();
        area.setShader(new LinearGradient(0, topo, 0, base,
                Color.argb(110, 143, 211, 255), Color.argb(0, 143, 211, 255), Shader.TileMode.CLAMP));
        canvas.drawPath(preenchido, area);

        canvas.drawPath(caminho, linha);
        canvas.drawCircle(xs[xs.length - 1], ys[ys.length - 1], dp(2.2f), ponto);
    }
}
