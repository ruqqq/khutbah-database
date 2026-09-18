import { describe, expect, test } from "bun:test";
import type { Database, KhutbahDay } from "../tools/lib/types";
import { ValidationError, validate } from "../tools/lib/validate";

const now = new Date("2026-09-18T04:00:00Z");

const day = (date: string, langs: ("en" | "ms" | "ta")[] = ["en", "ms", "ta"]): KhutbahDay => ({
  date,
  entries: Object.fromEntries(
    langs.map((l) => [l, { slug: `${date}-${l}`, title: "Title", description: "", pageUrl: "https://www.muis.gov.sg/x/", pdfUrl: null }]),
  ),
});

const db = (khutbahs: KhutbahDay[]): Database => ({
  generatedAt: now.toISOString(),
  source: "https://www.muis.gov.sg/resources/khutbah-and-religious-advice/khutbah/",
  khutbahs,
});

const fresh = db([day("2026-09-18"), day("2026-09-11"), day("2026-09-04")]);

describe("validate", () => {
  test("accepts a fresh, well-formed database", () => {
    expect(() => validate(fresh, { now })).not.toThrow();
  });

  test("throws when the newest date is older than 14 days", () => {
    const stale = db([day("2026-09-03"), day("2026-08-28")]);
    expect(() => validate(stale, { now })).toThrow(ValidationError);
    expect(() => validate(stale, { now })).toThrow(/stale/);
  });

  test("accepts a newest date exactly 14 days old", () => {
    expect(() => validate(db([day("2026-09-04")]), { now })).not.toThrow();
  });

  test("throws when entries shrink by more than 5% versus the existing file", () => {
    const existing = db(Array.from({ length: 20 }, (_, i) => day(`2026-0${i < 10 ? "9" : "8"}-${String((i % 10) + 10)}`)));
    const shrunk = db([day("2026-09-18"), day("2026-09-11")]);
    expect(() => validate(shrunk, { now, existing })).toThrow(/shrank/);
  });

  test("allows a shrink of at most 5%", () => {
    // 20 dates × 3 languages = 60 entries; dropping 3 entries is exactly 5%.
    const dates = Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2026, 8, 18 - i)).toISOString().slice(0, 10));
    const existing = db(dates.map((d) => day(d)));
    const trimmed = db([day(dates[0]!, ["en", "ms"]), day(dates[1]!, ["en", "ms"]), day(dates[2]!, ["en", "ms"]), ...existing.khutbahs.slice(3)]);
    expect(() => validate(trimmed, { now, existing })).not.toThrow();
    const tooMuch = db([day(dates[0]!, ["en"]), day(dates[1]!, ["en", "ms"]), day(dates[2]!, ["en", "ms"]), ...existing.khutbahs.slice(3)]);
    expect(() => validate(tooMuch, { now, existing })).toThrow(/shrank/);
  });

  test("rejects malformed dates", () => {
    expect(() => validate(db([day("18/09/2026")]), { now })).toThrow(/Invalid date/);
  });

  test("rejects entries without a title or pageUrl", () => {
    const noTitle = db([day("2026-09-18")]);
    noTitle.khutbahs[0]!.entries.en!.title = "";
    expect(() => validate(noTitle, { now })).toThrow(/no title/);
    const noUrl = db([day("2026-09-18")]);
    noUrl.khutbahs[0]!.entries.ms!.pageUrl = "";
    expect(() => validate(noUrl, { now })).toThrow(/no pageUrl/);
  });

  test("rejects unsorted or duplicate dates", () => {
    expect(() => validate(db([day("2026-09-11"), day("2026-09-18")]), { now })).toThrow(/sorted/);
    expect(() => validate(db([day("2026-09-18"), day("2026-09-18")]), { now })).toThrow(/Duplicate/);
  });
});
