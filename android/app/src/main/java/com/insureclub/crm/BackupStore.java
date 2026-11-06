package com.insureclub.crm;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.time.Instant;

public final class BackupStore {
    private static final String MAGIC = "INSURECLUB_BACKUP";
    private BackupStore() {}

    public static File policyDocument(Context context, String policyId) {
        File directory = new File(context.getFilesDir(), "policy_documents");
        if (!directory.exists()) directory.mkdirs();
        return new File(directory, safeId(policyId) + ".pdf");
    }

    public static String copyPolicyDocument(Context context, Uri uri, String policyId) throws Exception {
        File target = policyDocument(context, policyId);
        File temporary = new File(target.getParentFile(), target.getName() + ".tmp");
        try (InputStream in = context.getContentResolver().openInputStream(uri); FileOutputStream out = new FileOutputStream(temporary)) {
            if (in == null) throw new IllegalArgumentException("The selected PDF could not be read.");
            byte[] header = new byte[5]; int count = in.read(header);
            if (count != 5 || !new String(header, StandardCharsets.US_ASCII).equals("%PDF-")) throw new IllegalArgumentException("Please select a valid PDF file.");
            out.write(header); copy(in, out); out.getFD().sync();
        }
        Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        String name = queryDisplayName(context, uri);
        return name == null || name.trim().isEmpty() ? "Policy.pdf" : name;
    }

    public static JSONObject writeLatest(Context context, String snapshot, String reason) throws Exception {
        JSONObject bundle = buildBundle(context, snapshot, reason);
        File directory = new File(context.getFilesDir(), "backups"); if (!directory.exists()) directory.mkdirs();
        File target = new File(directory, "latest.icbackup"); File temporary = new File(directory, "latest.icbackup.tmp");
        try (FileOutputStream out = new FileOutputStream(temporary)) { out.write(bundle.toString().getBytes(StandardCharsets.UTF_8)); out.getFD().sync(); }
        Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        return new JSONObject().put("available", true).put("backupDate", bundle.getString("backupDate")).put("reason", reason).put("size", target.length());
    }

    public static JSONObject buildBundle(Context context, String snapshot, String reason) throws Exception {
        JSONObject state = new JSONObject(snapshot);
        if (state.optInt("schemaVersion", 0) < 2) throw new IllegalArgumentException("Unsupported CRM data version.");
        JSONObject documents = new JSONObject(); JSONArray policies = state.optJSONArray("policies");
        if (policies != null) for (int i = 0; i < policies.length(); i++) {
            JSONObject policy = policies.optJSONObject(i); if (policy == null || !policy.optBoolean("hasDocument")) continue;
            String id = policy.optString("id"); File file = policyDocument(context, id);
            if (file.exists()) documents.put(id, new JSONObject().put("filename", policy.optString("documentName", "Policy.pdf")).put("mime", "application/pdf").put("data", Base64.encodeToString(Files.readAllBytes(file.toPath()), Base64.NO_WRAP)));
        }
        return new JSONObject().put("format", MAGIC).put("formatVersion", 1).put("backupDate", Instant.now().toString()).put("reason", reason).put("state", state).put("documents", documents);
    }

    public static JSONObject validateBundle(byte[] bytes) throws Exception {
        JSONObject bundle = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        if (!MAGIC.equals(bundle.optString("format"))) throw new IllegalArgumentException("This is not an InsureClub backup file.");
        if (bundle.optInt("formatVersion") != 1) throw new IllegalArgumentException("This backup version is not supported.");
        JSONObject state = bundle.optJSONObject("state");
        if (state == null || state.optInt("schemaVersion", 0) < 2) throw new IllegalArgumentException("The backup data is incomplete or incompatible.");
        requireArray(state, "customers"); requireArray(state, "familyMembers"); requireArray(state, "policies"); requireArray(state, "reminders"); requireArray(state, "appointments"); requireArray(state, "messageTemplates");
        return bundle;
    }

    public static JSONObject readLatest(Context context) throws Exception {
        File file = new File(new File(context.getFilesDir(), "backups"), "latest.icbackup");
        if (!file.exists()) throw new IllegalStateException("No automatic backup is available yet.");
        JSONObject bundle = validateBundle(Files.readAllBytes(file.toPath())); installDocuments(context, bundle, "replace"); return bundle;
    }

    public static JSONObject backupInfo(Context context) {
        try {
            File file = new File(new File(context.getFilesDir(), "backups"), "latest.icbackup"); if (!file.exists()) return new JSONObject().put("available", false);
            JSONObject bundle = validateBundle(Files.readAllBytes(file.toPath())); return new JSONObject().put("available", true).put("backupDate", bundle.optString("backupDate")).put("size", file.length());
        } catch (Exception error) { return new JSONObject(); }
    }

    public static void installDocuments(Context context, JSONObject bundle, String mode) throws Exception {
        JSONObject documents = bundle.optJSONObject("documents"); if (documents == null) return;
        if ("replace".equals(mode)) { File[] files = new File(context.getFilesDir(), "policy_documents").listFiles(); if (files != null) for (File file : files) file.delete(); }
        java.util.Iterator<String> ids = documents.keys();
        while (ids.hasNext()) {
            String id = ids.next(); JSONObject item = documents.optJSONObject(id); if (item == null) continue;
            byte[] content = Base64.decode(item.getString("data"), Base64.DEFAULT);
            if (content.length < 5 || !new String(content, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")) throw new IllegalArgumentException("A policy document in the backup is invalid.");
            try (FileOutputStream out = new FileOutputStream(policyDocument(context, id))) { out.write(content); out.getFD().sync(); }
        }
    }

    public static void openPolicyDocument(Activity activity, String policyId, boolean share) {
        try {
            File file = policyDocument(activity, policyId); if (!file.exists()) throw new IllegalStateException("Policy PDF not found.");
            Uri uri = Uri.parse("content://" + activity.getPackageName() + ".documents/policy/" + safeId(policyId));
            Intent intent = share ? new Intent(Intent.ACTION_SEND).setType("application/pdf").putExtra(Intent.EXTRA_STREAM, uri) : new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/pdf");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); activity.startActivity(share ? Intent.createChooser(intent, "Share policy") : intent);
        } catch (Exception error) { android.widget.Toast.makeText(activity, error.getMessage(), android.widget.Toast.LENGTH_LONG).show(); }
    }

    public static byte[] readLimited(InputStream in, int limit) throws Exception {
        if (in == null) throw new IllegalArgumentException("The selected file could not be read.");
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count, total = 0;
        while ((count = in.read(buffer)) != -1) { total += count; if (total > limit) throw new IllegalArgumentException("Backup exceeds the 120 MB safety limit."); out.write(buffer, 0, count); }
        return out.toByteArray();
    }

    public static void copy(InputStream in, java.io.OutputStream out) throws Exception {
        byte[] buffer = new byte[8192]; int count;
        while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
    }

    private static void requireArray(JSONObject state, String key) { if (state.optJSONArray(key) == null) throw new IllegalArgumentException("Backup is missing " + key + "."); }
    private static String safeId(String value) { return value == null ? "unknown" : value.replaceAll("[^A-Za-z0-9_-]", "_"); }
    private static String queryDisplayName(Context context, Uri uri) {
        try (Cursor cursor = context.getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) { int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME); if (index >= 0) return cursor.getString(index); }
        } return null;
    }
}
