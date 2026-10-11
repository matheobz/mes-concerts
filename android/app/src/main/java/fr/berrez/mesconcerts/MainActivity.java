package fr.berrez.mesconcerts;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin maison (batterie) : à enregistrer avant super.onCreate.
        registerPlugin(BatteriePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
