import { useState, useRef } from "react";
import { X, Upload, Volume2, Film } from "lucide-react";
import { Button } from "@/components/ui/button";

type FieldAttachmentsProps = {
  fieldValue: string;
  onFieldChange: (newValue: string) => void;
};

type MediaRef = {
  url: string;
  filename: string;
  type: "image" | "audio" | "video";
};

/** Replace all occurrences of `pattern` in `str` with `replacement`. */
function replaceAllMatches(
  str: string,
  pattern: RegExp,
  replacement: string,
): string {
  return str.split(pattern).join(replacement);
}

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/;

/** Escape special regex characters in a string. */
function escapeRegExp(str: string): string {
  let result = "";
  for (const ch of str) {
    result += REGEX_SPECIAL_CHARS.test(ch) ? `\\${ch}` : ch;
  }
  return result;
}

function parseMediaRefs(text: string): MediaRef[] {
  const refs: MediaRef[] = [];
  const seen = new Set<string>();

  const srcRegex = /\/api\/media\/([^\s"'<>\]]+)/g;
  let match;
  while ((match = srcRegex.exec(text)) !== null) {
    const filename = match[1];
    if (seen.has(filename)) {
      continue;
    }
    seen.add(filename);

    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    let type: "image" | "audio" | "video" = "image";
    if (["mp3", "wav", "ogg", "m4a"].includes(ext)) {
      type = "audio";
    }
    if (["mp4", "webm", "mov"].includes(ext)) {
      type = "video";
    }

    refs.push({ url: `/api/media/${filename}`, filename, type });
  }

  return refs;
}

export function FieldAttachments({
  fieldValue,
  onFieldChange,
}: FieldAttachmentsProps): React.ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const mediaRefs = parseMediaRefs(fieldValue);

  async function handleUpload(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }
      const data = (await res.json()) as {
        url: string;
        mimeType: string;
      };

      let tag: string;
      if (data.mimeType.startsWith("image/")) {
        tag = `<img src="${data.url}">`;
      } else if (data.mimeType.startsWith("audio/")) {
        tag = `[sound:${data.url}]`;
      } else {
        tag = `<video src="${data.url}" controls></video>`;
      }

      onFieldChange(fieldValue ? `${fieldValue} ${tag}` : tag);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleDelete(ref: MediaRef): void {
    let newValue = fieldValue;
    const escaped = escapeRegExp(ref.url);
    // Remove <img> tags
    newValue = replaceAllMatches(
      newValue,
      new RegExp(`<img[^>]*src="${escaped}"[^>]*>`),
      "",
    );
    // Remove [sound:] tags
    newValue = replaceAllMatches(
      newValue,
      new RegExp(`\\[sound:${escaped}\\]`),
      "",
    );
    // Remove <video> tags
    newValue = replaceAllMatches(
      newValue,
      new RegExp(`<video[^>]*src="${escaped}"[^>]*>[^<]*</video>`),
      "",
    );
    newValue = replaceAllMatches(newValue, /\s+/, " ").trim();
    onFieldChange(newValue);
  }

  if (mediaRefs.length === 0 && !uploading) {
    return (
      <div className="flex items-center gap-1 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] text-muted-foreground"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-3" data-icon="inline-start" />
          Attach file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,audio/*,video/*"
          className="hidden"
          onChange={handleUpload}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {mediaRefs.map((ref) => (
        <div
          key={ref.filename}
          className="group relative rounded border border-border bg-muted/50"
        >
          {ref.type === "image" && (
            <img
              src={ref.url}
              alt=""
              className="size-12 rounded object-cover"
            />
          )}
          {ref.type === "audio" && (
            <div className="flex size-12 items-center justify-center">
              <Volume2 className="size-5 text-muted-foreground" />
            </div>
          )}
          {ref.type === "video" && (
            <div className="flex size-12 items-center justify-center">
              <Film className="size-5 text-muted-foreground" />
            </div>
          )}
          <button
            type="button"
            onClick={() => handleDelete(ref)}
            className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        <Upload className="size-3.5" />
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,audio/*,video/*"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}
