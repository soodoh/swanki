import { describe, expect, it } from "vitest";
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
	it("renders the avatar slots and forwards size metadata", async () => {
		const screen = await render(
			<AvatarGroup>
				<Avatar size="lg">
					<AvatarImage render={<img alt="Jane Doe" />} />
					<AvatarFallback>JD</AvatarFallback>
					<AvatarBadge aria-hidden="true">1</AvatarBadge>
				</Avatar>
				<AvatarGroupCount>+2</AvatarGroupCount>
			</AvatarGroup>,
		);

		const group = screen.container.querySelector('[data-slot="avatar-group"]');
		const avatar = screen.container.querySelector('[data-slot="avatar"]');
		const fallback = screen.container.querySelector('[data-slot="avatar-fallback"]');
		const badge = screen.container.querySelector('[data-slot="avatar-badge"]');
		const count = screen.container.querySelector('[data-slot="avatar-group-count"]');

		expect(group).toBeTruthy();
		expect(avatar).toBeTruthy();
		expect(fallback).toBeTruthy();
		expect(badge).toBeTruthy();
		expect(count).toBeTruthy();

		await expect.element(avatar as Element).toHaveAttribute("data-size", "lg");
	});
});
