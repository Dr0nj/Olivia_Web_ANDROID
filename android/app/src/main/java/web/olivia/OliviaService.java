package web.olivia;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Mantém o processo vivo com a tela ligada. Não roda o jogo em segundo plano:
 * a página precisa continuar visível (o detector do jogo pune página oculta).
 */
public class OliviaService extends Service {
    private static final String CANAL = "olivia";
    private static final int ID = 42;
    private PowerManager.WakeLock trava;

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel canal = new NotificationChannel(CANAL, "Olivia", NotificationManager.IMPORTANCE_LOW);
            canal.setDescription("Sessão do Olivia em andamento");
            NotificationManager gestor = getSystemService(NotificationManager.class);
            if (gestor != null) gestor.createNotificationChannel(canal);
        }

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CANAL)
                : new Notification.Builder(this);
        Notification notificacao = b
                .setContentTitle("Olivia")
                .setContentText("Sessão ativa · mantenha o jogo em primeiro plano")
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setOngoing(true)
                .build();

        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID, notificacao, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(ID, notificacao);
        }

        PowerManager energia = (PowerManager) getSystemService(POWER_SERVICE);
        if (energia != null) {
            trava = energia.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "olivia:sessao");
            trava.setReferenceCounted(false);
            trava.acquire();
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (trava != null && trava.isHeld()) trava.release();
        trava = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
