import type { UploadedImage } from "./types";

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.82;

/** Resizes an image file down to MAX_DIMENSION on its longest side and re-encodes as JPEG,
 * so the base64 payload sent to the Gemini API stays small. */
export async function fileToUploadedImage(file: File): Promise<UploadedImage> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const bitmap = await loadImage(originalDataUrl);

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = dataUrl.split(",")[1];

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    mimeType: "image/jpeg",
    base64,
    dataUrl,
  };
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
