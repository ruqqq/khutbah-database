import { describe, expect, test } from "bun:test";
import { extractRscPayload, findBracketEnd, languageFromTags, parseListing, parseRscDate, slugFromPath } from "../tools/lib/parseListing";

const html = await Bun.file(new URL("./fixtures/listing.html", import.meta.url)).text();

describe("extractRscPayload", () => {
  test("decodes and concatenates every push chunk in order", () => {
    const payload = extractRscPayload(html);
    expect(payload.startsWith('1:["$","nav"')).toBe(true);
    // The split point inside a string is stitched back together.
    expect(payload).toContain("Nothing is hidden from Allah's knowledge.");
  });
});

describe("findBracketEnd", () => {
  test("ignores brackets inside strings and escaped quotes", () => {
    const text = '["a]", "b\\"]", {"c": [1, 2]}] tail';
    expect(text.slice(0, findBracketEnd(text, 0))).toBe('["a]", "b\\"]", {"c": [1, 2]}]');
  });
  test("returns -1 when unbalanced", () => {
    expect(findBracketEnd("[1, 2", 0)).toBe(-1);
  });
});

describe("parseRscDate", () => {
  test("strips the $D prefix and keeps the date", () => {
    expect(parseRscDate("$D2026-09-18T00:00:00.000Z")).toBe("2026-09-18");
  });
  test("rejects non-dates", () => {
    expect(parseRscDate("18 September 2026")).toBeNull();
    expect(parseRscDate(undefined)).toBeNull();
  });
});

describe("languageFromTags", () => {
  test("maps the MUIS category labels", () => {
    expect(languageFromTags([{ selected: ["English"] }])).toBe("en");
    expect(languageFromTags([{ selected: ["Malay/Jawi"] }])).toBe("ms");
    expect(languageFromTags([{ selected: ["Tamil"] }])).toBe("ta");
  });
  test("returns null for unknown or malformed tags", () => {
    expect(languageFromTags([{ selected: ["Arabic"] }])).toBeNull();
    expect(languageFromTags([])).toBeNull();
    expect(languageFromTags(undefined)).toBeNull();
  });
});

describe("slugFromPath", () => {
  test("takes the last path segment", () => {
    expect(slugFromPath("/resources/khutbah-and-religious-advice/khutbah/some-slug")).toBe("some-slug");
    expect(slugFromPath("/resources/khutbah-and-religious-advice/khutbah/some-slug/")).toBe("some-slug");
  });
});

describe("parseListing", () => {
  const items = parseListing(html);

  test("finds the khutbah items array and skips the decoy nav items", () => {
    expect(items).toHaveLength(6);
  });

  test("maps fields, trims titles and builds pageUrl", () => {
    expect(items[0]).toEqual({
      id: "/resources/khutbah-and-religious-advice/khutbah/overcoming-the-whispers-of-the-heart-with-faith-",
      slug: "overcoming-the-whispers-of-the-heart-with-faith-",
      date: "2026-09-18",
      language: "en",
      title: "Overcoming the whispers of the heart with faith",
      description: "Nothing is hidden from Allah's knowledge, including \"whispers\" [unspoken].",
      pageUrl: "https://www.muis.gov.sg/resources/khutbah-and-religious-advice/khutbah/overcoming-the-whispers-of-the-heart-with-faith-/",
    });
  });

  test("survives an item whose JSON spans two chunks", () => {
    const tamil = items.find((i) => i.slug === "overcoming-the-whispers-of-the-heart-with-faith-tamil");
    expect(tamil?.language).toBe("ta");
    expect(tamil?.description).toBe("Nothing is hidden from Allah's knowledge.");
  });

  test("covers both dates and all three languages", () => {
    expect(new Set(items.map((i) => i.date))).toEqual(new Set(["2026-09-18", "2026-09-11"]));
    expect(items.map((i) => i.language)).toEqual(["en", "ms", "ta", "en", "ms", "ta"]);
  });

  test("throws when no khutbah items array is present", () => {
    expect(() => parseListing("<html></html>")).toThrow(/not found/);
  });
});
