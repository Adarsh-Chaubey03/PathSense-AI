import { Platform } from "react-native";

const DEFAULT_PORT = "4000";
const REQUEST_TIMEOUT_MS = 15000;

function resolveBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configured && configured.trim().length > 0) {
    return configured.replace(/\/+$/, "");
  }

  const host = Platform.OS === "android" ? "10.0.2.2" : "localhost";
  return `http://${host}:${DEFAULT_PORT}/api`;
}

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
  const baseUrl = resolveBaseUrl();
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
  return resolveBaseUrl();
}
