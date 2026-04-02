import { describe, expect, it } from "vitest";
import { sanitizeCss } from "@/lib/sanitize";

describe("sanitizeCss", () => {
	it("escapes closing style tag sequences", () => {
		const input = `</style><script>alert(1)</script>`;
		const result = sanitizeCss(input);
		expect(result).not.toContain("</style>");
	});
});
