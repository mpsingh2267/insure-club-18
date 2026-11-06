package com.insureclub.crm;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 118;
    private static final int REQUEST_EXPORT = 201;
    private static final int REQUEST_IMPORT = 202;
    private static final int REQUEST_POLICY_PDF = 203;
    private static final int REQUEST_DOWNLOAD_PDF = 204;
    private static final int REQUEST_ATTACHMENT = 205;

    private WebView webView;
    private byte[] pendingExport;
    private JSONObject pendingImport;
    private String pendingPolicyId;
    private String pendingDownloadPolicyId;
    private String pendingDocId;
    private String pendingDocType;
    private String pendingDocTitle;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(18, 58, 32));
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(244, 247, 244));
        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            int navigationBottom = Build.VERSION.SDK_INT >= 30
                    ? insets.getInsets(android.view.WindowInsets.Type.navigationBars()).bottom
                    : insets.getSystemWindowInsetBottom();
            view.setPadding(0, 0, 0, navigationBottom);
            return insets;
        });
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(false);
        settings.setTextZoom(100);

        webView.addJavascriptInterface(new NativeBridge(), "InsureClubNative");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("https://wa.me/") || url.startsWith("whatsapp:") || url.startsWith("tel:")) {
                    openUri(url);
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                updatePermissionState();
                evaluate("window.onNativeReady && window.onNativeReady(" + JSONObject.quote(BackupStore.backupInfo(MainActivity.this).toString()) + ")");
            }
        });
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onPause() {
        if (webView != null) evaluate("window.InsureClubAppBackup && window.InsureClubAppBackup('app-backgrounded')");
        super.onPause();
    }

    private void evaluate(String javascript) {
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(javascript, null);
        });
    }

    private void openUri(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No compatible app is installed.", Toast.LENGTH_LONG).show();
        }
    }

    private void updatePermissionState() {
        if (webView == null) return;
        boolean granted = Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        evaluate("window.onNativeNotificationPermission && window.onNativeNotificationPermission(" + granted + ")");
    }

    private void resyncReminders() {
        String payload = getSharedPreferences("insureclub_native", MODE_PRIVATE).getString("reminder_payload", null);
        if (payload != null) ReminderScheduler.sync(this, payload);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            updatePermissionState();
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                resyncReminders();
                ReminderScheduler.sendInstantPopup(this, "InsureClub Alerts Active", "Heads-up popup notifications enabled for renewals, birthdays, and appointments.");
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        try {
            if (requestCode == REQUEST_EXPORT && pendingExport != null) {
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out != null) out.write(pendingExport);
                }
                pendingExport = null;
                evaluate("window.onExportCompleted && window.onExportCompleted()");
            } else if (requestCode == REQUEST_IMPORT) {
                byte[] bytes;
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    bytes = BackupStore.readLimited(in, 120 * 1024 * 1024);
                }
                pendingImport = BackupStore.validateBundle(bytes);
                JSONObject state = pendingImport.getJSONObject("state");
                JSONObject summary = new JSONObject()
                        .put("backupDate", pendingImport.optString("backupDate"))
                        .put("customers", state.optJSONArray("customers").length())
                        .put("policies", state.optJSONArray("policies").length())
                        .put("familyMembers", state.optJSONArray("familyMembers").length());
                evaluate("window.onImportInspected && window.onImportInspected(" + JSONObject.quote(summary.toString()) + ")");
            } else if (requestCode == REQUEST_POLICY_PDF && pendingPolicyId != null) {
                String displayName = BackupStore.copyPolicyDocument(this, uri, pendingPolicyId);
                evaluate("window.onPolicyDocumentAdded && window.onPolicyDocumentAdded(" + JSONObject.quote(pendingPolicyId) + "," + JSONObject.quote(displayName) + ")");
                pendingPolicyId = null;
            } else if (requestCode == REQUEST_ATTACHMENT && pendingDocId != null) {
                JSONObject docMeta = BackupStore.saveGenericDocument(this, uri, pendingDocId, pendingDocType, pendingDocTitle);
                evaluate("window.onGenericDocumentAdded && window.onGenericDocumentAdded(" + JSONObject.quote(docMeta.toString()) + ")");
                pendingDocId = null;
                pendingDocType = null;
                pendingDocTitle = null;
            } else if (requestCode == REQUEST_DOWNLOAD_PDF && pendingDownloadPolicyId != null) {
                File source = BackupStore.findAnyDocument(this, pendingDownloadPolicyId);
                if (source == null || !source.exists()) source = BackupStore.policyDocument(this, pendingDownloadPolicyId);
                if (!source.exists()) throw new IllegalStateException("Document file not found on device.");
                try (InputStream in = new java.io.FileInputStream(source); OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out != null) BackupStore.copy(in, out);
                }
                pendingDownloadPolicyId = null;
                evaluate("window.onPolicyDownloadCompleted && window.onPolicyDownloadCompleted()");
            }
        } catch (Exception error) {
            Toast.makeText(this, error.getMessage() == null ? "The selected file could not be processed." : error.getMessage(), Toast.LENGTH_LONG).show();
            evaluate("window.onNativeFileError && window.onNativeFileError(" + JSONObject.quote(error.getMessage() == null ? "File operation failed" : error.getMessage()) + ")");
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    public class NativeBridge {
        @JavascriptInterface
        public void syncReminders(String payload) {
            ReminderScheduler.sync(MainActivity.this, payload);
        }

        @JavascriptInterface
        public void testPopupNotification(String title, String body) {
            runOnUiThread(() -> {
                String t = (title != null && !title.trim().isEmpty()) ? title : "InsureClub Alert";
                String b = (body != null && !body.trim().isEmpty()) ? body : "Test heads-up popup notification received.";
                ReminderScheduler.sendInstantPopup(MainActivity.this, t, b);
                Toast.makeText(MainActivity.this, "Popup notification sent!", Toast.LENGTH_SHORT).show();
            });
        }

        @JavascriptInterface
        public void clearDeliveredReminders() {
            ReminderScheduler.clearDeliveredHistory(MainActivity.this);
            resyncReminders();
        }

        @JavascriptInterface
        public void backupNow(String snapshot, String reason) {
            try {
                JSONObject info = BackupStore.writeLatest(MainActivity.this, snapshot, reason);
                evaluate("window.onBackupCompleted && window.onBackupCompleted(" + JSONObject.quote(info.toString()) + ")");
            } catch (Exception error) {
                evaluate("window.onNativeFileError && window.onNativeFileError(" + JSONObject.quote("Backup failed: " + error.getMessage()) + ")");
            }
        }

        @JavascriptInterface
        public String getBackupInfo() {
            return BackupStore.backupInfo(MainActivity.this).toString();
        }

        @JavascriptInterface
        public void exportData(String snapshot) {
            try {
                pendingExport = BackupStore.buildBundle(MainActivity.this, snapshot, "manual-export").toString(2).getBytes(StandardCharsets.UTF_8);
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json")
                        .putExtra(Intent.EXTRA_TITLE, "InsureClub_Backup_" + new SimpleDateFormat("yyyy-MM-dd_HHmm", Locale.US).format(new Date()) + ".icbackup");
                startActivityForResult(intent, REQUEST_EXPORT);
            } catch (Exception error) {
                evaluate("window.onNativeFileError && window.onNativeFileError(" + JSONObject.quote(error.getMessage()) + ")");
            }
        }

        @JavascriptInterface
        public void inspectImport() {
            startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE), REQUEST_IMPORT);
        }

        @JavascriptInterface
        public void commitImport(String mode) {
            try {
                if (pendingImport == null) throw new IllegalStateException("Select a backup file first.");
                BackupStore.installDocuments(MainActivity.this, pendingImport, mode);
                String state = pendingImport.getJSONObject("state").toString();
                String date = pendingImport.optString("backupDate");
                pendingImport = null;
                evaluate("window.onImportCommitted && window.onImportCommitted(" + JSONObject.quote(state) + "," + JSONObject.quote(mode) + "," + JSONObject.quote(date) + ")");
            } catch (Exception error) {
                evaluate("window.onNativeFileError && window.onNativeFileError(" + JSONObject.quote(error.getMessage()) + ")");
            }
        }

        @JavascriptInterface
        public void restoreLatestBackup() {
            try {
                JSONObject bundle = BackupStore.readLatest(MainActivity.this);
                evaluate("window.onRestoreReady && window.onRestoreReady(" + JSONObject.quote(bundle.getJSONObject("state").toString()) + "," + JSONObject.quote(bundle.optString("backupDate")) + ")");
            } catch (Exception error) {
                evaluate("window.onNativeFileError && window.onNativeFileError(" + JSONObject.quote(error.getMessage()) + ")");
            }
        }

        @JavascriptInterface
        public void selectPolicyPdf(String policyId) {
            pendingPolicyId = policyId;
            startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/pdf").addCategory(Intent.CATEGORY_OPENABLE), REQUEST_POLICY_PDF);
        }

        @JavascriptInterface
        public void selectAttachment(String docId, String docType, String docTitle) {
            pendingDocId = docId;
            pendingDocType = docType;
            pendingDocTitle = docTitle;
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .setType("*/*")
                    .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf", "image/*"})
                    .addCategory(Intent.CATEGORY_OPENABLE);
            startActivityForResult(intent, REQUEST_ATTACHMENT);
        }

        @JavascriptInterface
        public void viewDocument(String docId) {
            BackupStore.openAnyDocument(MainActivity.this, docId, false);
        }

        @JavascriptInterface
        public void shareDocument(String docId) {
            BackupStore.openAnyDocument(MainActivity.this, docId, true);
        }

        @JavascriptInterface
        public void downloadDocument(String docId, String filename) {
            try {
                File file = BackupStore.findAnyDocument(MainActivity.this, docId);
                if (file == null || !file.exists()) file = BackupStore.policyDocument(MainActivity.this, docId);
                if (file == null || !file.exists()) throw new IllegalStateException("Document not found.");

                pendingDownloadPolicyId = docId;
                String mime = "application/octet-stream";
                int dot = file.getName().lastIndexOf('.');
                if (dot >= 0) {
                    String ext = file.getName().substring(dot + 1).toLowerCase();
                    String m = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                    if (m != null) mime = m;
                }
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType(mime).putExtra(Intent.EXTRA_TITLE, filename);
                startActivityForResult(intent, REQUEST_DOWNLOAD_PDF);
            } catch (Exception error) {
                evaluate("window.onNativeFileError && window.onNativeFileError(" + JSONObject.quote(error.getMessage()) + ")");
            }
        }

        @JavascriptInterface
        public void deleteDocument(String docId) {
            BackupStore.deleteAnyDocument(MainActivity.this, docId);
        }

        @JavascriptInterface
        public void viewPolicyPdf(String policyId) {
            BackupStore.openPolicyDocument(MainActivity.this, policyId, false);
        }

        @JavascriptInterface
        public void sharePolicyPdf(String policyId) {
            BackupStore.openPolicyDocument(MainActivity.this, policyId, true);
        }

        @JavascriptInterface
        public void downloadPolicyPdf(String policyId, String filename) {
            downloadDocument(policyId, filename);
        }

        @JavascriptInterface
        public void deletePolicyPdf(String policyId) {
            deleteDocument(policyId);
        }

        @JavascriptInterface
        public void openWhatsApp(String phone, String message) {
            runOnUiThread(() -> {
                String digits = phone == null ? "" : phone.replaceAll("[^0-9]", "");
                String encoded = URLEncoder.encode(message == null ? "" : message, StandardCharsets.UTF_8).replace("+", "%20");
                openUri("https://wa.me/" + digits + "?text=" + encoded);
            });
        }

        @JavascriptInterface
        public void callPhone(String phone) {
            runOnUiThread(() -> openUri("tel:" + (phone == null ? "" : phone)));
        }

        @JavascriptInterface
        public void shareText(String text) {
            runOnUiThread(() -> startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Share message")));
        }

        @JavascriptInterface
        public void requestNotifications() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
                } else {
                    updatePermissionState();
                    resyncReminders();
                    ReminderScheduler.sendInstantPopup(MainActivity.this, "InsureClub Alerts Active", "Heads-up popup notifications enabled for renewals, birthdays, and appointments.");
                    Toast.makeText(MainActivity.this, "Popup notifications are active.", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public boolean notificationsEnabled() {
            return Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface
        public boolean exactAlarmsEnabled() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                return am != null && am.canScheduleExactAlarms();
            }
            return true;
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())));
        }

        @JavascriptInterface
        public void openAlarmSettings() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try {
                        startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).setData(Uri.parse("package:" + getPackageName())));
                    } catch (Exception e) {
                        openNotificationSettings();
                    }
                } else {
                    openNotificationSettings();
                }
            });
        }
    }
}
