package com.footballtrainingboard.platform;

import android.graphics.Color;
import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.rgb(10, 10, 15));
        getWindow().setNavigationBarColor(Color.rgb(10, 10, 15));
        super.onCreate(savedInstanceState);
    }
}
