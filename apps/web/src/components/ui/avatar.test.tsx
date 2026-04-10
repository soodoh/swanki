import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
	Avatar,
	AvatarBadge,
	AvatarFallback,
	AvatarGroup,
	AvatarGroupCount,
	AvatarImage,
} from "./avatar";

describe("Avatar", () => {
	it("renders the avatar fallback path, badge, and group count", async () => {
		const onLoadingStatusChange = vi.fn();

		const screen = await render(
			<AvatarGroup>
				<Avatar className="test-avatar">
					<AvatarImage
						alt="Jane Doe"
						src="/missing-avatar.png"
						onLoadingStatusChange={onLoadingStatusChange}
					/>
					<AvatarFallback>JD</AvatarFallback>
					<AvatarBadge>1</AvatarBadge>
				</Avatar>
				<Avatar>
					<AvatarFallback>JS</AvatarFallback>
				</Avatar>
				<AvatarGroupCount>+2</AvatarGroupCount>
			</AvatarGroup>,
		);

		await vi.waitFor(() => {
			expect(onLoadingStatusChange).toHaveBeenCalledWith("error");
		});

		await expect.element(screen.getByText("JS")).toBeVisible();
		await expect.element(screen.getByText("JD")).toBeVisible();
		await expect.element(screen.getByText("1")).toBeVisible();
		await expect.element(screen.getByText("+2")).toBeVisible();
		await expect
			.element(screen.container.querySelector(".test-avatar") as Element)
			.toBeVisible();
		await expect
			.element(screen.container.querySelector('[data-slot="avatar-badge"]') as Element)
			.toHaveTextContent("1");
		await expect
			.element(screen.container.querySelector('[data-slot="avatar-group-count"]') as Element)
			.toHaveTextContent("+2");
	});

	it("renders the avatar image wrapper when the image loads", async () => {
		class MockImage {
			onload: null | (() => void) = null;
			onerror: null | (() => void) = null;
			crossOrigin: null | string = null;
			referrerPolicy = "";

			set src(_value: string) {
				queueMicrotask(() => {
					this.onload?.();
				});
			}
		}

		vi.stubGlobal("Image", MockImage);

		try {
			const screen = await render(
				<Avatar>
					<AvatarImage
						alt="Jane Doe"
						src="data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="
					/>
					<AvatarFallback>JD</AvatarFallback>
				</Avatar>,
			);

			await expect
				.element(screen.container.querySelector('[data-slot="avatar-image"]') as Element)
				.toBeVisible();
			expect(document.body.textContent ?? "").not.toContain("JD");
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
