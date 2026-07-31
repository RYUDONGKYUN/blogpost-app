import { registerPlugin } from "@capacitor/core";

export interface GalleryImage {
  base64: string;
  mimeType: string;
  fileName: string;
}

interface GalleryPickerPlugin {
  pickImages(): Promise<{ images: GalleryImage[] }>;
}

/** Native-only (Android) plugin — see android/app/.../GalleryPickerPlugin.java.
 * Launches the real gallery app (with album browsing) instead of the flat
 * system photo picker a plain <input type=file> triggers. No web
 * implementation is registered; callers must check Capacitor.isNativePlatform()
 * and fall back to the file input on web/dev. */
export const GalleryPicker = registerPlugin<GalleryPickerPlugin>("GalleryPicker");
