package fr.berrez.mesconcerts;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Économie de batterie. OnePlus (OxygenOS) endort vite les applis qu'on n'ouvre pas, ce qui
 * empêche la vérification quotidienne. Ce plugin permet à l'appli de savoir si elle est exemptée
 * et de demander l'exemption (ou d'ouvrir les bons réglages).
 */
@CapacitorPlugin(name = "Batterie")
public class BatteriePlugin extends Plugin {

    /** { ignoree: true } si Android laisse l'appli tourner en arrière-plan sans restriction. */
    @PluginMethod
    public void etat(PluginCall call) {
        Context ctx = getContext();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        boolean ignoree = pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        JSObject r = new JSObject();
        r.put("ignoree", ignoree);
        r.put("fabricant", Build.MANUFACTURER);
        r.put("android", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    /** Affiche la fenêtre système "Autoriser l'appli à toujours fonctionner en arrière-plan ?". */
    @SuppressLint("BatteryLife")
    @PluginMethod
    public void demander(PluginCall call) {
        Intent demande = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        demande.setData(Uri.parse("package:" + getContext().getPackageName()));
        if (lancer(demande) || lancer(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) || lancer(reglagesAppli())) {
            call.resolve();
        } else {
            call.reject("Impossible d'ouvrir les réglages de batterie");
        }
    }

    /** Ouvre la page de l'appli dans les Paramètres (Batterie, Notifications...). */
    @PluginMethod
    public void ouvrirReglagesAppli(PluginCall call) {
        if (lancer(reglagesAppli())) {
            call.resolve();
        } else {
            call.reject("Impossible d'ouvrir les réglages de l'appli");
        }
    }

    private Intent reglagesAppli() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        return intent;
    }

    private boolean lancer(Intent intent) {
        try {
            if (getActivity() != null) {
                getActivity().startActivity(intent);
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
