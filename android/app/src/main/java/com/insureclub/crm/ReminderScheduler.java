package com.insureclub.crm;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.MonthDay;
import java.time.ZoneId;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

public final class ReminderScheduler {
    private static final String PREFS = "insureclub_native";
    private ReminderScheduler() {}

    public static void sync(Context context, String payload) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putString("reminder_payload", payload).apply(); cancelPreviouslyScheduled(context, prefs);
        Set<String> codes = new HashSet<>(); Set<String> delivered = prefs.getStringSet("delivered_reminders", Collections.emptySet());
        try {
            JSONObject root = new JSONObject(payload);
            scheduleBirthdays(context, root.optJSONArray("customers"), "dateOfBirth", "birthday", codes, delivered);
            scheduleBirthdays(context, root.optJSONArray("familyMembers"), "dateOfBirth", "family birthday", codes, delivered);
            scheduleAnniversaries(context, root.optJSONArray("customers"), codes, delivered);
            schedulePolicyRenewals(context, root.optJSONArray("policies"), codes, delivered);
            scheduleDated(context, root.optJSONArray("appointments"), "appointment", codes, delivered);
            scheduleDated(context, root.optJSONArray("reminders"), "reminder", codes, delivered);
        } catch (Exception ignored) { }
        prefs.edit().putStringSet("scheduled_alarm_codes", codes).apply();
    }

    private static void scheduleBirthdays(Context context, JSONArray items, String field, String label, Set<String> codes, Set<String> delivered) {
        if (items == null) return;
        for (int i=0;i<items.length();i++) {
            JSONObject item=items.optJSONObject(i); if(item==null)continue; String id=item.optString("id",String.valueOf(i)); String name=item.optString("name",item.optString("fullName","Client"));
            LocalDate date=nextAnnual(item.optString(field)); if(date==null)continue;
            schedule(context,label+"-eve-"+id+"-"+date,date.minusDays(1),LocalTime.of(9,0),"Birthday tomorrow · "+name,"Prepare a personalized birthday message for "+name+".",codes,delivered);
            schedule(context,label+"-day-"+id+"-"+date,date,LocalTime.of(8,0),"Birthday today · "+name,"Open InsureClub to send "+name+" a personalized wish.",codes,delivered);
        }
    }

    private static void scheduleAnniversaries(Context context, JSONArray items, Set<String> codes, Set<String> delivered) {
        if(items==null)return; for(int i=0;i<items.length();i++){JSONObject item=items.optJSONObject(i);if(item==null)continue;String id=item.optString("id",String.valueOf(i));String name=item.optString("name","Client");LocalDate date=nextAnnual(item.optString("anniversaryDate"));if(date==null)continue;
            schedule(context,"anniversary-eve-"+id+"-"+date,date.minusDays(1),LocalTime.of(9,0),"Anniversary tomorrow · "+name,"Prepare a thoughtful anniversary message.",codes,delivered);
            schedule(context,"anniversary-day-"+id+"-"+date,date,LocalTime.of(8,0),"Anniversary today · "+name,"Open InsureClub to send a personalized anniversary wish.",codes,delivered);}
    }

    private static void schedulePolicyRenewals(Context context, JSONArray policies, Set<String> codes, Set<String> delivered) {
        if(policies==null)return; int[] leads={30,15,7,3,0};
        for(int i=0;i<policies.length();i++){JSONObject p=policies.optJSONObject(i);if(p==null||!"Active".equalsIgnoreCase(p.optString("status","Active")))continue;LocalDate due=parseDate(p.optString("renewalDueDate"));if(due==null)continue;String id=p.optString("id",String.valueOf(i));String customer=p.optString("customerName","Client");String name=p.optString("productName",p.optString("planName","Policy"));
            for(int lead:leads){String title=lead==0?"Policy renewal due today":"Policy renewal in "+lead+" days";schedule(context,"renewal-"+lead+"-"+id+"-"+due,due.minusDays(lead),LocalTime.of(9,0),title,customer+" · "+name+" · due "+due,codes,delivered);}}
    }

    private static void scheduleDated(Context context, JSONArray items, String kind, Set<String> codes, Set<String> delivered) {
        if(items==null)return;for(int i=0;i<items.length();i++){JSONObject item=items.optJSONObject(i);if(item==null)continue;String status=item.optString("status");if("Completed".equalsIgnoreCase(status)||"Cancelled".equalsIgnoreCase(status))continue;String value=item.optString("reminderAt",item.optString("date"));if(value.trim().isEmpty())continue;LocalDateTime at;try{at=value.length()>10?LocalDateTime.parse(value.substring(0,16)):LocalDateTime.of(LocalDate.parse(value.substring(0,10)),LocalTime.of(9,0));}catch(Exception e){continue;}String id=item.optString("id",String.valueOf(i));String customer=item.optString("customerName","Client");String activity=item.optString("activity",item.optString("purpose",kind));String notes=item.optString("notes");scheduleAt(context,kind+"-"+id+"-"+at,at,"InsureClub · "+activity,customer+(notes.trim().isEmpty()?"":" · "+notes),codes,delivered);}
    }

    private static LocalDate nextAnnual(String value){LocalDate original=parseDate(value);if(original==null)return null;MonthDay md=MonthDay.from(original);LocalDate today=LocalDate.now();LocalDate next;try{next=md.atYear(today.getYear());}catch(Exception e){next=LocalDate.of(today.getYear(),2,28);}if(next.isBefore(today))try{next=md.atYear(today.getYear()+1);}catch(Exception e){next=LocalDate.of(today.getYear()+1,2,28);}return next;}
    private static LocalDate parseDate(String value){if(value==null||value.trim().isEmpty())return null;try{return LocalDate.parse(value.substring(0,10));}catch(Exception e){return null;}}
    private static void schedule(Context c,String key,LocalDate d,LocalTime t,String title,String body,Set<String> codes,Set<String> delivered){scheduleAt(c,key,LocalDateTime.of(d,t),title,body,codes,delivered);}
    private static void scheduleAt(Context context,String key,LocalDateTime moment,String title,String body,Set<String> codes,Set<String> delivered){LocalDateTime now=LocalDateTime.now();if(moment.isBefore(now)){if(!moment.toLocalDate().equals(LocalDate.now()))return;moment=now.plusSeconds(8);}if(moment.isAfter(now.plusDays(370))||delivered.contains(key))return;int requestCode=key.hashCode()&0x7fffffff;Intent intent=new Intent(context,ReminderReceiver.class).setAction("com.insureclub.crm.REMINDER."+requestCode).putExtra("title",title).putExtra("body",body).putExtra("notificationId",requestCode).putExtra("reminderKey",key);PendingIntent pending=PendingIntent.getBroadcast(context,requestCode,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);((AlarmManager)context.getSystemService(Context.ALARM_SERVICE)).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,moment.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli(),pending);codes.add(String.valueOf(requestCode));}
    private static void cancelPreviouslyScheduled(Context context,SharedPreferences prefs){AlarmManager alarms=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);for(String value:prefs.getStringSet("scheduled_alarm_codes",Collections.emptySet()))try{int code=Integer.parseInt(value);Intent intent=new Intent(context,ReminderReceiver.class).setAction("com.insureclub.crm.REMINDER."+code);PendingIntent pending=PendingIntent.getBroadcast(context,code,intent,PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);if(pending!=null){alarms.cancel(pending);pending.cancel();}}catch(Exception ignored){} }
}
