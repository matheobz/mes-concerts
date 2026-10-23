package fr.berrez.mesconcerts;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Mise à jour depuis l'appli : télécharge le nouvel APK (GitHub Releases) puis ouvre
 * l'installateur Android. Android demande toujours une confirmation : une appli installée
 * hors Play Store ne peut pas se mettre à jour en silence.
 */
@CapacitorPlugin(name = "MiseAJour")
public class MiseAJourPlugin extends Plugin {

    /** { ok: true } si l'appli a le droit d'installer des applis ("sources inconnues"). */
    @PluginMethod
    public void autorisation(PluginCall call) {
        boolean ok = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject r = new JSObject();
        r.put("ok", ok);
        call.resolve(r);
    }

    /** Ouvre le réglage "Autoriser depuis cette source" pour Mes concerts. */
    @PluginMethod
    public void demanderAutorisation(PluginCall call) {
        try {
            Intent intent = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))
                : new Intent(Settings.ACTION_SECURITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Impossible d'ouvrir le réglage d'installation");
        }
    }

    /** Télécharge l'APK puis ouvre l'installateur. Progression : événement "progression" { pourcent }. */
    @PluginMethod
    public void installer(PluginCall call) {
        String adresse = call.getString("url");
        if (adresse == null || !adresse.startsWith("https://")) {
            call.reject("Adresse de téléchargement invalide");
            return;
        }
        new Thread(() -> {
            try {
                Context ctx = getContext();
                File dossier = new File(ctx.getCacheDir(), "maj");
                if (!dossier.exists() && !dossier.mkdirs()) throw new IOException("dossier impossible à créer");
                File apk = new File(dossier, "mes-concerts.apk");
                telecharger(adresse, apk);
                Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("Téléchargement impossible : " + e.getMessage());
            }
        }).start();
    }

    private void telecharger(String adresse, File cible) throws IOException {
        String url = adresse;
        HttpURLConnection c = null;
        // GitHub redirige vers son stockage : on suit les redirections à la main (5 au plus).
        for (int i = 0; i < 6; i++) {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String suite = c.getHeaderField("Location");
                c.disconnect();
                c = null;
                if (suite == null) throw new IOException("redirection sans adresse");
                url = new URL(new URL(url), suite).toString();
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new IOException("le serveur a répondu " + code);
            }
            break;
        }
        if (c == null) throw new IOException("trop de redirections");
        long total = c.getContentLengthLong();
        try (InputStream in = new BufferedInputStream(c.getInputStream());
             OutputStream out = new FileOutputStream(cible)) {
            byte[] tampon = new byte[64 * 1024];
            long lu = 0;
            int dernier = -1;
            int n;
            while ((n = in.read(tampon)) != -1) {
                out.write(tampon, 0, n);
                lu += n;
                if (total > 0) {
                    int pourcent = (int) (lu * 100 / total);
                    if (pourcent != dernier) {
                        dernier = pourcent;
                        JSObject p = new JSObject();
                        p.put("pourcent", pourcent);
                        notifyListeners("progression", p);
                    }
                }
            }
        } finally {
            c.disconnect();
        }
    }
}
