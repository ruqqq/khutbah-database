# khutbah-database

A small, auto-updated index of the weekly Friday khutbahs published by MUIS
(Majlis Ugama Islam Singapura) in English, Malay and Tamil. The index lives in
[`data.json`](./data.json) and is consumed by the PrayerTime Pro app.

MUIS publishes khutbahs at
<https://www.muis.gov.sg/resources/khutbah-and-religious-advice/khutbah/> with
no RSS feed or API. A GitHub Action scrapes that page a few times around Friday,
resolves the PDF link for each new khutbah, and commits the result here so the
app only downloads a small JSON file.

The PDFs themselves are hosted by gov.sg (`isomer-user-content.by.gov.sg`) and
are **not mirrored** in this repository; `pdfUrl` links straight to them.

## Schema

```json
{
  "generatedAt": "2026-09-18T04:00:00.000Z",
  "source": "https://www.muis.gov.sg/resources/khutbah-and-religious-advice/khutbah/",
  "khutbahs": [
    {
      "date": "2026-09-18",
      "entries": {
        "en": {
          "slug": "overcoming-the-whispers-of-the-heart-with-faith-",
          "title": "Overcoming the whispers of the heart with faith",
          "description": "Nothing is hidden from Allah's knowledge, ...",
          "pageUrl": "https://www.muis.gov.sg/resources/khutbah-and-religious-advice/khutbah/overcoming-the-whispers-of-the-heart-with-faith-/",
          "pdfUrl": "https://isomer-user-content.by.gov.sg/48/.../E26Sep18%20-%20Overcoming%20the%20Whispers%20of%20the%20Heart%20with%20Faith.pdf"
        },
        "ms": { "...": "..." },
        "ta": { "...": "..." }
      }
    }
  ]
}
```

- `khutbahs` is sorted by `date` descending (`YYYY-MM-DD`). Most dates are
  Fridays; a few are special khutbahs (e.g. Eid).
- `entries` is keyed by language: `en` (English), `ms` (Malay/Jawi), `ta`
  (Tamil). A language is simply absent when MUIS did not publish it for that
  date.
- `pdfUrl` is `null` when the detail page had no PDF link or could not be
  fetched; consumers should fall back to `pageUrl`. Unresolved entries are
  retried on the next run.
- `slug` is the last segment of the MUIS page path.

## How it runs

`.github/workflows/scrape.yml` runs on a cron at Thu 09:00, Thu 15:00,
Fri 01:00 and Fri 07:00 Singapore time, plus on demand. Each run:

1. Downloads the listing page and parses the embedded catalog (the whole
   history since January 2020 is in the page's React Server Components
   payload).
2. Fetches the detail page only for entries that do not already have a
   `pdfUrl` in the committed `data.json` (at most 4 concurrent requests, with a
   short delay between them).
3. Validates the result: dates are well-formed, the newest date is within 14
   days of today, and the entry count has not shrunk by more than 5% versus the
   committed file. Any failure fails the job loudly and leaves the previous
   `data.json` untouched.
4. Commits `data.json` only when it changed.

### Re-running manually

Open the **Actions** tab on GitHub, pick **Scrape MUIS khutbahs**, and use
**Run workflow** (`workflow_dispatch`). Or with the GitHub CLI:

```sh
gh workflow run scrape.yml
```

If the job fails because the feed looks stale, check whether MUIS has actually
published this week's khutbah before assuming the scraper is broken.

## Running locally

Requires [Bun](https://bun.sh).

```sh
bun install
bun run scrape:dry   # prints a summary and diff counts; writes nothing
bun run scrape       # writes data.json
bun test             # unit tests against the fixtures in tests/fixtures
bun run check        # tsc --noEmit
```

The scraper is split into small pure modules under `tools/lib/`:

| Module            | Responsibility                                          |
| ----------------- | ------------------------------------------------------- |
| `parseListing.ts` | Listing HTML → one item per khutbah page                 |
| `parseDetail.ts`  | Detail HTML → PDF URL or `null`                          |
| `group.ts`        | Items → grouped `data.json` shape, carrying over PDFs   |
| `validate.ts`     | Sanity checks that gate the commit                       |

`tools/scrape.ts` is the only file that touches the network.

## License

MIT. See [LICENSE](./LICENSE). The khutbah content and PDFs belong to MUIS.
