export type UploadProgressCallback = (loaded: number, total: number) => void;

export type UploadResponse = {
  fileId: string;
  filename: string;
  size: number;
  format: string;
};

export async function uploadWithProgress(
  file: File,
  onProgress: UploadProgressCallback,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    function settle(fn: () => void): void {
      if (!settled) {
        settled = true;
        fn();
      }
    }

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as UploadResponse;
          settle(() => resolve(data));
        } catch {
          settle(() =>
            reject(new Error("Invalid response from upload endpoint")),
          );
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText) as { error?: string };
          settle(() =>
            reject(new Error(errData.error ?? `Upload failed (${xhr.status})`)),
          );
        } catch {
          settle(() => reject(new Error(`Upload failed (${xhr.status})`)));
        }
      }
    });

    xhr.addEventListener("error", () => {
      settle(() => reject(new Error("Network error during upload")));
    });

    xhr.addEventListener("abort", () => {
      settle(() => reject(new Error("Upload cancelled")));
    });

    const formData = new FormData();
    formData.append("file", file);

    xhr.open("POST", "/api/import/upload");
    xhr.send(formData);
  });
}
