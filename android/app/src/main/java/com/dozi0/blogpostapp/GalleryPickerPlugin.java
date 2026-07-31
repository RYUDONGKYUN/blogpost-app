package com.dozi0.blogpostapp;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Launches the real gallery app (ACTION_GET_CONTENT) instead of the flat
 * Android Photo Picker that a plain <input type=file> triggers on modern
 * WebViews. ACTION_GET_CONTENT routes through whichever gallery app owns
 * image content on the device (Samsung Gallery on Galaxy phones, Google
 * Photos, etc.), which — unlike the Photo Picker — has an Albums view.
 */
@CapacitorPlugin(name = "GalleryPicker")
public class GalleryPickerPlugin extends Plugin {

    @PluginMethod
    public void pickImages(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        Intent chooser = Intent.createChooser(intent, "사진 선택");
        startActivityForResult(call, chooser, "handlePickResult");
    }

    @ActivityCallback
    private void handlePickResult(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            call.reject("취소됨");
            return;
        }

        List<Uri> uris = new ArrayList<>();
        Intent data = result.getData();
        ClipData clipData = data.getClipData();
        if (clipData != null) {
            for (int i = 0; i < clipData.getItemCount(); i++) {
                uris.add(clipData.getItemAt(i).getUri());
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }

        if (uris.isEmpty()) {
            call.reject("선택된 사진이 없습니다");
            return;
        }

        JSArray images = new JSArray();
        for (Uri uri : uris) {
            try {
                String mimeType = getContext().getContentResolver().getType(uri);
                if (mimeType == null) mimeType = "image/jpeg";

                InputStream inputStream = getContext().getContentResolver().openInputStream(uri);
                if (inputStream == null) continue;
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int bytesRead;
                while ((bytesRead = inputStream.read(chunk)) != -1) {
                    buffer.write(chunk, 0, bytesRead);
                }
                inputStream.close();

                String base64 = Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP);

                JSObject image = new JSObject();
                image.put("base64", base64);
                image.put("mimeType", mimeType);
                image.put("fileName", "gallery_" + System.currentTimeMillis() + ".jpg");
                images.put(image);
            } catch (Exception e) {
                // skip unreadable image, keep the rest of the selection usable
            }
        }

        if (images.length() == 0) {
            call.reject("선택한 사진을 읽지 못했습니다");
            return;
        }

        JSObject ret = new JSObject();
        ret.put("images", images);
        call.resolve(ret);
    }
}
