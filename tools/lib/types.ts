export type Language = "en" | "ms" | "ta";

export const LANGUAGES: readonly Language[] = ["en", "ms", "ta"];

export const SOURCE_URL =
  "https://www.muis.gov.sg/resources/khutbah-and-religious-advice/khutbah/";

export const SITE_ORIGIN = "https://www.muis.gov.sg";

/** One khutbah as listed on the MUIS listing page (before the PDF is resolved). */
export interface ListingItem {
  /** Full path, e.g. `/resources/khutbah-and-religious-advice/khutbah/some-slug`. */
  id: string;
  /** Last path segment of `id`. */
  slug: string;
  /** YYYY-MM-DD */
  date: string;
  language: Language;
  title: string;
  description: string;
  pageUrl: string;
}

export interface Entry {
  slug: string;
  title: string;
  description: string;
  pageUrl: string;
  pdfUrl: string | null;
}

export type Entries = Partial<Record<Language, Entry>>;

export interface KhutbahDay {
  date: string;
  entries: Entries;
}

export interface Database {
  generatedAt: string;
  source: string;
  khutbahs: KhutbahDay[];
}
