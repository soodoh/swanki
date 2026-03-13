import { describe, it, expect } from "vitest";
import { sanitizeCss } from "@/lib/sanitize";

describe("sanitizeCss", () => {
  it("strips .card rules entirely", () => {
    const input = `.card {
  font-family: arial;
  font-size: 20px;
  color: black;
  background-color: white;
}
.other { color: red; }`;
    const result = sanitizeCss(input);
    expect(result).not.toContain(".card");
    expect(result).toContain(".other { color: red; }");
  });

  it("does not strip non-.card rules", () => {
    const input = `.field { color: red; } .card-wrapper { padding: 8px; }`;
    const result = sanitizeCss(input);
    expect(result).toContain(".field { color: red; }");
    expect(result).toContain(".card-wrapper { padding: 8px; }");
  });

  it("escapes closing style tag sequences", () => {
    const input = `</style><script>alert(1)</script>`;
    const result = sanitizeCss(input);
    expect(result).not.toContain("</style>");
  });
});
