package com.dozi0.blogpostapp;

import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.util.Base64;
import androidx.exifinterface.media.ExifInterface;
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
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Launches the real gallery app (ACTION_GET_CONTENT) instead of the flat
 * Android Photo Picker that a plain <input type=file> triggers on modern
 * WebViews. ACTION_GET_CONTENT routes through whichever gallery app owns
 * image content on the device (Samsung Gallery on Galaxy phones, Google
 * Photos, etc.), which — unlike the Photo Picker — has an Albums view.
 */
@CapacitorPlugin(name = "GalleryPicker")
public class GalleryPickerPlugin extends Plugin {

    // Matches the app's own JS-side resize target (imageUtils.ts MAX_DIMENSION) —
    // decoding this small natively means we never hold/transfer full-resolution
    // originals (multiple MB each) across the JS bridge, which is what was
    // freezing the UI on picks with many/large photos.
    private static final int MAX_DIMENSION = 1024;
    private static final int JPEG_QUALITY = 72;

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

        // Decoding/downscaling dozens of photos synchronously (and one at a
        // time) is what caused the app to appear stuck/slow at "불러오는 중" —
        // move it off the main thread and fan it out across worker threads so
        // a large selection decodes concurrently instead of serially.
        new Thread(() -> processUris(call, uris)).start();
    }

    private void processUris(PluginCall call, List<Uri> uris) {
        int threadCount = Math.max(2, Math.min(uris.size(), Runtime.getRuntime().availableProcessors()));
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);

        List<Future<JSObject>> futures = new ArrayList<>();
        for (int i = 0; i < uris.size(); i++) {
            final Uri uri = uris.get(i);
            final int index = i;
            futures.add(executor.submit((Callable<JSObject>) () -> {
                String base64 = decodeDownscaledJpegBase64(uri);
                if (base64 == null) return null;
                JSObject image = new JSObject();
                image.put("base64", base64);
                image.put("mimeType", "image/jpeg");
                image.put("fileName", "gallery_" + index + ".jpg");
                return image;
            }));
        }
        executor.shutdown();

        JSArray images = new JSArray();
        for (Future<JSObject> future : futures) {
            try {
                JSObject image = future.get();
                if (image != null) images.put(image);
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

    /** Reads a content:// image URI, downscales it to MAX_DIMENSION on its
     * longest side (without ever fully decoding the original resolution into
     * memory), corrects EXIF rotation, and returns it as base64 JPEG. */
    private String decodeDownscaledJpegBase64(Uri uri) throws Exception {
        // Pass 1: bounds only, to compute a cheap power-of-two sample size.
        BitmapFactory.Options boundsOptions = new BitmapFactory.Options();
        boundsOptions.inJustDecodeBounds = true;
        try (InputStream boundsStream = getContext().getContentResolver().openInputStream(uri)) {
            if (boundsStream == null) return null;
            BitmapFactory.decodeStream(boundsStream, null, boundsOptions);
        }
        if (boundsOptions.outWidth <= 0 || boundsOptions.outHeight <= 0) return null;

        int sampleSize = 1;
        int longestSide = Math.max(boundsOptions.outWidth, boundsOptions.outHeight);
        while (longestSide / (sampleSize * 2) >= MAX_DIMENSION) {
            sampleSize *= 2;
        }

        BitmapFactory.Options decodeOptions = new BitmapFactory.Options();
        decodeOptions.inSampleSize = sampleSize;
        Bitmap sampled;
        try (InputStream decodeStream = getContext().getContentResolver().openInputStream(uri)) {
            if (decodeStream == null) return null;
            sampled = BitmapFactory.decodeStream(decodeStream, null, decodeOptions);
        }
        if (sampled == null) return null;

        // inSampleSize only gets us close (power-of-two steps) — finish with an
        // exact scale down to MAX_DIMENSION if it's still oversized.
        Bitmap scaled = sampled;
        int scaledLongestSide = Math.max(sampled.getWidth(), sampled.getHeight());
        if (scaledLongestSide > MAX_DIMENSION) {
            float scale = (float) MAX_DIMENSION / scaledLongestSide;
            int width = Math.round(sampled.getWidth() * scale);
            int height = Math.round(sampled.getHeight() * scale);
            scaled = Bitmap.createScaledBitmap(sampled, width, height, true);
            if (scaled != sampled) sampled.recycle();
        }

        Bitmap rotated = applyExifRotation(uri, scaled);
        if (rotated != scaled) scaled.recycle();

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        rotated.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out);
        rotated.recycle();

        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    private Bitmap applyExifRotation(Uri uri, Bitmap bitmap) {
        try (InputStream exifStream = getContext().getContentResolver().openInputStream(uri)) {
            if (exifStream == null) return bitmap;
            ExifInterface exif = new ExifInterface(exifStream);
            int orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            );
            int degrees;
            switch (orientation) {
                case ExifInterface.ORIENTATION_ROTATE_90: degrees = 90; break;
                case ExifInterface.ORIENTATION_ROTATE_180: degrees = 180; break;
                case ExifInterface.ORIENTATION_ROTATE_270: degrees = 270; break;
                default: degrees = 0;
            }
            if (degrees == 0) return bitmap;
            Matrix matrix = new Matrix();
            matrix.postRotate(degrees);
            return Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
        } catch (Exception e) {
            return bitmap;
        }
    }
}
