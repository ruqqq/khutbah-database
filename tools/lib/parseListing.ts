import { LANGUAGES, SITE_ORIGIN, type Language, type ListingItem } from "./types";

const KHUTBAH_PATH = "khutbah-and-religious-advice/khutbah/";
const ITEMS_MARKER = '"items":[';
const PUSH_CHUNK_RE = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

const LANGUAGE_MAP: Readonly<Record<string, Language>> = {
  English: "en",
  "Malay/Jawi": "ms",
  Tamil: "ta",
};

/** Raw shape of an item inside the RSC payload. Only the fields we read. */
interface RawItem {
  id?: unknown;
  date?: unknown;
  title?: unknown;
  description?: unknown;
  tags?: unknown;
}

/**
 * Collect every `self.__next_f.push([1,"..."])` string literal in the HTML,
 * decode each one and concatenate them into the RSC payload text.
 */
export function extractRscPayload(html: string): string {
  const parts: string[] = [];
  for (const match of html.matchAll(PUSH_CHUNK_RE)) {
    const literal = match[1];
    if (literal === undefined) continue;
    const decoded: unknown = JSON.parse(literal);
    if (typeof decoded === "string") parts.push(decoded);
  }
  return parts.join("");
}

/**
 * Given `text` and the index of an opening `[` or `{`, return the index just
 * past the matching closing bracket, honouring JSON strings and escapes.
 * Returns -1 when unbalanced.
 */
export function findBracketEnd(text: string, openIndex: number): number {
  let depth = 0;
  let inString = false;
  for (let i = openIndex; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * Locate the `"items":[` array whose first 200 chars reference the khutbah
 * path and return its raw JSON text.
 */
export function locateKhutbahItemsJson(payload: string): string {
  let from = 0;
  while (true) {
    const idx = payload.indexOf(ITEMS_MARKER, from);
    if (idx === -1) break;
    const arrayStart = idx + ITEMS_MARKER.length - 1;
    if (payload.slice(idx, idx + 200).includes(KHUTBAH_PATH)) {
      const end = findBracketEnd(payload, arrayStart);
      if (end === -1) throw new Error("Unbalanced khutbah items array in RSC payload");
      return payload.slice(arrayStart, end);
    }
    from = idx + 1;
  }
  throw new Error("Khutbah items array not found in RSC payload");
}

/** `$D2026-09-18T00:00:00.000Z` → `2026-09-18` */
export function parseRscDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const stripped = value.startsWith("$D") ? value.slice(2) : value;
  const m = /^(\d{4}-\d{2}-\d{2})T/.exec(stripped);
  return m?.[1] ?? null;
}

export function languageFromTags(tags: unknown): Language | null {
  if (!Array.isArray(tags)) return null;
  const first: unknown = tags[0];
  if (typeof first !== "object" || first === null) return null;
  const selected: unknown = (first as { selected?: unknown }).selected;
  if (!Array.isArray(selected)) return null;
  const label: unknown = selected[0];
  if (typeof label !== "string") return null;
  return LANGUAGE_MAP[label] ?? null;
}

export function slugFromPath(path: string): string {
  const segments = path.split("/").filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? "";
}

export function pageUrlFromPath(path: string): string {
  return `${SITE_ORIGIN}${path}/`;
}

export function toListingItem(raw: RawItem): ListingItem | null {
  if (typeof raw.id !== "string" || !raw.id.includes(KHUTBAH_PATH)) return null;
  const date = parseRscDate(raw.date);
  const language = languageFromTags(raw.tags);
  if (date === null || language === null) return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  return {
    id: raw.id,
    slug: slugFromPath(raw.id),
    date,
    language,
    title,
    description,
    pageUrl: pageUrlFromPath(raw.id),
  };
}

/** Listing HTML → one item per khutbah page. Items we cannot interpret are dropped. */
export function parseListing(html: string): ListingItem[] {
  const payload = extractRscPayload(html);
  const json = locateKhutbahItemsJson(payload);
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("Khutbah items is not an array");
  const items: ListingItem[] = [];
  for (const raw of parsed) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = toListingItem(raw as RawItem);
    if (item !== null && LANGUAGES.includes(item.language)) items.push(item);
  }
  return items;
}
