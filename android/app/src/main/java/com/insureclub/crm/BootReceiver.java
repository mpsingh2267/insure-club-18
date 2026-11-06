package com.insureclub.crm;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String payload = context.getSharedPreferences("insureclub_native", Context.MODE_PRIVATE).getString("reminder_payload", null);
        if (payload != null) ReminderScheduler.sync(context, payload);
    }
}
