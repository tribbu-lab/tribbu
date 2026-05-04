package com.tribbu.app;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "TribbuMainActivity";
    private boolean webViewReady = false;
    private boolean handlerRegistered = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        // Registrar el handler de OneSignal aquí, después de que el plugin se inicializa
        if (!handlerRegistered) {
            try {
                com.onesignal.OneSignal.getNotifications()
                    .addClickListener(new TribbuNotificationOpenedHandler(this));
                handlerRegistered = true;
                Log.d(TAG, "OneSignal click listener registrado OK");
            } catch (Exception e) {
                Log.e(TAG, "OneSignal no listo aún, reintentando en onResume: " + e.getMessage());
            }
        }

        // Hookeamos el WebViewClient para saber cuando la pagina termino de cargar
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                WebView wv = getBridge().getWebView();
                wv.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);
                        Log.d(TAG, "onPageFinished: " + url);
                        webViewReady = true;
                        checkPendingTab();
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "onStart hook error: " + e.getMessage());
            }
        }, 100);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Reintentar registro del handler si no se pudo en onStart
        if (!handlerRegistered) {
            try {
                com.onesignal.OneSignal.getNotifications()
                    .addClickListener(new TribbuNotificationOpenedHandler(this));
                handlerRegistered = true;
                Log.d(TAG, "OneSignal click listener registrado en onResume OK");
            } catch (Exception e) {
                Log.e(TAG, "OneSignal registro fallido en onResume: " + e.getMessage());
            }
        }
        if (webViewReady) {
            checkPendingTab();
        }
    }

    private void checkPendingTab() {
        String tab = getSharedPreferences("tribbu_prefs", MODE_PRIVATE)
                         .getString("pending_tab", null);
        if (tab == null) return;

        getSharedPreferences("tribbu_prefs", MODE_PRIVATE)
            .edit().remove("pending_tab").apply();

        Log.d(TAG, "pendingTab encontrado: " + tab);

        final String finalTab = tab;
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                String js = "window._tribbuPendingTab = '" + finalTab + "';" +
                            "window.dispatchEvent(new CustomEvent('tribbu:navigate'," +
                            "{ detail: { tab: '" + finalTab + "' } }));";
                getBridge().getWebView().evaluateJavascript(js, result -> {
                    Log.d(TAG, "JS ejecutado result: " + result);
                });
            } catch (Exception e) {
                Log.e(TAG, "evaluateJavascript error: " + e.getMessage());
            }
        });
    }
}
