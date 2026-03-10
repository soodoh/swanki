import { useEffect, useCallback, useRef } from "react";
import { wireSoundButtons } from "@/lib/sound";

/**
 * Auto-plays all <audio> elements inside a container sequentially when audioKey changes.
 * Wires up .sound-btn click handlers for manual play/pause.
 * Returns a `replay` function to restart playback.
 */
export function useCardAudio(
  containerRef: React.RefObject<HTMLElement>,
  audioKey: string,
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

      void audio.play();
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

    // Wire up play/pause buttons
    let cleanupButtons: (() => void) | undefined;
    if (container) {
      cleanupButtons = wireSoundButtons(container);
    }

    // Small delay to ensure DOM has rendered the new audio elements
    const timer = setTimeout(playAll, 50);

    return () => {
      clearTimeout(timer);
      abortRef.current = true;
      cleanupButtons?.();
      // Pause all audio on cleanup
      if (container) {
        for (const audio of container.querySelectorAll("audio")) {
          audio.pause();
        }
      }
    };
  }, [audioKey, playAll, containerRef]);

  return { replay: playAll };
}
