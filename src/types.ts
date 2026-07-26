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
  /** business hours, shown for 맛집 posts in a quote-style info block */
  hours: string;
  /** Naver Map share link, shown for 맛집 posts in a quote-style info block */
  mapLink: string;
  images: UploadedImage[];
}

export interface GeneratedPost {
  title: string;
  keywords: string[];
  body: string;
}

export interface ClarificationTurn {
  question: string;
  answer: string;
}

export type GenerateResult =
  | { status: "ready"; post: GeneratedPost }
  | { status: "needs_info"; question: string };

export interface PostHistoryEntry {
  id: string;
  category: Category;
  place: string;
  title: string;
  keywords: string[];
  body: string;
  /** small preview of the first uploaded photo, for the history list */
  thumbnail?: string;
  createdAt: number;
}
