import { useState, useRef } from "react";
import { X, Upload, Volume2, Film, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function isMediaOnlyField(value: string): boolean {
  const stripped = value
    .replaceAll(/\[(image|audio|video):[^\]]+\]/g, "")
    .trim();
  return stripped.length === 0 && /\[(image|audio|video):[^\]]+\]/.test(value);
}

type FieldAttachmentsProps = {
  fieldValue: string;
  onFieldChange: (newValue: string) => void;
  mediaExclusive?: boolean;
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

  // Match [image:file], [audio:file], [video:file] bracket tags
  const bracketRegex = /\[(image|audio|video):([^\]]+)\]/g;
  let match;
  while ((match = bracketRegex.exec(text)) !== null) {
    const type = match[1] as "image" | "audio" | "video";
    const filename = match[2];
    if (seen.has(filename)) {
      continue;
    }
    seen.add(filename);

    refs.push({ url: `/api/media/${filename}`, filename, type });
  }

  return refs;
}

export function FieldAttachments({
  fieldValue,
  onFieldChange,
  mediaExclusive,
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

      // Extract just the filename from the URL (e.g. "/api/media/hash.jpg" → "hash.jpg")
      const filename = data.url.split("/").pop() ?? data.url;
      let tag: string;
      if (data.mimeType.startsWith("image/")) {
        tag = `[image:${filename}]`;
      } else if (data.mimeType.startsWith("audio/")) {
        tag = `[audio:${filename}]`;
      } else {
        tag = `[video:${filename}]`;
      }

      if (mediaExclusive) {
        onFieldChange(tag);
      } else {
        onFieldChange(fieldValue ? `${fieldValue} ${tag}` : tag);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleDelete(ref: MediaRef): void {
    if (mediaExclusive) {
      onFieldChange("");
      return;
    }
    let newValue = fieldValue;
    const escaped = escapeRegExp(ref.filename);
    // Remove bracket media tags: [image:file], [audio:file], [video:file]
    newValue = replaceAllMatches(
      newValue,
      new RegExp(`\\[(?:image|audio|video):${escaped}\\]`),
      "",
    );
    // Clean up double spaces left by tag removal, but preserve intentional formatting
    newValue = replaceAllMatches(newValue, /  +/, " ").trim();
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
          Attach media
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

  // Exclusive mode: show prominent preview with Replace/Delete actions
  if (mediaExclusive && mediaRefs.length > 0) {
    const ref = mediaRefs[0];
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-2">
        {ref.type === "image" && (
          <img src={ref.url} alt="" className="size-20 rounded object-cover" />
        )}
        {ref.type === "audio" && (
          <div className="flex size-20 items-center justify-center rounded bg-muted">
            <Volume2 className="size-8 text-muted-foreground" />
          </div>
        )}
        {ref.type === "video" && (
          <div className="flex size-20 items-center justify-center rounded bg-muted">
            <Film className="size-8 text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="truncate text-xs text-muted-foreground">
            {ref.filename}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <RefreshCw className="size-3" data-icon="inline-start" />
              Replace
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => handleDelete(ref)}
            >
              <Trash2 className="size-3" data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </div>
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
