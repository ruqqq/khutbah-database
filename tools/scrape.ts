import { buildDatabase, countEntries, countEntriesByLanguage, groupItems, pdfLookupFrom, unresolvedEntries } from "./lib/group";
import { parseDetail } from "./lib/parseDetail";
import { parseListing } from "./lib/parseListing";
import { LANGUAGES, SOURCE_URL, type Database } from "./lib/types";
import { validate } from "./lib/validate";

const DATA_PATH = new URL("../data.json", import.meta.url).pathname;
const USER_AGENT = "khutbah-database (github.com/ruqqq/khutbah-database)";
const CONCURRENCY = 4;
const REQUEST_DELAY_MS = 200;
const RETRIES = 1;

const dryRun = process.argv.includes("--dry-run");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await sleep(REQUEST_DELAY_MS * 5);
    }
  }
  throw lastError;
}

async function loadExisting(): Promise<Database | null> {
  const file = Bun.file(DATA_PATH);
  if (!(await file.exists())) return null;
  return (await file.json()) as Database;
}

/** Run `worker` over `jobs` with at most `limit` in flight and a small delay between starts. */
async function runPool<T>(jobs: T[], limit: number, worker: (job: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      await worker(job);
      await sleep(REQUEST_DELAY_MS);
    }
  });
  await Promise.all(lanes);
}

function summarise(db: Database, existing: Database | null, failures: string[]): string {
  const lines: string[] = [];
  const counts = countEntriesByLanguage(db);
  lines.push(`dates: ${db.khutbahs.length}`);
  lines.push(`entries: ${countEntries(db)} (${LANGUAGES.map((l) => `${l}=${counts[l]}`).join(", ")})`);
  lines.push(`newest: ${db.khutbahs[0]?.date ?? "-"}  oldest: ${db.khutbahs[db.khutbahs.length - 1]?.date ?? "-"}`);
  const missing = unresolvedEntries(db);
  lines.push(`entries without pdfUrl: ${missing.length}`);
  for (const m of missing) lines.push(`  - ${m.date} ${m.language} ${m.entry.slug}`);
  if (failures.length > 0) lines.push(`detail fetch failures this run: ${failures.length}`);
  if (existing) {
    const before = new Map<string, string | null>();
    for (const day of existing.khutbahs) {
      for (const l of LANGUAGES) if (day.entries[l]) before.set(`${day.date}|${l}`, day.entries[l]!.pdfUrl);
    }
    let added = 0;
    let resolved = 0;
    const after = new Set<string>();
    for (const day of db.khutbahs) {
      for (const l of LANGUAGES) {
        const entry = day.entries[l];
        if (!entry) continue;
        const key = `${day.date}|${l}`;
        after.add(key);
        if (!before.has(key)) added++;
        else if (before.get(key) === null && entry.pdfUrl !== null) resolved++;
      }
    }
    const removed = [...before.keys()].filter((k) => !after.has(k)).length;
    lines.push(`diff vs existing data.json: +${added} added, -${removed} removed, ${resolved} newly resolved pdfUrl`);
  } else {
    lines.push("diff vs existing data.json: (no existing file)");
  }
  return lines.join("\n");
}

/** Equal apart from `generatedAt`, so an unchanged catalog does not produce a commit (and a new SHA for app clients) every run. */
function sameContent(a: Database, b: Database): boolean {
  const strip = ({ generatedAt: _generatedAt, ...rest }: Database) => JSON.stringify(rest);
  return strip(a) === strip(b);
}

async function main(): Promise<void> {
  const existing = await loadExisting();
  console.log(`Fetching listing ${SOURCE_URL}`);
  const listingHtml = await fetchText(SOURCE_URL);
  const items = parseListing(listingHtml);
  console.log(`Parsed ${items.length} listing items`);

  const days = groupItems(items, pdfLookupFrom(existing));
  const pending = unresolvedEntries({ khutbahs: days });
  console.log(`Resolving ${pending.length} detail pages (concurrency ${CONCURRENCY})`);

  const failures: string[] = [];
  let done = 0;
  await runPool(pending, CONCURRENCY, async ({ date, language, entry }) => {
    try {
      entry.pdfUrl = parseDetail(await fetchText(entry.pageUrl));
      if (entry.pdfUrl === null) console.warn(`No PDF link on ${entry.pageUrl}`);
    } catch (error) {
      failures.push(`${date}/${language}`);
      console.warn(`Failed ${entry.pageUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
    done++;
    if (done % 50 === 0 || done === pending.length) console.log(`  ${done}/${pending.length}`);
  });

  const db = buildDatabase(days, new Date());
  validate(db, { existing });

  console.log(summarise(db, existing, failures));
  if (dryRun) {
    console.log("Dry run: data.json not written");
    return;
  }
  if (existing && sameContent(existing, db)) {
    console.log("No content changes: data.json left untouched");
    return;
  }
  await Bun.write(DATA_PATH, `${JSON.stringify(db, null, 2)}\n`);
  console.log(`Wrote ${DATA_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
