package com.sekerchat.android;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "SekerChatAlarm";
    private static final int ALARM_INTERVAL_MIN = 2;
    private static final String CHANNEL_ID = "sekerchat_messages";
    private static final int MSG_NOTIFY_BASE = 2000;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        boolean bgEnabled = "true".equals(prefs.getString("sekerchat_bg", "false"));
        if (!bgEnabled) {
            cancelAlarm(context);
            return;
        }

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            scheduleAlarm(context);
            return;
        }

        if ("com.sekerchat.android.ALARM".equals(action)) {
            Log.d(TAG, "alarm fired, polling for messages");
            startServiceIfNeeded(context);
            // Run network poll on background thread (receiver runs on main thread)
            new Thread(() -> pollMessages(context)).start();
            scheduleAlarm(context);
        }
    }

    private void startServiceIfNeeded(Context context) {
        Intent si = new Intent(context, BackgroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(si);
        } else {
            context.startService(si);
        }
    }

    private void pollMessages(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String baseUrl = prefs.getString("sekerchat_url", null);
        String token = prefs.getString("sekerchat_device_token", null);
        if (baseUrl == null || token == null) return;

        try {
            String apiUrl = baseUrl.replaceAll("/+$", "") + "/api/realtime/events?limit=5";
            HttpURLConnection conn = (HttpURLConnection) new URL(apiUrl).openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("x-reminder-device-token", token);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            if (conn.getResponseCode() != 200) {
                conn.disconnect();
                return;
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder body = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
            reader.close();
            conn.disconnect();

            JSONObject json = new JSONObject(body.toString());
            JSONArray events = json.optJSONArray("events");
            if (events == null || events.length() == 0) return;

            for (int i = 0; i < events.length(); i++) {
                JSONObject ev = events.getJSONObject(i);
                int eventVersion = ev.optInt("eventVersion", -1);
                String type = ev.optString("type");
                if (eventVersion != 1 || !"message.created.v1".equals(type)) continue;
                JSONObject payload = ev.optJSONObject("payload");
                String text = payload != null ? payload.optString("text", "新消息") : "新消息";
                String groupId = ev.optString("groupId", "");
                showNotification(context, text, groupId);
            }
        } catch (Exception e) {
            Log.w(TAG, "poll failed: " + e.getMessage());
        }
    }

    private void showNotification(Context context, String text, String groupId) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "新消息", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("SekerChat 消息通知");
            nm.createNotificationChannel(ch);
        }

        String body = text.length() > 120 ? text.substring(0, 120) : text;

        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification n = new Notification.Builder(context, CHANNEL_ID)
            .setContentTitle("新消息")
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build();

        nm.notify(MSG_NOTIFY_BASE + Math.abs(groupId.hashCode() % 100), n);
    }

    public static void scheduleAlarm(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent intent = new Intent(context, BootReceiver.class);
        intent.setAction("com.sekerchat.android.ALARM");
        PendingIntent pending = PendingIntent.getBroadcast(
            context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        long intervalMs = ALARM_INTERVAL_MIN * 60 * 1000L;
        long triggerAtMs = System.currentTimeMillis() + intervalMs;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
            Log.w(TAG, "exact alarm permission missing, skipping background poll schedule");
            cancelAlarm(context);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pending);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, pending);
        }
    }

    public static void cancelAlarm(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent intent = new Intent(context, BootReceiver.class);
        intent.setAction("com.sekerchat.android.ALARM");
        PendingIntent pending = PendingIntent.getBroadcast(
            context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        am.cancel(pending);
    }
}
