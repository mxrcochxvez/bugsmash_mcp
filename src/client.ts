/**
 * Centralized BugSmash HTTP client.
 *
 * The API key is read once from BUGSMASH_API_KEY and attached only here.
 * Never log, echo, or return the key (or request headers that contain it).
 */

export const BUGSMASH_BASE_URL = "https://api.bugsmash.io/api/v2";

export class BugSmashApiError extends Error {
  readonly statusCode: number;
  readonly body: unknown;

  constructor(statusCode: number, message: string, body: unknown) {
    super(message);
    this.name = "BugSmashApiError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

function getApiKey(): string {
  const key = process.env.BUGSMASH_API_KEY;
  if (!key || key.trim() === "") {
    throw new Error("BUGSMASH_API_KEY is not set");
  }
  return key;
}

/** Call at process start so missing credentials fail before tools run. */
export function assertApiKeyConfigured(): void {
  getApiKey();
}

function sanitizeErrorMessage(message: string): string {
  // Defense in depth: never leak env-shaped secrets if a library embeds them.
  return message.replace(/BUGSMASH_API_KEY\s*=\s*\S+/gi, "BUGSMASH_API_KEY=[redacted]");
}

export type BugSmashRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON body (Content-Type: application/json). */
  body?: unknown;
};

/**
 * Single place that attaches X-API-Key. All outbound BugSmash calls go through here.
 */
export async function bugsmashRequest<T = unknown>(
  options: BugSmashRequestOptions,
): Promise<T> {
  const apiKey = getApiKey();
  const method = options.method ?? "GET";

  const url = new URL(
    options.path.startsWith("/") ? options.path.slice(1) : options.path,
    `${BUGSMASH_BASE_URL}/`,
  );

  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    Accept: "application/json",
  };

  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
    });
  } catch (err) {
    const raw =
      err instanceof Error ? err.message : "Network request to BugSmash failed";
    throw new Error(sanitizeErrorMessage(raw));
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const apiMessage =
      parsed &&
      typeof parsed === "object" &&
      parsed !== null &&
      "message" in parsed &&
      typeof (parsed as { message: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : typeof parsed === "string"
          ? parsed
          : response.statusText || "Request failed";

    throw new BugSmashApiError(
      response.status,
      `BugSmash API error ${response.status}: ${sanitizeErrorMessage(apiMessage)}`,
      parsed,
    );
  }

  return parsed as T;
}
