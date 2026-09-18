const PDF_HREF_RE = /href="(https:\/\/isomer-user-content\.by\.gov\.sg\/[^"]*?\.pdf)"/i;

/** Percent-encode spaces so the stored URL is usable verbatim. */
export function normalisePdfUrl(url: string): string {
  return url.replace(/ /g, "%20");
}

/** Detail HTML → first gov.sg PDF href, or null when the page links no PDF. */
export function parseDetail(html: string): string | null {
  const match = PDF_HREF_RE.exec(html);
  const href = match?.[1];
  return href === undefined ? null : normalisePdfUrl(href);
}
