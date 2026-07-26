interface CopyablePost {
  title: string;
  body: string;
  keywords: string[];
}

/** Assembles the title + body + hashtags exactly as it should be pasted into Naver Blog. */
export function composeFullText(post: CopyablePost): string {
  const hashtags = post.keywords.map((k) => `#${k.replace(/\s+/g, "")}`).join(" ");
  return `${post.title}\n\n${post.body}\n\n${hashtags}`;
}
