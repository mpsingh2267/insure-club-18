package com.insureclub.crm;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class ReminderReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "client_moments";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (android.os.Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Client moments & renewals", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Birthday, anniversary, renewal, and meeting reminders");
        manager.createNotificationChannel(channel);

        Intent openApp = new Intent(context, MainActivity.class);
        PendingIntent contentIntent = PendingIntent.getActivity(context, 0, openApp, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        int notificationId = intent.getIntExtra("notificationId", (int) System.currentTimeMillis());
        String reminderKey = intent.getStringExtra("reminderKey");
        if (reminderKey != null) {
            java.util.Set<String> delivered = new java.util.HashSet<>(context.getSharedPreferences("insureclub_native", Context.MODE_PRIVATE).getStringSet("delivered_reminders", java.util.Collections.emptySet()));
            delivered.add(reminderKey);
            context.getSharedPreferences("insureclub_native", Context.MODE_PRIVATE).edit().putStringSet("delivered_reminders", delivered).apply();
        }

        android.app.Notification notification = new android.app.Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(com.insureclub.crm.R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new android.app.Notification.BigTextStyle().bigText(body))
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .build();
        manager.notify(notificationId, notification);
    }
}
