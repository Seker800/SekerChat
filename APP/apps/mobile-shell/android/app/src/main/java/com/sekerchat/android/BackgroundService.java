package com.sekerchat.android;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;
import android.net.Uri;
import android.util.Log;
import java.io.IOException;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONObject;

public class BackgroundService extends Service {
    private static final String TAG = "SekerChatBg";
    private static final String CHANNEL_KEEPALIVE = "sekerchat_keepalive";
    private static final String CHANNEL_MESSAGES = "sekerchat_messages";
    private static final int NOTIFICATION_ID = 1;
    private static final int MSG_NOTIFICATION_ID = 1000;

    private OkHttpClient httpClient;
    private WebSocket webSocket;
    private Call ticketCall;
    private boolean ticketRequestInFlight = false;
    private boolean destroyed = false;
    private int reconnectDelay = 1;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
        startForeground(NOTIFICATION_ID, buildKeepAliveNotification());
        httpClient = new OkHttpClient.Builder()
            .pingInterval(25, TimeUnit.SECONDS)
            .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        connectWebSocket();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        destroyed = true;
        if (webSocket != null) {
            webSocket.close(1000, "service destroyed");
        }
        if (ticketCall != null) {
            ticketCall.cancel();
        }
        stopForeground(true);
        super.onDestroy();
    }

    // ---- WebSocket ----

    private void connectWebSocket() {
        if (destroyed) return;

        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
        String url = prefs.getString("sekerchat_url", null);
        String token = prefs.getString("sekerchat_device_token", null);

        if (url == null || url.isEmpty() || token == null || token.isEmpty()) {
            Log.d(TAG, "no url or token, will retry in 30s");
            scheduleReconnect(30);
            return;
        }

        requestRealtimeTicket(url, token);
    }

    private void requestRealtimeTicket(String appUrl, String deviceToken) {
        if (ticketRequestInFlight || destroyed) return;
        ticketRequestInFlight = true;
        String ticketUrl = Uri.parse(appUrl).buildUpon()
            .path("/api/auth/reminder/realtime-ticket")
            .clearQuery()
            .fragment(null)
            .build()
            .toString();
        Request request = new Request.Builder()
            .url(ticketUrl)
            .header("x-reminder-device-token", deviceToken)
            .post(RequestBody.create(new byte[0]))
            .build();
        ticketCall = httpClient.newCall(request);
        ticketCall.enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException error) {
                ticketRequestInFlight = false;
                if (destroyed || call.isCanceled()) return;
                Log.w(TAG, "realtime ticket request failed: " + error.getClass().getSimpleName());
                scheduleReconnect(reconnectDelay);
            }

            @Override
            public void onResponse(Call call, Response response) {
                try (Response closeableResponse = response) {
                    if (!closeableResponse.isSuccessful() || closeableResponse.body() == null) {
                        Log.w(TAG, "realtime ticket rejected: " + closeableResponse.code());
                        if (closeableResponse.code() != 401 && closeableResponse.code() != 403) {
                            scheduleReconnect(reconnectDelay);
                        }
                        return;
                    }
                    String ticket = new JSONObject(closeableResponse.body().string()).optString("ticket", "");
                    if (ticket.isEmpty()) {
                        Log.w(TAG, "realtime ticket response was invalid");
                        scheduleReconnect(reconnectDelay);
                        return;
                    }
                    connectWithTicket(appUrl, ticket);
                } catch (Exception error) {
                    Log.w(TAG, "realtime ticket response failed: " + error.getClass().getSimpleName());
                    scheduleReconnect(reconnectDelay);
                } finally {
                    ticketRequestInFlight = false;
                }
            }
        });
    }

    private void connectWithTicket(String appUrl, String ticket) {
        if (destroyed) return;
        Uri appUri = Uri.parse(appUrl);
        String wsScheme = "https".equalsIgnoreCase(appUri.getScheme()) ? "wss" : "ws";
        String wsUrl = appUri.buildUpon()
            .scheme(wsScheme)
            .path("/realtime")
            .clearQuery()
            .appendQueryParameter("ticket", ticket)
            .fragment(null)
            .build()
            .toString();

        Log.d(TAG, "connecting websocket");
        Request request = new Request.Builder().url(wsUrl).build();
        webSocket = httpClient.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket ws, Response response) {
                Log.d(TAG, "websocket connected");
                reconnectDelay = 1;
            }

            @Override
            public void onMessage(WebSocket ws, String text) {
                try {
                    JSONObject event = new JSONObject(text);
                    int eventVersion = event.optInt("eventVersion", -1);
                    String type = event.optString("type");
                    if (eventVersion == 1 && "message.created.v1".equals(type)) {
                        JSONObject payload = event.optJSONObject("payload");
                        String senderId = payload != null ? payload.optString("senderId", "") : "";
                        String msgText = payload != null ? payload.optString("text", "") : "";
                        String groupId = event.optString("groupId", "");
                        showMessageNotification(senderId, msgText, groupId);
                    }
                } catch (Exception e) {
                    Log.w(TAG, "failed to parse event: " + e.getMessage());
                }
            }

            @Override
            public void onClosed(WebSocket ws, int code, String reason) {
                Log.d(TAG, "websocket closed: " + code + " " + reason);
                scheduleReconnect(reconnectDelay);
            }

            @Override
            public void onFailure(WebSocket ws, Throwable t, Response response) {
                Log.w(TAG, "websocket failure: " + t.getMessage());
                scheduleReconnect(reconnectDelay);
            }
        });
    }

    private void scheduleReconnect(int delaySeconds) {
        if (destroyed) return;
        reconnectDelay = Math.min(delaySeconds * 2, 60);
        Log.d(TAG, "reconnecting in " + delaySeconds + "s");
        new android.os.Handler(getMainLooper()).postDelayed(() -> {
            if (!destroyed) connectWebSocket();
        }, delaySeconds * 1000L);
    }

    // ---- Notifications ----

    private void showMessageNotification(String senderId, String text, String groupId) {
        String body = text != null && !text.isEmpty()
            ? text.substring(0, Math.min(text.length(), 120))
            : "新消息";

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification notification = new Notification.Builder(this, CHANNEL_MESSAGES)
            .setContentTitle("新消息")
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build();

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.notify(MSG_NOTIFICATION_ID + (groupId != null ? groupId.hashCode() % 100 : 0), notification);
        }
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;

            NotificationChannel keepAlive = new NotificationChannel(
                CHANNEL_KEEPALIVE, "后台运行", NotificationManager.IMPORTANCE_LOW);
            keepAlive.setDescription("保持 SekerChat 后台连接");
            nm.createNotificationChannel(keepAlive);

            NotificationChannel messages = new NotificationChannel(
                CHANNEL_MESSAGES, "新消息", NotificationManager.IMPORTANCE_HIGH);
            messages.setDescription("SekerChat 消息通知");
            nm.createNotificationChannel(messages);
        }
    }

    private Notification buildKeepAliveNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        return new Notification.Builder(this, CHANNEL_KEEPALIVE)
            .setContentTitle("sekerchatForAndroid")
            .setContentText("后台保持连接中")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setContentIntent(pending)
            .build();
    }
}
