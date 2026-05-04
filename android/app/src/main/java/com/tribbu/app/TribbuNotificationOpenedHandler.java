package com.tribbu.app;

import android.content.Context;
import android.util.Log;
import com.onesignal.notifications.INotificationClickEvent;
import com.onesignal.notifications.INotificationClickListener;
import org.json.JSONObject;

public class TribbuNotificationOpenedHandler implements INotificationClickListener {

    private static final String TAG = "TribbuNotifHandler";
    private final Context context;

    public TribbuNotificationOpenedHandler(Context context) {
        this.context = context;
    }

    @Override
    public void onClick(INotificationClickEvent event) {
        try {
            JSONObject data = event.getNotification().getAdditionalData();
            Log.d(TAG, "onClick additionalData: " + (data != null ? data.toString() : "null"));
            if (data == null) return;

            String type = data.optString("type", null);
            if (type == null) return;

            String tab = mapTypeToTab(type);
            if (tab == null) return;

            Log.d(TAG, "guardando pending_tab: " + tab);
            context.getSharedPreferences("tribbu_prefs", Context.MODE_PRIVATE)
                   .edit()
                   .putString("pending_tab", tab)
                   .apply();

        } catch (Exception e) {
            Log.e(TAG, "onClick error: " + e.getMessage());
        }
    }

    private String mapTypeToTab(String type) {
        switch (type) {
            case "recordatorio": return "recordatorios";
            case "evento":       return "clases";
            case "colecta":      return "finanzas";
            case "alerta":       return "muro";
            case "festejo":      return "cumples";
            default:             return null;
        }
    }
}
