import { Platform } from "react-native";
import Constants from "expo-constants";

const DEFAULT_PORT = "4000";
const REQUEST_TIMEOUT_MS = 15000;
const HARDCODED_API_BASE_URL = "http://10.87.36.38:4000/api";

function normalizeApiBaseUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim().replace(/\/+$/, "");
  if (trimmed.toLowerCase().endsWith("/api")) {
    return trimmed;
  }

  return `${trimmed}/api`;
}

function extractHostFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

function getExpoDevHost(): string | null {
  const fromHostUri = Constants.expoConfig?.hostUri;
  if (typeof fromHostUri === "string" && fromHostUri.length > 0) {
    return fromHostUri.split(":")[0] ?? null;
  }

  const fromDebugUrl = (
    Constants as { expoGoConfig?: { debuggerHost?: string } }
  ).expoGoConfig?.debuggerHost;
  if (typeof fromDebugUrl === "string" && fromDebugUrl.length > 0) {
    return fromDebugUrl.split(":")[0] ?? null;
  }

  const fromUri =
    (Constants as { linkingUri?: string | null }).linkingUri ?? null;
  if (typeof fromUri === "string" && fromUri.length > 0) {
    return extractHostFromUrl(fromUri);
  }

  return null;
}

function resolveBaseUrl(): string {
  const configured =
    process.env.EXPO_PUBLIC_API_BASE_URL || HARDCODED_API_BASE_URL;
  if (configured && configured.trim().length > 0) {
    return normalizeApiBaseUrl(configured);
  }

  const configuredHost = process.env.EXPO_PUBLIC_API_HOST;
  if (configuredHost && configuredHost.trim().length > 0) {
    const configuredPort = process.env.EXPO_PUBLIC_API_PORT ?? DEFAULT_PORT;
    return `http://${configuredHost.trim()}:${configuredPort.trim()}/api`;
  }

  const expoDevHost = getExpoDevHost();
  if (
    expoDevHost &&
    expoDevHost !== "localhost" &&
    expoDevHost !== "127.0.0.1"
  ) {
    return `http://${expoDevHost}:${DEFAULT_PORT}/api`;
  }

  const host = Platform.OS === "android" ? "10.0.2.2" : "localhost";
  return `http://${host}:${DEFAULT_PORT}/api`;
}

const RESOLVED_API_BASE_URL = resolveBaseUrl();

console.log(`[API] Base URL resolved to ${RESOLVED_API_BASE_URL}`);

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<TResponse>(
  path: string,
  options: RequestInit = {},
): Promise<TResponse> {
  const baseUrl = RESOLVED_API_BASE_URL;
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    timeoutController.abort();
  }, REQUEST_TIMEOUT_MS);

  const signal = options.signal ?? timeoutController.signal;

  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      signal,
      ...options,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`, 408);
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok) {
    let message = `API request failed (${response.status})`;

    try {
      const errorBody = (await response.json()) as {
        error?: string;
        message?: string;
      };
      message = errorBody.error ?? errorBody.message ?? message;
    } catch {
      // Ignore parse failures and keep default error message.
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

export function getApiBaseUrl(): string {
  return RESOLVED_API_BASE_URL;
}
