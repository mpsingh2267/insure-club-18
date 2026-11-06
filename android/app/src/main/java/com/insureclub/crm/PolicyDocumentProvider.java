package com.insureclub.crm;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import java.io.File;
import java.io.FileNotFoundException;

public class PolicyDocumentProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }

    private File resolve(Uri uri) throws FileNotFoundException {
        String segment = uri.getLastPathSegment();
        if (segment == null || segment.trim().isEmpty()) {
            throw new FileNotFoundException("Invalid document URI");
        }
        File file = BackupStore.findAnyDocument(getContext(), segment);
        if (file == null || !file.exists()) {
            throw new FileNotFoundException("Document file not found: " + segment);
        }
        return file;
    }

    @Override
    public String getType(Uri uri) {
        try {
            File file = resolve(uri);
            String name = file.getName();
            int dot = name.lastIndexOf('.');
            if (dot >= 0) {
                String ext = name.substring(dot + 1).toLowerCase();
                String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                if (mime != null) return mime;
            }
        } catch (Exception ignored) { }
        return "application/octet-stream";
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(resolve(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        try {
            File file = resolve(uri);
            MatrixCursor cursor = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
            cursor.addRow(new Object[]{file.getName(), file.length()});
            return cursor;
        } catch (Exception error) {
            return null;
        }
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
}
