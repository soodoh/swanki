import { expect, test } from "./fixtures";
import { RENDERER_URL } from "./global-setup";

/** Locator for the user dropdown trigger in the sidebar footer. */
const FOOTER_BUTTON =
	'[data-sidebar="footer"] button[data-slot="dropdown-menu-trigger"]';

const MOCK_USER = {
	name: "Jane Doe",
	email: "jane@example.com",
};

test.describe
	.serial("desktop sidebar auth flow", () => {
		test("sidebar shows Sign in when not authenticated", async ({ page }) => {
			await page.goto(`${RENDERER_URL}/`, { waitUntil: "load" });
			await page.waitForSelector('[data-sidebar="sidebar"]', {
				timeout: 15_000,
			});

			// Default state: authStatus returns signedIn: false (no cloud session)
			await page.locator(FOOTER_BUTTON).click();

			const signInItem = page.getByRole("menuitem", { name: "Sign in" });
			await expect(signInItem).toBeVisible();

			// Verify "Local User" is displayed
			const footer = page.locator('[data-sidebar="footer"]');
			await expect(footer.getByText("Local User")).toBeVisible();

			await page.keyboard.press("Escape");
		});

		test("sign-in without local data shows real user info", async ({
			page,
			electronApp,
		}) => {
			// Mock auth:sign-in to return user info with no local data
			await electronApp.evaluate(({ ipcMain }) => {
				ipcMain.removeHandler("auth:sign-in");
				ipcMain.handle("auth:sign-in", () => ({
					signedIn: true,
					hasLocalData: false,
					user: { name: "Jane Doe", email: "jane@example.com" },
				}));
			});

			// Open dropdown and click "Sign in"
			await page.locator(FOOTER_BUTTON).click();
			await page.getByRole("menuitem", { name: "Sign in" }).click();

			// Wait for React state update
			await page.waitForTimeout(500);

			// Verify sidebar footer shows real user info
			const footer = page.locator('[data-sidebar="footer"]');
			await expect(footer.getByText(MOCK_USER.name)).toBeVisible();
			await expect(footer.getByText(MOCK_USER.email)).toBeVisible();

			// Re-open dropdown and verify "Sign out" is now visible
			await page.locator(FOOTER_BUTTON).click();
			const signOutItem = page.getByRole("menuitem", { name: "Sign out" });
			await expect(signOutItem).toBeVisible();

			await page.keyboard.press("Escape");
		});

		test("sign-in with local data shows merge dialog — replace", async ({
			page,
			electronApp,
		}) => {
			// Reset state: sign out first
			await electronApp.evaluate(({ ipcMain }) => {
				ipcMain.removeHandler("auth:sign-out");
				ipcMain.handle("auth:sign-out", () => ({ signedIn: false }));
				ipcMain.removeHandler("auth:status");
				ipcMain.handle("auth:status", () => ({
					signedIn: false,
					cloudUrl: "http://localhost:3000",
				}));
			});

			// Reload to reset state
			await page.goto(`${RENDERER_URL}/`, { waitUntil: "load" });
			await page.waitForSelector('[data-sidebar="sidebar"]', {
				timeout: 15_000,
			});

			// Mock sign-in to return hasLocalData: true
			await electronApp.evaluate(({ ipcMain }) => {
				ipcMain.removeHandler("auth:sign-in");
				ipcMain.handle("auth:sign-in", () => ({
					signedIn: true,
					hasLocalData: true,
					user: { name: "Jane Doe", email: "jane@example.com" },
				}));
				ipcMain.removeHandler("auth:complete-sign-in");
				ipcMain.handle("auth:complete-sign-in", () => ({
					ok: true,
					user: { name: "Jane Doe", email: "jane@example.com" },
				}));
			});

			// Click Sign in
			await page.locator(FOOTER_BUTTON).click();
			await page.getByRole("menuitem", { name: "Sign in" }).click();

			// Verify merge dialog appears
			await expect(
				page.getByRole("heading", { name: "Existing Local Data" }),
			).toBeVisible({ timeout: 5_000 });

			// Click "Use Cloud Data" (replace strategy)
			await page.getByRole("button", { name: "Use Cloud Data" }).click();

			// Verify dialog closes
			await expect(
				page.getByRole("heading", { name: "Existing Local Data" }),
			).not.toBeVisible({ timeout: 5_000 });

			// Verify sidebar shows real user info
			const footer = page.locator('[data-sidebar="footer"]');
			await expect(footer.getByText(MOCK_USER.name)).toBeVisible();
		});

		test("sign-in with local data shows merge dialog — merge", async ({
			page,
			electronApp,
		}) => {
			// Reset state
			await electronApp.evaluate(({ ipcMain }) => {
				ipcMain.removeHandler("auth:sign-out");
				ipcMain.handle("auth:sign-out", () => ({ signedIn: false }));
				ipcMain.removeHandler("auth:status");
				ipcMain.handle("auth:status", () => ({
					signedIn: false,
					cloudUrl: "http://localhost:3000",
				}));
			});

			await page.goto(`${RENDERER_URL}/`, { waitUntil: "load" });
			await page.waitForSelector('[data-sidebar="sidebar"]', {
				timeout: 15_000,
			});

			// Mock sign-in with hasLocalData
			await electronApp.evaluate(({ ipcMain }) => {
				ipcMain.removeHandler("auth:sign-in");
				ipcMain.handle("auth:sign-in", () => ({
					signedIn: true,
					hasLocalData: true,
					user: { name: "Jane Doe", email: "jane@example.com" },
				}));
				ipcMain.removeHandler("auth:complete-sign-in");
				ipcMain.handle("auth:complete-sign-in", () => ({
					ok: true,
					user: { name: "Jane Doe", email: "jane@example.com" },
				}));
			});

			// Click Sign in
			await page.locator(FOOTER_BUTTON).click();
			await page.getByRole("menuitem", { name: "Sign in" }).click();

			// Verify merge dialog appears
			await expect(
				page.getByRole("heading", { name: "Existing Local Data" }),
			).toBeVisible({ timeout: 5_000 });

			// Click "Merge Data"
			await page.getByRole("button", { name: "Merge Data" }).click();

			// Verify dialog closes
			await expect(
				page.getByRole("heading", { name: "Existing Local Data" }),
			).not.toBeVisible({ timeout: 5_000 });

			// Verify sidebar shows real user info
			const footer = page.locator('[data-sidebar="footer"]');
			await expect(footer.getByText(MOCK_USER.name)).toBeVisible();
		});

		test("auth:status returns user info on page reload", async ({
			page,
			electronApp,
		}) => {
			// Mock auth:status to return signed-in with user info
			await electronApp.evaluate(({ ipcMain }) => {
				ipcMain.removeHandler("auth:status");
				ipcMain.handle("auth:status", () => ({
					signedIn: true,
					cloudUrl: "http://localhost:3000",
					user: { name: "Jane Doe", email: "jane@example.com" },
				}));
			});

			// Reload page
			await page.goto(`${RENDERER_URL}/`, { waitUntil: "load" });
			await page.waitForSelector('[data-sidebar="sidebar"]', {
				timeout: 15_000,
			});

			// Wait for useEffect to run
			await page.waitForTimeout(500);

			// Verify sidebar shows real user info
			const footer = page.locator('[data-sidebar="footer"]');
			await expect(footer.getByText(MOCK_USER.name)).toBeVisible();
			await expect(footer.getByText(MOCK_USER.email)).toBeVisible();
		});

		test("sign-out reverts to Local User", async ({ page, electronApp }) => {
			// Mock sign-out and status
			await electronApp.evaluate(({ ipcMain }) => {
				ipcMain.removeHandler("auth:sign-out");
				ipcMain.handle("auth:sign-out", () => ({ signedIn: false }));
				ipcMain.removeHandler("auth:status");
				ipcMain.handle("auth:status", () => ({
					signedIn: false,
					cloudUrl: "http://localhost:3000",
				}));
			});

			// Open dropdown and click "Sign out"
			await page.locator(FOOTER_BUTTON).click();
			await page.getByRole("menuitem", { name: "Sign out" }).click();

			// handleSignOut navigates to "/" via full reload, wait for sidebar
			await page.waitForSelector('[data-sidebar="sidebar"]', {
				timeout: 15_000,
			});

			// Verify sidebar reverts to Local User
			const footer = page.locator('[data-sidebar="footer"]');
			await expect(footer.getByText("Local User")).toBeVisible();
			await expect(footer.getByText("local@swanki.app")).toBeVisible();

			// Verify "Sign in" is in the dropdown
			await page.locator(FOOTER_BUTTON).click();
			const signInItem = page.getByRole("menuitem", { name: "Sign in" });
			await expect(signInItem).toBeVisible();
		});
	});
