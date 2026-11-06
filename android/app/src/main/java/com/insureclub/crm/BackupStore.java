package com.insureclub.crm;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;

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

    public static File documentsDirectory(Context context) {
        File directory = new File(context.getFilesDir(), "documents");
        if (!directory.exists()) directory.mkdirs();
        return directory;
    }

    public static File findAnyDocument(Context context, String idOrName) {
        if (idOrName == null) return null;
        File docDir = documentsDirectory(context);
        File direct = new File(docDir, idOrName);
        if (direct.exists()) return direct;

        String safe = safeId(idOrName);
        File[] docFiles = docDir.listFiles();
        if (docFiles != null) {
            for (File f : docFiles) {
                if (f.getName().startsWith(safe + ".") || f.getName().equals(safe)) return f;
            }
        }

        File polDir = new File(context.getFilesDir(), "policy_documents");
        File polDirect = new File(polDir, safe + ".pdf");
        if (polDirect.exists()) return polDirect;
        File polExact = new File(polDir, idOrName);
        if (polExact.exists()) return polExact;

        return null;
    }

    public static String copyPolicyDocument(Context context, Uri uri, String policyId) throws Exception {
        File target = policyDocument(context, policyId);
        File temporary = new File(target.getParentFile(), target.getName() + ".tmp");
        try (InputStream in = context.getContentResolver().openInputStream(uri); FileOutputStream out = new FileOutputStream(temporary)) {
            if (in == null) throw new IllegalArgumentException("The selected PDF could not be read.");
            byte[] header = new byte[5];
            int count = in.read(header);
            if (count != 5 || !new String(header, StandardCharsets.US_ASCII).equals("%PDF-")) {
                throw new IllegalArgumentException("Please select a valid PDF file.");
            }
            out.write(header);
            copy(in, out);
            out.getFD().sync();
        }
        Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        String name = queryDisplayName(context, uri);
        return name == null || name.trim().isEmpty() ? "Policy.pdf" : name;
    }

    public static JSONObject saveGenericDocument(Context context, Uri uri, String docId, String docType, String docTitle) throws Exception {
        String displayName = queryDisplayName(context, uri);
        if (displayName == null || displayName.trim().isEmpty()) {
            displayName = (docTitle != null && !docTitle.trim().isEmpty()) ? docTitle : "Document";
        }

        byte[] header = new byte[16];
        int headerRead;
        File temp = File.createTempFile("ic_doc_", ".tmp", context.getCacheDir());
        try (InputStream in = context.getContentResolver().openInputStream(uri); FileOutputStream out = new FileOutputStream(temp)) {
            if (in == null) throw new IllegalArgumentException("Could not read attached file.");
            headerRead = in.read(header);
            if (headerRead > 0) out.write(header, 0, headerRead);
            copy(in, out);
            out.getFD().sync();
        }

        String ext = "pdf";
        String mime = "application/pdf";
        if (headerRead >= 4) {
            if (headerRead >= 5 && new String(header, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")) {
                ext = "pdf";
                mime = "application/pdf";
            } else if ((header[0] & 0xFF) == 0xFF && (header[1] & 0xFF) == 0xD8) {
                ext = "jpg";
                mime = "image/jpeg";
            } else if ((header[0] & 0xFF) == 0x89 && header[1] == 'P' && header[2] == 'N' && header[3] == 'G') {
                ext = "png";
                mime = "image/png";
            } else if (headerRead >= 12 && header[0] == 'R' && header[1] == 'I' && header[2] == 'F' && header[3] == 'F' &&
                       header[8] == 'W' && header[9] == 'E' && header[10] == 'B' && header[11] == 'P') {
                ext = "webp";
                mime = "image/webp";
            } else {
                int dot = displayName.lastIndexOf('.');
                if (dot >= 0) {
                    ext = displayName.substring(dot + 1).toLowerCase();
                    String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                    if (m != null) mime = m;
                }
            }
        }

        File target = new File(documentsDirectory(context), safeId(docId) + "." + ext);
        Files.move(temp.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);

        JSONObject meta = new JSONObject();
        meta.put("id", docId);
        meta.put("title", docTitle != null && !docTitle.trim().isEmpty() ? docTitle : displayName);
        meta.put("documentType", docType != null && !docType.trim().isEmpty() ? docType : "General");
        meta.put("fileName", displayName);
        meta.put("fileSize", target.length());
        meta.put("mimeType", mime);
        meta.put("extension", ext);
        meta.put("storedFileName", target.getName());
        return meta;
    }

    public static void openAnyDocument(Activity activity, String docId, boolean share) {
        try {
            File file = findAnyDocument(activity, docId);
            if (file == null || !file.exists()) throw new IllegalStateException("Attached document file not found.");

            Uri uri = Uri.parse("content://" + activity.getPackageName() + ".documents/" + file.getName());
            String mime = "application/octet-stream";
            int dot = file.getName().lastIndexOf('.');
            if (dot >= 0) {
                String ext = file.getName().substring(dot + 1).toLowerCase();
                String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                if (m != null) mime = m;
            }

            Intent intent = share
                    ? new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                    : new Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(share ? Intent.createChooser(intent, "Share Document") : intent);
        } catch (Exception error) {
            android.widget.Toast.makeText(activity, error.getMessage(), android.widget.Toast.LENGTH_LONG).show();
        }
    }

    public static void deleteAnyDocument(Context context, String docId) {
        File file = findAnyDocument(context, docId);
        if (file != null && file.exists()) {
            file.delete();
        }
    }

    public static JSONObject writeLatest(Context context, String snapshot, String reason) throws Exception {
        JSONObject bundle = buildBundle(context, snapshot, reason);
        File directory = new File(context.getFilesDir(), "backups");
        if (!directory.exists()) directory.mkdirs();
        File target = new File(directory, "latest.icbackup");
        File temporary = new File(directory, "latest.icbackup.tmp");
        try (FileOutputStream out = new FileOutputStream(temporary)) {
            out.write(bundle.toString().getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        return new JSONObject().put("available", true).put("backupDate", bundle.getString("backupDate")).put("reason", reason).put("size", target.length());
    }

    public static JSONObject buildBundle(Context context, String snapshot, String reason) throws Exception {
        JSONObject state = new JSONObject(snapshot);
        if (state.optInt("schemaVersion", 0) < 2) throw new IllegalArgumentException("Unsupported CRM data version.");

        JSONObject documents = new JSONObject();
        JSONArray policies = state.optJSONArray("policies");
        if (policies != null) {
            for (int i = 0; i < policies.length(); i++) {
                JSONObject policy = policies.optJSONObject(i);
                if (policy == null || !policy.optBoolean("hasDocument")) continue;
                String id = policy.optString("id");
                File file = policyDocument(context, id);
                if (file.exists()) {
                    documents.put(id, new JSONObject()
                            .put("filename", policy.optString("documentName", "Policy.pdf"))
                            .put("mime", "application/pdf")
                            .put("data", Base64.encodeToString(Files.readAllBytes(file.toPath()), Base64.NO_WRAP)));
                }
            }
        }

        JSONObject genericDocs = new JSONObject();
        JSONArray docList = state.optJSONArray("documents");
        if (docList != null) {
            for (int i = 0; i < docList.length(); i++) {
                JSONObject doc = docList.optJSONObject(i);
                if (doc == null) continue;
                String id = doc.optString("id");
                File file = findAnyDocument(context, id);
                if (file != null && file.exists()) {
                    genericDocs.put(id, new JSONObject()
                            .put("filename", file.getName())
                            .put("displayName", doc.optString("fileName", file.getName()))
                            .put("mime", doc.optString("mimeType", "application/octet-stream"))
                            .put("data", Base64.encodeToString(Files.readAllBytes(file.toPath()), Base64.NO_WRAP)));
                }
            }
        }

        return new JSONObject()
                .put("format", MAGIC)
                .put("formatVersion", 1)
                .put("backupDate", Instant.now().toString())
                .put("reason", reason)
                .put("state", state)
                .put("documents", documents)
                .put("genericDocuments", genericDocs);
    }

    public static JSONObject validateBundle(byte[] bytes) throws Exception {
        JSONObject bundle = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        if (!MAGIC.equals(bundle.optString("format"))) throw new IllegalArgumentException("This is not an InsureClub backup file.");
        if (bundle.optInt("formatVersion") != 1) throw new IllegalArgumentException("This backup version is not supported.");
        JSONObject state = bundle.optJSONObject("state");
        if (state == null || state.optInt("schemaVersion", 0) < 2) throw new IllegalArgumentException("The backup data is incomplete or incompatible.");
        requireArray(state, "customers");
        requireArray(state, "familyMembers");
        requireArray(state, "policies");
        requireArray(state, "reminders");
        requireArray(state, "appointments");
        requireArray(state, "messageTemplates");
        return bundle;
    }

    public static JSONObject readLatest(Context context) throws Exception {
        File file = new File(new File(context.getFilesDir(), "backups"), "latest.icbackup");
        if (!file.exists()) throw new IllegalStateException("No automatic backup is available yet.");
        JSONObject bundle = validateBundle(Files.readAllBytes(file.toPath()));
        installDocuments(context, bundle, "replace");
        return bundle;
    }

    public static JSONObject backupInfo(Context context) {
        try {
            File file = new File(new File(context.getFilesDir(), "backups"), "latest.icbackup");
            if (!file.exists()) return new JSONObject().put("available", false);
            JSONObject bundle = validateBundle(Files.readAllBytes(file.toPath()));
            return new JSONObject().put("available", true).put("backupDate", bundle.optString("backupDate")).put("size", file.length());
        } catch (Exception error) {
            return new JSONObject();
        }
    }

    public static void installDocuments(Context context, JSONObject bundle, String mode) throws Exception {
        JSONObject documents = bundle.optJSONObject("documents");
        if (documents != null) {
            if ("replace".equals(mode)) {
                File[] files = new File(context.getFilesDir(), "policy_documents").listFiles();
                if (files != null) for (File file : files) file.delete();
            }
            java.util.Iterator<String> ids = documents.keys();
            while (ids.hasNext()) {
                String id = ids.next();
                JSONObject item = documents.optJSONObject(id);
                if (item == null) continue;
                byte[] content = Base64.decode(item.getString("data"), Base64.DEFAULT);
                try (FileOutputStream out = new FileOutputStream(policyDocument(context, id))) {
                    out.write(content);
                    out.getFD().sync();
                }
            }
        }

        JSONObject genericDocs = bundle.optJSONObject("genericDocuments");
        if (genericDocs != null) {
            File docDir = documentsDirectory(context);
            if ("replace".equals(mode)) {
                File[] files = docDir.listFiles();
                if (files != null) for (File file : files) file.delete();
            }
            java.util.Iterator<String> gIds = genericDocs.keys();
            while (gIds.hasNext()) {
                String id = gIds.next();
                JSONObject item = genericDocs.optJSONObject(id);
                if (item == null) continue;
                byte[] content = Base64.decode(item.getString("data"), Base64.DEFAULT);
                String filename = item.optString("filename", safeId(id) + ".pdf");
                File target = new File(docDir, filename);
                try (FileOutputStream out = new FileOutputStream(target)) {
                    out.write(content);
                    out.getFD().sync();
                }
            }
        }
    }

    public static void openPolicyDocument(Activity activity, String policyId, boolean share) {
        openAnyDocument(activity, policyId, share);
    }

    public static byte[] readLimited(InputStream in, int limit) throws Exception {
        if (in == null) throw new IllegalArgumentException("The selected file could not be read.");
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count, total = 0;
        while ((count = in.read(buffer)) != -1) {
            total += count;
            if (total > limit) throw new IllegalArgumentException("Backup exceeds the 120 MB safety limit.");
            out.write(buffer, 0, count);
        }
        return out.toByteArray();
    }

    public static void copy(InputStream in, java.io.OutputStream out) throws Exception {
        byte[] buffer = new byte[8192];
        int count;
        while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
    }

    private static void requireArray(JSONObject state, String key) {
        if (state.optJSONArray(key) == null) throw new IllegalArgumentException("Backup is missing " + key + ".");
    }

    private static String safeId(String value) {
        return value == null ? "unknown" : value.replaceAll("[^A-Za-z0-9_-]", "_");
    }

    private static String queryDisplayName(Context context, Uri uri) {
        try (Cursor cursor = context.getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) { }
        return null;
    }
}
