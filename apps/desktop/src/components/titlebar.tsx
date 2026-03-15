import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";

const isMac = window.electronAPI.platform === "darwin";

export function Titlebar(): React.ReactElement {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Get initial maximized state
    void window.electronAPI.isMaximized().then(setIsMaximized);

    // Listen for maximize/unmaximize events
    window.electronAPI.onMaximizedChange(setIsMaximized);
  }, []);

  if (isMac) {
    return (
      <div
        className="flex h-10 shrink-0 items-center justify-center border-b border-border bg-sidebar"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        {/* Left padding for traffic lights */}
        <div className="w-[70px]" />
        <span className="flex-1 text-center text-xs font-medium text-muted-foreground select-none">
          Swanki
        </span>
        <div className="w-[70px]" />
      </div>
    );
  }

  // Windows / Linux
  return (
    <div
      className="flex h-10 shrink-0 items-center border-b border-border bg-sidebar"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="flex-1 pl-4">
        <span className="text-xs font-medium text-muted-foreground select-none">
          Swanki
        </span>
      </div>

      <div
        className="flex h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => void window.electronAPI.minimize()}
          className="flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Minimize"
        >
          <Minus className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => void window.electronAPI.maximize()}
          className="flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Copy className="size-3.5" />
          ) : (
            <Square className="size-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => void window.electronAPI.close()}
          className="flex h-full w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-red-600 hover:text-white"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
