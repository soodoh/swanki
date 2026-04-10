import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/browser/render";
import { CardDisplay } from "./card-display";

const cardAudioMocks = vi.hoisted(() => ({
	useCardAudio: vi.fn(),
}));

vi.mock("@/lib/hooks/use-card-audio", () => ({
	useCardAudio: cardAudioMocks.useCardAudio,
}));

describe("CardDisplay", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cardAudioMocks.useCardAudio.mockReturnValue({ replay: vi.fn() });
	});

	it("sanitizes rendered HTML and exposes the show answer button before reveal", async () => {
		const onShowAnswer = vi.fn();

		const { container } = await renderWithProviders(
			<CardDisplay
				html="<div><strong>Question</strong><script>window.bad = true</script></div>"
				showAnswer={false}
				onShowAnswer={onShowAnswer}
			/>,
		);

		await expect.element(container.querySelector("strong") as Element).toBeVisible();
		await expect.element(container.querySelector("button") as Element).toBeVisible();
		expect(container.querySelector("script")).toBeNull();

		container.querySelector("button")?.click();

		expect(onShowAnswer).toHaveBeenCalledTimes(1);
	});

	it("hides the show answer button after the answer is already shown", async () => {
		const { container } = await renderWithProviders(
			<CardDisplay
				html="<div><em>Answer</em></div>"
				showAnswer={true}
				onShowAnswer={() => {}}
			/>,
		);

		await expect.element(container.querySelector("em") as Element).toBeVisible();
		expect(container.querySelector("button")).toBeNull();
	});
});
