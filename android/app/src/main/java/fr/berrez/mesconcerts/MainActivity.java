package fr.berrez.mesconcerts;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins maison (batterie, mise à jour) : à enregistrer avant super.onCreate.
        registerPlugin(BatteriePlugin.class);
        registerPlugin(MiseAJourPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
