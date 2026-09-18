import { describe, expect, test } from "bun:test";
import { parseDetail } from "../tools/lib/parseDetail";

const detail = await Bun.file(new URL("./fixtures/detail.html", import.meta.url)).text();
const noPdf = await Bun.file(new URL("./fixtures/detail-no-pdf.html", import.meta.url)).text();

describe("parseDetail", () => {
  test("returns the first gov.sg PDF href with spaces percent-encoded", () => {
    expect(parseDetail(detail)).toBe(
      "https://isomer-user-content.by.gov.sg/48/a4f51918-2d4f-43ec-9ea6-a781b6d3bd3f/E26Sep18%20-%20Overcoming%20the%20Whispers%20of%20the%20Heart%20with%20Faith.pdf",
    );
  });
  test("returns null when the page has no PDF link", () => {
    expect(parseDetail(noPdf)).toBeNull();
  });
});
