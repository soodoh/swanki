/**
 * Replace [sound:url] tags with a play button + hidden audio element.
 * The same pattern is used in import-service.ts for rewriting media URLs.
 *
 * Renders a wrapper with a button and hidden <audio>. Event wiring is done
 * by wireSoundButtons() after the HTML is mounted in the DOM.
 */
export function replaceSoundTags(html: string): string {
  // oxlint-disable-next-line eslint-plugin-unicorn(prefer-string-replace-all) -- replaceAll returns `any` in oxlint type inference
  return html.replace(
    /\[sound:([^\]]+)\]/g,
    '<span class="sound-player"><button type="button" class="sound-btn" aria-label="Play audio">\u25B6</button><audio src="$1" preload="auto"></audio></span>',
  );
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
        void audioEl.play();
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
