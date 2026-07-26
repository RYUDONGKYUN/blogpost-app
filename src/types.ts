export type Category = "맛집" | "레시피" | "운동" | "여행" | "기타";

export const CATEGORIES: Category[] = ["맛집", "레시피", "운동", "여행", "기타"];

export interface Settings {
  apiKey: string;
  model: string;
}

export interface UploadedImage {
  id: string;
  fileName: string;
  mimeType: string;
  /** base64 without the data: prefix, resized for upload */
  base64: string;
  /** full data URL for local <img> preview */
  dataUrl: string;
}

export interface ComposeInput {
  category: Category;
  place: string;
  notes: string;
  images: UploadedImage[];
}

export interface GeneratedPost {
  title: string;
  keywords: string[];
  body: string;
}

export interface PostHistoryEntry {
  category: Category;
  title: string;
  /** first line/opening hook of the body, used to steer future generations away from repeating it */
  opening: string;
  createdAt: number;
}
