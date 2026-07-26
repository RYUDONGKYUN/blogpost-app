import type { UploadedImage } from "./types";

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.82;
const THUMBNAIL_MAX_DIMENSION = 240;
const THUMBNAIL_JPEG_QUALITY = 0.5;

async function resizeToDataUrl(srcDataUrl: string, maxDimension: number, quality: number) {
  const bitmap = await loadImage(srcDataUrl);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

/** Resizes an image file down to MAX_DIMENSION on its longest side and re-encodes as JPEG,
 * so the base64 payload sent to the Gemini API stays small. */
export async function fileToUploadedImage(file: File): Promise<UploadedImage> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const dataUrl = await resizeToDataUrl(originalDataUrl, MAX_DIMENSION, JPEG_QUALITY);
  const base64 = dataUrl.split(",")[1];

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    mimeType: "image/jpeg",
    base64,
    dataUrl,
  };
}

/** Small, low-quality preview used for the saved-post history list, kept tiny to avoid
 * bloating localStorage as posts accumulate. */
export async function makeThumbnail(dataUrl: string): Promise<string> {
  return resizeToDataUrl(dataUrl, THUMBNAIL_MAX_DIMENSION, THUMBNAIL_JPEG_QUALITY);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러올 수 없습니다"));
    img.src = src;
  });
}
