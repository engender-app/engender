package dev.barankiewicz.genderdiary.photos;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Arrays;

/**
 * Android half of the photo seam (ticket 12): one picker call and one
 * app-private file store, both behind a bridge that keeps web types and
 * Android types out of the journal code.
 */
@CapacitorPlugin(name = "Photos")
public class PhotosPlugin extends Plugin {

    @PluginMethod
    public void pickImages(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("image/*");
        }
        startActivityForResult(call, intent, "pickedImages");
    }

    @ActivityCallback
    private void pickedImages(PluginCall call, ActivityResult activityResult) {
        JSObject result = new JSObject();
        JSArray images = new JSArray();

        if (activityResult == null || activityResult.getResultCode() != Activity.RESULT_OK) {
            result.put("images", images);
            call.resolve(result);
            return;
        }

        Intent data = activityResult.getData();
        if (data == null) {
            result.put("images", images);
            call.resolve(result);
            return;
        }

        try {
            if (data.getClipData() != null) {
                for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                    Uri uri = data.getClipData().getItemAt(i).getUri();
                    images.put(readBase64(uri));
                }
            } else if (data.getData() != null) {
                images.put(readBase64(data.getData()));
            }
            result.put("images", images);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String name = call.getString("name");
        String base64 = call.getString("base64");
        if (name == null || base64 == null) {
            call.reject("writeFile requires name and base64");
            return;
        }
        try {
            File target = fileFor(call, name);
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            try (FileOutputStream out = new FileOutputStream(target, false)) {
                out.write(bytes);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        String name = call.getString("name");
        if (name == null) {
            call.reject("readFile requires name");
            return;
        }
        try {
            JSObject result = new JSObject();
            File target = fileFor(call, name);
            if (!target.exists()) {
                result.put("base64", JSObject.NULL);
                call.resolve(result);
                return;
            }
            result.put("base64", Base64.encodeToString(readBytes(target), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void sizeFile(PluginCall call) {
        String name = call.getString("name");
        if (name == null) {
            call.reject("sizeFile requires name");
            return;
        }
        try {
            JSObject result = new JSObject();
            File target = fileFor(call, name);
            if (!target.exists()) {
                result.put("size", JSObject.NULL);
            } else {
                result.put("size", target.length());
            }
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void removeFile(PluginCall call) {
        String name = call.getString("name");
        if (name == null) {
            call.reject("removeFile requires name");
            return;
        }
        try {
            File target = fileFor(call, name);
            if (!target.exists() || target.delete()) {
                call.resolve();
                return;
            }
            call.reject("could not delete " + target.getName());
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        try {
            String[] names = photoDirectory(call).list();
            if (names == null) names = new String[0];
            Arrays.sort(names);
            JSArray list = new JSArray();
            for (String name : names) list.put(name);
            JSObject result = new JSObject();
            result.put("names", list);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(message(e), e);
        }
    }

    private File photoDirectory(PluginCall call) {
        String directoryName = call.getString("directory", "photos");
        if (directoryName == null) directoryName = "photos";
        if (directoryName.trim().isEmpty() || directoryName.contains("/") || directoryName.contains("\\")
            || directoryName.contains("..")) {
            throw new IllegalArgumentException("invalid photo directory name");
        }

        File directory = new File(getContext().getFilesDir(), directoryName);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("could not create photo directory " + directory);
        }
        if (!directory.isDirectory()) {
            throw new IllegalStateException(directory + " is not a directory");
        }

        File noMedia = new File(directory, ".nomedia");
        if (!noMedia.exists()) {
            try {
                if (!noMedia.createNewFile()) {
                    throw new IllegalStateException("could not create " + noMedia);
                }
            } catch (Exception e) {
                throw new IllegalStateException("could not create " + noMedia, e);
            }
        }

        return directory;
    }

    private File fileFor(PluginCall call, String name) {
        String trimmed = name.trim();
        if (trimmed.isEmpty() || trimmed.contains("/") || trimmed.contains("\\") || trimmed.contains("..")) {
            throw new IllegalArgumentException("invalid photo file name");
        }
        return new File(photoDirectory(call), trimmed);
    }

    private String readBase64(Uri uri) throws Exception {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) throw new IllegalStateException("could not read selected image");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
        }
    }

    private static byte[] readBytes(File file) throws Exception {
        try (FileInputStream in = new FileInputStream(file);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toByteArray();
        }
    }

    private static String message(Exception e) {
        String detail = e.getMessage();
        return detail == null || detail.isEmpty() ? e.getClass().getName() : detail;
    }
}
