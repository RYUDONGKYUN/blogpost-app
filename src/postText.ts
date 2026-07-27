interface CopyablePost {
  title: string;
  body: string;
  keywords: string[];
}

export function composeHashtags(post: CopyablePost): string {
  return post.keywords.map((k) => `#${k.replace(/\s+/g, "")}`).join(" ");
}

/** Assembles the title + body + hashtags exactly as it should be pasted into Naver Blog. */
export function composeFullText(post: CopyablePost): string {
  return `${post.title}\n\n${post.body}\n\n${composeHashtags(post)}`;
}

export type BodySegment =
  | { type: "text"; text: string }
  | { type: "photo"; photoIndex: number };

/** Splits the body on "[사진N]" markers so the UI can walk the user through
 * pasting text, then adding the matching photo, then the next text chunk —
 * matching how Naver Blog's editor actually mixes text and photo blocks. */
export function splitBodyIntoSegments(body: string): BodySegment[] {
  const markerRegex = /\[사진(\d+)\]/g;
  const segments: BodySegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(body)) !== null) {
    const textBefore = body.slice(lastIndex, match.index).trim();
    if (textBefore) segments.push({ type: "text", text: textBefore });
    segments.push({ type: "photo", photoIndex: Number(match[1]) });
    lastIndex = match.index + match[0].length;
  }

  const remaining = body.slice(lastIndex).trim();
  if (remaining) segments.push({ type: "text", text: remaining });

  return segments;
}
