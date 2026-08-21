package com.sekerchat.android;

import android.content.Intent;
import android.content.SharedPreferences;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String SETUP_PAGE = "https://localhost/";
    private static final String GEAR_JS =
        "(function(){" +
        "if (document.getElementById('__seker_settings_btn')) return;" +
        "var attempts = 0;" +
        "function tryInject() {" +
        "  attempts++;" +
        "  var rail = document.querySelector('aside[class*=_rail]');" +
        "  if (!rail) { if (attempts < 20) setTimeout(tryInject, 300); return; }" +
        "  var btn = document.createElement('button');" +
        "  btn.id = '__seker_settings_btn';" +
        "  btn.type = 'button';" +
        "  btn.innerHTML = '<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z\"/></svg>';" +
        "  btn.style.cssText = 'width:48px;height:48px;border-radius:14px;border:none;" +
        "background:transparent;color:rgba(255,255,255,0.4);" +
        "display:flex;align-items:center;justify-content:center;margin-top:4px;';" +
        "  btn.onclick = function(e){ e.stopPropagation(); window.location.replace('" + SETUP_PAGE + "?setup=1'); };" +
        "  rail.appendChild(btn);" +
        "}" +
        "tryInject();" +
        "})();" +
        // Auto-bind device for background notifications
        "(function(){" +
        "if (!window.__seker) return;" +
        "var bg = window.__seker.getPref('sekerchat_bg');" +
        "if (bg !== 'true') return;" +
        "var token = window.__seker.getPref('sekerchat_device_token');" +
        "if (token) return;" +
        "fetch('/api/auth/reminder/create-device', {" +
        "  method: 'POST'," +
        "  headers: { 'Content-Type': 'application/json' }," +
        "  body: JSON.stringify({ deviceName: 'sekerchatForAndroid' })" +
        "}).then(function(res) {" +
        "  if (!res.ok) return;" +
        "  return res.json();" +
        "}).then(function(data) {" +
        "  if (data && data.deviceToken) {" +
        "    window.__seker.savePref('sekerchat_device_token', data.deviceToken);" +
        "  }" +
        "}).catch(function(){})" +
        "})();";

    @Override
    public void onResume() {
        super.onResume();
        getBridge().getWebView().addJavascriptInterface(new SekerBridge(), "__seker");
        injectSettingsButton();
    }

    private void injectSettingsButton() {
        WebView webView = getBridge().getWebView();
        webView.postDelayed(() -> {
            String url = webView.getUrl();
            if (url == null || url.startsWith(SETUP_PAGE) || url.startsWith("about:")) return;
            webView.evaluateJavascript(GEAR_JS, null);
        }, 2000);
    }

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
        String url = prefs.getString("sekerchat_url", null);
        if (url != null && !url.isEmpty()) {
            getBridge().getWebView().loadUrl(url);
        }

        boolean bgEnabled = "true".equals(prefs.getString("sekerchat_bg", "false"));
        if (bgEnabled) {
            startBackgroundService();
            BootReceiver.scheduleAlarm(this);
        }
    }

    private void startBackgroundService() {
        Intent intent = new Intent(this, BackgroundService.class);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    @Override
    public void onDestroy() {
        stopService(new Intent(this, BackgroundService.class));
        super.onDestroy();
    }

    private class SekerBridge {
        @JavascriptInterface
        public void savePref(String key, String value) {
            getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
                .edit().putString(key, value).apply();
        }

        @JavascriptInterface
        public String getPref(String key) {
            return getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
                .getString(key, null);
        }
    }
}
