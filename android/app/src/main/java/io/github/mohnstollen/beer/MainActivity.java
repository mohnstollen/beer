package io.github.mohnstollen.beer;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Eigene Plugins vor super.onCreate registrieren
        registerPlugin(WebDavPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
