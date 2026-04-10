import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadWithProgress } from "@/lib/upload-with-progress";

type Listener = (event?: {
	lengthComputable?: boolean;
	loaded?: number;
	total?: number;
}) => void;

class FakeProgressTarget {
	private listeners = new Map<string, Listener[]>();

	addEventListener(type: string, listener: Listener): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	dispatch(type: string, event?: {
		lengthComputable?: boolean;
		loaded?: number;
		total?: number;
	}): void {
		for (const listener of this.listeners.get(type) ?? []) {
			listener(event);
		}
	}
}

class FakeXMLHttpRequest {
	static instances: FakeXMLHttpRequest[] = [];

	upload = new FakeProgressTarget();
	status = 0;
	responseText = "";
	method?: string;
	url?: string;
	body?: FormData;
	private listeners = new Map<string, Listener[]>();

	constructor() {
		FakeXMLHttpRequest.instances.push(this);
	}

	addEventListener(type: string, listener: Listener): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	open(method: string, url: string): void {
		this.method = method;
		this.url = url;
	}

	send(body: FormData): void {
		this.body = body;
	}

	dispatch(type: string): void {
		for (const listener of this.listeners.get(type) ?? []) {
			listener();
		}
	}

	static latest(): FakeXMLHttpRequest {
		const instance = FakeXMLHttpRequest.instances.at(-1);
		if (!instance) {
			throw new Error("Expected an XMLHttpRequest instance");
		}
		return instance;
	}

	static reset(): void {
		FakeXMLHttpRequest.instances = [];
	}
}

describe("uploadWithProgress", () => {
	afterEach(() => {
		FakeXMLHttpRequest.reset();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("uses Electron IPC when globalThis.electronAPI is an object", async () => {
		const invoke = vi.fn().mockResolvedValue({
			fileId: "upload-1",
			filename: "deck.apkg",
			size: 3,
			format: "apkg",
		});
		const onProgress = vi.fn();
		const file = new File([new Uint8Array([1, 2, 3])], "deck.apkg");

		vi.stubGlobal("electronAPI", { invoke });

		const result = await uploadWithProgress(file, onProgress);

		expect(result).toEqual({
			fileId: "upload-1",
			filename: "deck.apkg",
			size: 3,
			format: "apkg",
		});
		expect(onProgress).toHaveBeenCalledWith(3, 3);
		expect(invoke).toHaveBeenCalledWith("import:upload", {
			filename: "deck.apkg",
			data: new Uint8Array([1, 2, 3]),
		});
		expect(FakeXMLHttpRequest.instances).toHaveLength(0);
	});

	it("falls back to XMLHttpRequest when electronAPI is not an object", async () => {
		const onProgress = vi.fn();
		const file = new File([new Uint8Array([1, 2, 3])], "deck.apkg");

		vi.stubGlobal(
			"XMLHttpRequest",
			FakeXMLHttpRequest as unknown as typeof XMLHttpRequest,
		);
		vi.stubGlobal("electronAPI", "desktop");

		const uploadPromise = uploadWithProgress(file, onProgress);
		const xhr = FakeXMLHttpRequest.latest();
		xhr.status = 200;
		xhr.responseText = JSON.stringify({
			fileId: "upload-1",
			filename: "deck.apkg",
			size: 3,
			format: "apkg",
		});
		xhr.dispatch("load");

		await expect(uploadPromise).resolves.toEqual({
			fileId: "upload-1",
			filename: "deck.apkg",
			size: 3,
			format: "apkg",
		});
		expect(xhr.method).toBe("POST");
		expect(xhr.url).toBe("/api/import/upload");
		const submittedFile = xhr.body?.get("file");
		expect(submittedFile).toBeInstanceOf(File);
		expect((submittedFile as File).name).toBe(file.name);
		expect((submittedFile as File).size).toBe(file.size);
		expect(onProgress).not.toHaveBeenCalled();
	});

	it("reports computable upload progress and resolves the XHR response", async () => {
		const onProgress = vi.fn();
		const file = new File([new Uint8Array([1, 2, 3])], "deck.apkg");

		vi.stubGlobal(
			"XMLHttpRequest",
			FakeXMLHttpRequest as unknown as typeof XMLHttpRequest,
		);

		const uploadPromise = uploadWithProgress(file, onProgress);
		const xhr = FakeXMLHttpRequest.latest();

		xhr.upload.dispatch("progress", {
			lengthComputable: false,
			loaded: 1,
			total: 3,
		});
		xhr.upload.dispatch("progress", {
			lengthComputable: true,
			loaded: 2,
			total: 3,
		});
		xhr.status = 200;
		xhr.responseText = JSON.stringify({
			fileId: "upload-1",
			filename: "deck.apkg",
			size: 3,
			format: "apkg",
		});
		xhr.dispatch("load");

		await expect(uploadPromise).resolves.toEqual({
			fileId: "upload-1",
			filename: "deck.apkg",
			size: 3,
			format: "apkg",
		});
		expect(onProgress).toHaveBeenCalledTimes(1);
		expect(onProgress).toHaveBeenCalledWith(2, 3);
		expect(xhr.method).toBe("POST");
		expect(xhr.url).toBe("/api/import/upload");
		const submittedFile = xhr.body?.get("file");
		expect(submittedFile).toBeInstanceOf(File);
		expect((submittedFile as File).name).toBe(file.name);
		expect((submittedFile as File).size).toBe(file.size);
	});

	it("rejects non-2xx responses with a server-provided error message", async () => {
		const file = new File([new Uint8Array([1, 2, 3])], "deck.apkg");

		vi.stubGlobal(
			"XMLHttpRequest",
			FakeXMLHttpRequest as unknown as typeof XMLHttpRequest,
		);

		const uploadPromise = uploadWithProgress(file, vi.fn());
		const xhr = FakeXMLHttpRequest.latest();
		xhr.status = 400;
		xhr.responseText = JSON.stringify({ error: "Invalid archive" });
		xhr.dispatch("load");

		await expect(uploadPromise).rejects.toThrow("Invalid archive");
	});

	it("falls back to the HTTP status when an error response is not valid JSON", async () => {
		const file = new File([new Uint8Array([1, 2, 3])], "deck.apkg");

		vi.stubGlobal(
			"XMLHttpRequest",
			FakeXMLHttpRequest as unknown as typeof XMLHttpRequest,
		);

		const uploadPromise = uploadWithProgress(file, vi.fn());
		const xhr = FakeXMLHttpRequest.latest();
		xhr.status = 500;
		xhr.responseText = "<html>bad gateway</html>";
		xhr.dispatch("load");

		await expect(uploadPromise).rejects.toThrow("Upload failed (500)");
	});

	it("rejects successful responses that do not contain valid JSON", async () => {
		const file = new File([new Uint8Array([1, 2, 3])], "deck.apkg");

		vi.stubGlobal(
			"XMLHttpRequest",
			FakeXMLHttpRequest as unknown as typeof XMLHttpRequest,
		);

		const uploadPromise = uploadWithProgress(file, vi.fn());
		const xhr = FakeXMLHttpRequest.latest();
		xhr.status = 201;
		xhr.responseText = "created";
		xhr.dispatch("load");

		await expect(uploadPromise).rejects.toThrow(
			"Invalid response from upload endpoint",
		);
	});

	it("rejects network failures", async () => {
		const file = new File([new Uint8Array([1, 2, 3])], "deck.apkg");

		vi.stubGlobal(
			"XMLHttpRequest",
			FakeXMLHttpRequest as unknown as typeof XMLHttpRequest,
		);

		const uploadPromise = uploadWithProgress(file, vi.fn());
		FakeXMLHttpRequest.latest().dispatch("error");

		await expect(uploadPromise).rejects.toThrow("Network error during upload");
	});

	it("rejects aborted uploads", async () => {
		const file = new File([new Uint8Array([1, 2, 3])], "deck.apkg");

		vi.stubGlobal(
			"XMLHttpRequest",
			FakeXMLHttpRequest as unknown as typeof XMLHttpRequest,
		);

		const uploadPromise = uploadWithProgress(file, vi.fn());
		FakeXMLHttpRequest.latest().dispatch("abort");

		await expect(uploadPromise).rejects.toThrow("Upload cancelled");
	});
});
