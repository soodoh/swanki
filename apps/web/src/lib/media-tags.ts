/**
 * Expand [image:], [audio:], and [video:] bracket tags into HTML elements.
 *
 * Called AFTER sanitizeHtml so DOMPurify never sees the generated media elements.
 * Audio tags render a play button + hidden <audio>; event wiring is done
 * by wireSoundButtons() after the HTML is mounted in the DOM.
 */
export function expandMediaTags(
	html: string,
	mediaBaseUrl = "/api/media/",
): string {
	/* oxlint-disable unicorn(prefer-string-replace-all) -- replaceAll returns `any` in oxlint type inference */
	let result = html;

	// [image:file] → <img>
	result = result.replace(
		/\[image:([^\]]+)\]/g,
		`<img src="${mediaBaseUrl}$1">`,
	);

	// [audio:file] → play button + <audio>
	result = result.replace(
		/\[audio:([^\]]+)\]/g,
		`<span class="sound-player"><button type="button" class="sound-btn" aria-label="Play audio">\u25B6</button><audio src="${mediaBaseUrl}$1" preload="auto"></audio></span>`,
	);

	// [video:file] → <video>
	result = result.replace(
		/\[video:([^\]]+)\]/g,
		`<video src="${mediaBaseUrl}$1" controls></video>`,
	);

	/* oxlint-enable unicorn(prefer-string-replace-all) */
	return result;
}

/**
 * Wire up click handlers on .sound-btn elements within a container.
 * Each button toggles play/pause on its sibling <audio>.
 * Call this after mounting HTML that contains sound players.
 * Returns a cleanup function to remove listeners.
 */
export function wireSoundButtons(container: HTMLElement): () => void {
	const buttons = container.querySelectorAll<HTMLButtonElement>(".sound-btn");
	const controllers: Array<() => void> = [];

	for (const btn of buttons) {
		const audio = btn.nextElementSibling;
		if (!audio || audio.tagName !== "AUDIO") {
			continue;
		}
		const audioEl = audio as HTMLAudioElement;

		const handleClick = (): void => {
			if (audioEl.paused) {
				// oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then) -- fire-and-forget play with error recovery
				audioEl.play().catch(() => {
					btn.textContent = "\u25B6";
				});
				btn.textContent = "\u23F8";
			} else {
				audioEl.pause();
				btn.textContent = "\u25B6";
			}
		};

		const handleEnded = (): void => {
			btn.textContent = "\u25B6";
		};

		btn.addEventListener("click", handleClick);
		audioEl.addEventListener("ended", handleEnded);

		controllers.push(() => {
			btn.removeEventListener("click", handleClick);
			audioEl.removeEventListener("ended", handleEnded);
		});
	}

	return () => {
		for (const cleanup of controllers) {
			cleanup();
		}
	};
}
