package com.insureclub.crm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;

public class ReminderReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "insureclub_alerts_v3";
    public static final String LEGACY_CHANNEL_ID = "client_moments";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return;
        }

        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "insureclub:reminder_popup");
            try {
                wakeLock.acquire(4000);
            } catch (Exception ignored) { }
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        long[] vibrationPattern = new long[]{0, 300, 200, 300};

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "InsureClub Alerts & Popups", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("High-priority popup alerts for policy renewals, birthdays, and appointments");
            channel.enableLights(true);
            channel.setLightColor(0xFF17652D);
            channel.enableVibration(true);
            channel.setVibrationPattern(vibrationPattern);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true);

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                    .build();
            channel.setSound(soundUri, audioAttributes);
            manager.createNotificationChannel(channel);
        }

        Intent openApp = new Intent(context, MainActivity.class);
        openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(context, 0, openApp, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String title = intent.getStringExtra("title");
        if (title == null || title.trim().isEmpty()) title = "InsureClub Reminder";
        String body = intent.getStringExtra("body");
        if (body == null || body.trim().isEmpty()) body = "You have a scheduled insurance reminder.";
        int notificationId = intent.getIntExtra("notificationId", (int) System.currentTimeMillis());
        String reminderKey = intent.getStringExtra("reminderKey");

        if (reminderKey != null) {
            java.util.Set<String> delivered = new java.util.HashSet<>(context.getSharedPreferences("insureclub_native", Context.MODE_PRIVATE).getStringSet("delivered_reminders", java.util.Collections.emptySet()));
            delivered.add(reminderKey);
            context.getSharedPreferences("insureclub_native", Context.MODE_PRIVATE).edit().putStringSet("delivered_reminders", delivered).apply();
        }

        Notification.Builder builder = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setPriority(Notification.PRIORITY_MAX) // Required for heads-up popup banner
                .setDefaults(Notification.DEFAULT_ALL)
                .setSound(soundUri)
                .setVibrate(vibrationPattern)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory(Notification.CATEGORY_REMINDER);

        manager.notify(notificationId, builder.build());
    }
}
