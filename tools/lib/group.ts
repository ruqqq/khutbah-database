import {
  LANGUAGES,
  SOURCE_URL,
  type Database,
  type Entries,
  type Entry,
  type KhutbahDay,
  type Language,
  type ListingItem,
} from "./types";

export type PdfLookup = (date: string, language: Language) => string | null | undefined;

/** Build an index of already-resolved PDF URLs from an existing database. */
export function pdfLookupFrom(existing: Database | null): PdfLookup {
  const index = new Map<string, string>();
  for (const day of existing?.khutbahs ?? []) {
    for (const language of LANGUAGES) {
      const pdfUrl = day.entries[language]?.pdfUrl;
      if (pdfUrl) index.set(`${day.date}|${language}`, pdfUrl);
    }
  }
  return (date, language) => index.get(`${date}|${language}`) ?? null;
}

/** Fixed key order so the JSON diff stays minimal. */
export function makeEntry(item: ListingItem, pdfUrl: string | null): Entry {
  return {
    slug: item.slug,
    title: item.title,
    description: item.description,
    pageUrl: item.pageUrl,
    pdfUrl,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/**
 * MUIS occasionally files one khutbah's languages under two adjacent dates
 * (seen on Eid khutbahs: en/ta on the day, ms on the day before). When two
 * consecutive dates carry disjoint language sets, move the smaller set onto
 * the larger set's date (tie → the later date) so the app shows one row.
 */
export function mergeSplitDates(items: ListingItem[]): ListingItem[] {
  const byDate = new Map<string, ListingItem[]>();
  for (const item of items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  const dates = [...byDate.keys()].sort();

  const target = new Map<string, string>();
  for (let i = 0; i + 1 < dates.length; i++) {
    const earlier = dates[i]!;
    const later = dates[i + 1]!;
    if (daysBetween(earlier, later) !== 1) continue;
    const earlierLangs = new Set(byDate.get(earlier)!.map((it) => it.language));
    const laterLangs = new Set(byDate.get(later)!.map((it) => it.language));
    const disjoint = [...earlierLangs].every((l) => !laterLangs.has(l));
    if (!disjoint) continue;
    if (earlierLangs.size > laterLangs.size) target.set(later, earlier);
    else target.set(earlier, later);
  }

  return items.map((item) => {
    const date = target.get(item.date);
    return date ? { ...item, date } : item;
  });
}

/**
 * Items → days grouped by date (descending), entries keyed by language in
 * en/ms/ta order. Languages missing on a date are simply absent.
 */
export function groupItems(items: ListingItem[], lookupPdf: PdfLookup = () => null): KhutbahDay[] {
  const byDate = new Map<string, Map<Language, ListingItem>>();
  for (const item of mergeSplitDates(items)) {
    let langs = byDate.get(item.date);
    if (!langs) {
      langs = new Map();
      byDate.set(item.date, langs);
    }
    if (!langs.has(item.language)) langs.set(item.language, item);
  }

  const dates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return dates.map((date) => {
    const langs = byDate.get(date)!;
    const entries: Entries = {};
    for (const language of LANGUAGES) {
      const item = langs.get(language);
      if (item) entries[language] = makeEntry(item, lookupPdf(date, language) ?? null);
    }
    return { date, entries };
  });
}

export function buildDatabase(khutbahs: KhutbahDay[], generatedAt: Date): Database {
  return {
    generatedAt: generatedAt.toISOString(),
    source: SOURCE_URL,
    khutbahs,
  };
}

export function countEntries(db: Pick<Database, "khutbahs">): number {
  let n = 0;
  for (const day of db.khutbahs) n += Object.keys(day.entries).length;
  return n;
}

export function countEntriesByLanguage(db: Pick<Database, "khutbahs">): Record<Language, number> {
  const counts: Record<Language, number> = { en: 0, ms: 0, ta: 0 };
  for (const day of db.khutbahs) {
    for (const language of LANGUAGES) if (day.entries[language]) counts[language]++;
  }
  return counts;
}

/** Entries (date, language) that still need a detail-page fetch. */
export function unresolvedEntries(db: Pick<Database, "khutbahs">): { date: string; language: Language; entry: Entry }[] {
  const out: { date: string; language: Language; entry: Entry }[] = [];
  for (const day of db.khutbahs) {
    for (const language of LANGUAGES) {
      const entry = day.entries[language];
      if (entry && entry.pdfUrl === null) out.push({ date: day.date, language, entry });
    }
  }
  return out;
}
