package web.olivia;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

final class Utilidades {
    private Utilidades() {
    }

    static String lerAsset(Context ctx, String nome) {
        try (InputStream in = ctx.getAssets().open(nome)) {
            ByteArrayOutputStream saida = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int lidos;
            while ((lidos = in.read(buffer)) > 0) saida.write(buffer, 0, lidos);
            return saida.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }
}
