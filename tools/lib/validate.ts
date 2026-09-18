import { countEntries } from "./group";
import { LANGUAGES, type Database } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_STALE_DAYS = 14;
export const MAX_SHRINK_RATIO = 0.05;
const MS_PER_DAY = 86_400_000;

export class ValidationError extends Error {}

function fail(message: string): never {
  throw new ValidationError(message);
}

export interface ValidateOptions {
  now?: Date;
  existing?: Database | null;
}

/** Throws ValidationError when the database must not be committed. */
export function validate(db: Database, options: ValidateOptions = {}): void {
  const now = options.now ?? new Date();
  const existing = options.existing ?? null;

  if (typeof db.generatedAt !== "string" || Number.isNaN(Date.parse(db.generatedAt))) {
    fail("generatedAt is not an ISO timestamp");
  }
  if (typeof db.source !== "string" || db.source.length === 0) fail("source is missing");
  if (!Array.isArray(db.khutbahs) || db.khutbahs.length === 0) fail("khutbahs is empty");

  const seenDates = new Set<string>();
  for (const day of db.khutbahs) {
    if (!DATE_RE.test(day.date)) fail(`Invalid date: ${JSON.stringify(day.date)}`);
    if (seenDates.has(day.date)) fail(`Duplicate date: ${day.date}`);
    seenDates.add(day.date);
    const languages = LANGUAGES.filter((l) => day.entries[l]);
    if (languages.length === 0) fail(`Date ${day.date} has no entries`);
    for (const language of languages) {
      const entry = day.entries[language]!;
      if (!entry.title) fail(`Entry ${day.date}/${language} has no title`);
      if (!entry.pageUrl) fail(`Entry ${day.date}/${language} has no pageUrl`);
    }
  }

  for (let i = 1; i < db.khutbahs.length; i++) {
    if (db.khutbahs[i - 1]!.date < db.khutbahs[i]!.date) fail("khutbahs are not sorted by date descending");
  }

  const newest = db.khutbahs[0]!.date;
  const ageDays = Math.floor(now.getTime() / MS_PER_DAY) - Math.floor(Date.parse(`${newest}T00:00:00Z`) / MS_PER_DAY);
  if (ageDays > MAX_STALE_DAYS) {
    fail(`Newest khutbah ${newest} is ${ageDays} days old (limit ${MAX_STALE_DAYS}); the feed looks stale`);
  }

  if (existing) {
    const before = countEntries(existing);
    const after = countEntries(db);
    if (before > 0 && after < before * (1 - MAX_SHRINK_RATIO)) {
      fail(`Entry count shrank from ${before} to ${after} (more than ${MAX_SHRINK_RATIO * 100}%)`);
    }
  }
}
