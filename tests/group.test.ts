import { describe, expect, test } from "bun:test";
import { buildDatabase, countEntries, countEntriesByLanguage, groupItems, mergeSplitDates, pdfLookupFrom, unresolvedEntries } from "../tools/lib/group";
import type { Database, ListingItem } from "../tools/lib/types";

const item = (date: string, language: ListingItem["language"], slug: string): ListingItem => ({
  id: `/resources/khutbah-and-religious-advice/khutbah/${slug}`,
  slug,
  date,
  language,
  title: `Title ${slug}`,
  description: `Desc ${slug}`,
  pageUrl: `https://www.muis.gov.sg/resources/khutbah-and-religious-advice/khutbah/${slug}/`,
});

const items: ListingItem[] = [
  item("2026-09-11", "ta", "b-ta"),
  item("2026-09-18", "ms", "a-ms"),
  item("2026-09-11", "en", "b-en"),
  item("2026-09-18", "en", "a-en"),
  item("2026-09-18", "ta", "a-ta"),
  // 2026-09-11 has no Malay entry on purpose.
];

describe("groupItems", () => {
  test("groups by date descending with entries in en/ms/ta order", () => {
    const days = groupItems(items);
    expect(days.map((d) => d.date)).toEqual(["2026-09-18", "2026-09-11"]);
    expect(Object.keys(days[0]!.entries)).toEqual(["en", "ms", "ta"]);
  });

  test("omits a language that is missing for a date", () => {
    const days = groupItems(items);
    expect(Object.keys(days[1]!.entries)).toEqual(["en", "ta"]);
    expect(days[1]!.entries.ms).toBeUndefined();
  });

  test("uses a stable entry key order and null pdfUrl by default", () => {
    const entry = groupItems(items)[0]!.entries.en!;
    expect(Object.keys(entry)).toEqual(["slug", "title", "description", "pageUrl", "pdfUrl"]);
    expect(entry.pdfUrl).toBeNull();
  });

  test("keeps the first item when a (date, language) pair repeats", () => {
    const days = groupItems([...items, item("2026-09-18", "en", "dup-en")]);
    expect(days[0]!.entries.en!.slug).toBe("a-en");
  });

  test("carries over resolved pdfUrls from an existing database", () => {
    const existing: Database = {
      generatedAt: "2026-09-17T00:00:00.000Z",
      source: "x",
      khutbahs: [
        { date: "2026-09-18", entries: { en: { slug: "a-en", title: "t", description: "", pageUrl: "p", pdfUrl: "https://x/a.pdf" } } },
        { date: "2026-09-11", entries: { en: { slug: "b-en", title: "t", description: "", pageUrl: "p", pdfUrl: null } } },
      ],
    };
    const days = groupItems(items, pdfLookupFrom(existing));
    expect(days[0]!.entries.en!.pdfUrl).toBe("https://x/a.pdf");
    expect(days[0]!.entries.ms!.pdfUrl).toBeNull();
    expect(unresolvedEntries({ khutbahs: days }).map((u) => `${u.date}/${u.language}`)).toEqual([
      "2026-09-18/ms",
      "2026-09-18/ta",
      "2026-09-11/en",
      "2026-09-11/ta",
    ]);
  });
});

describe("buildDatabase and counts", () => {
  test("produces the top-level schema in order", () => {
    const db = buildDatabase(groupItems(items), new Date("2026-09-18T04:00:00Z"));
    expect(Object.keys(db)).toEqual(["generatedAt", "source", "khutbahs"]);
    expect(db.generatedAt).toBe("2026-09-18T04:00:00.000Z");
    expect(db.source).toBe("https://www.muis.gov.sg/resources/khutbah-and-religious-advice/khutbah/");
    expect(countEntries(db)).toBe(5);
    expect(countEntriesByLanguage(db)).toEqual({ en: 2, ms: 1, ta: 2 });
  });
});

describe("mergeSplitDates", () => {
  test("moves the smaller language set onto the adjacent date's larger set", () => {
    const merged = mergeSplitDates([
      item("2026-05-27", "en", "eid-en"),
      item("2026-05-27", "ta", "eid-ta"),
      item("2026-05-26", "ms", "eid-ms"),
    ]);
    expect(merged.map((it) => it.date)).toEqual(["2026-05-27", "2026-05-27", "2026-05-27"]);
  });

  test("prefers the later date on a tie", () => {
    const merged = mergeSplitDates([item("2025-06-05", "en", "a"), item("2025-06-06", "ms", "b")]);
    expect(merged.every((it) => it.date === "2025-06-06")).toBe(true);
  });

  test("leaves adjacent dates alone when their languages overlap", () => {
    const items = [item("2026-09-17", "en", "thu"), item("2026-09-18", "en", "fri"), item("2026-09-18", "ms", "fri-ms")];
    expect(mergeSplitDates(items)).toEqual(items);
  });

  test("leaves non-adjacent dates alone", () => {
    const items = [item("2026-09-11", "en", "a"), item("2026-09-18", "ms", "b")];
    expect(mergeSplitDates(items)).toEqual(items);
  });

  test("is applied by groupItems", () => {
    const days = groupItems([item("2026-05-27", "en", "eid-en"), item("2026-05-26", "ms", "eid-ms")]);
    expect(days).toHaveLength(1);
    expect(Object.keys(days[0]!.entries)).toEqual(["en", "ms"]);
  });
});
