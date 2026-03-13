import { useEffect, useCallback, useRef } from "react";
import { wireSoundButtons } from "@/lib/media-tags";

/**
 * Auto-plays all <audio> elements inside a container sequentially when audioKey changes.
 * Wires up .sound-btn click handlers for manual play/pause.
 * Returns a `replay` function to restart playback.
 */
export function useCardAudio(
  containerRef: React.RefObject<HTMLElement>,
  audioKey: string,
  autoplay: boolean = true,
): { replay: () => void } {
  const abortRef = useRef(false);

  const playAll = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    abortRef.current = false;
    const audios = [...container.querySelectorAll("audio")];

    // Reset all buttons to play state
    for (const btn of container.querySelectorAll<HTMLButtonElement>(
      ".sound-btn",
    )) {
      btn.textContent = "\u25B6";
    }

    let i = 0;
    function playNext(): void {
      if (abortRef.current || i >= audios.length) {
        return;
      }
      const audio = audios[i];
      audio.currentTime = 0;

      // Update corresponding button
      const btn = audio.previousElementSibling as HTMLButtonElement | undefined;
      if (btn?.classList.contains("sound-btn")) {
        btn.textContent = "\u23F8";
      }

      // oxlint-disable-next-line eslint-plugin-promise(prefer-await-to-then) -- fire-and-forget play with error recovery
      audio.play().catch(() => {
        // Play failed (e.g. interrupted by card transition) — reset button and skip ahead
        if (btn?.classList.contains("sound-btn")) {
          btn.textContent = "\u25B6";
        }
        if (i < audios.length) {
          playNext();
        }
      });
      i += 1;

      function onEnded(): void {
        if (btn?.classList.contains("sound-btn")) {
          btn.textContent = "\u25B6";
        }
        if (i < audios.length) {
          playNext();
        }
      }

      audio.addEventListener("ended", onEnded, { once: true });
    }

    playNext();
  }, [containerRef]);

  // Auto-play when audioKey changes, wire up button handlers
  useEffect(() => {
    const container = containerRef.current;

    // Capture current audio elements so cleanup targets the right (old) elements
    const currentAudios: HTMLAudioElement[] = container
      ? [...container.querySelectorAll("audio")]
      : [];

    // Wire up play/pause buttons
    let cleanupButtons: (() => void) | undefined;
    if (container) {
      cleanupButtons = wireSoundButtons(container);
    }

    // Auto-play only when enabled (e.g. front side only)
    const timer = autoplay ? setTimeout(playAll, 50) : undefined;

    return () => {
      if (timer) clearTimeout(timer);
      abortRef.current = true;
      cleanupButtons?.();
      // Pause captured audio elements (not the new card's elements)
      for (const audio of currentAudios) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [audioKey, autoplay, playAll, containerRef]);

  return { replay: playAll };
}
