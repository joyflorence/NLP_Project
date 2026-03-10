import { mockApi } from "@/api/mock";
import {
  IngestJob,
  SearchRequest,
  SearchResponse,
  SignedDownloadResponse,
  SimilarityResponse
} from "@/types/domain";

// When developing we often run frontend on a separate port from the backend, but in
// production the two can share the same origin.  Allow the base URL to be configured
// via environment variables and fall back to a relative "/api" path to avoid the
// frontend hard‑coding `localhost:8000`.
let API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  // if no explicit URL is provided use a relative path so that the app will work
  // regardless of host/port when served from the same server.
  "/api";
// guarantee that API_BASE ends with "/api" (not "/api/") so callers can
// append paths consistently; this shields us from misconfigured environment
// variables.
if (!API_BASE.endsWith("/api")) {
  API_BASE = API_BASE.replace(/\/+$/, ""); // strip trailing slashes
  API_BASE = API_BASE + "/api";
}
const AUTH_TOKEN_KEY = import.meta.env.VITE_AUTH_TOKEN_KEY ?? "access_token";
const STATIC_API_KEY = import.meta.env.VITE_API_KEY;
const USE_MOCK_API = (import.meta.env.VITE_USE_MOCK_API ?? "true") === "true";

let sessionToken: string | null = null;

function getAuthToken() {
  if (sessionToken) return sessionToken;
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  sessionToken = token;
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(STATIC_API_KEY ? { "X-API-Key": STATIC_API_KEY } : {}),
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      // ignore if body is not JSON
    }
    const msg = detail
      ? `API request failed: ${res.status} ${res.statusText}. ${detail}`
      : `API request failed: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

const httpApi = {
  async ping() {
    // simple check to verify that the backend is reachable
    return request<{ ping: string }>("/ping");
  },

  async ingestDocuments(payload: { sourcePath?: string; files?: string[] }) {
    return request<IngestJob>("/ingest", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  async ingestFromUrl(payload: { url: string; filename?: string; bucketPath?: string }) {
    return request<IngestJob>("/ingest-from-url", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  async getIngestJob(jobId: string) {
    return request<IngestJob>(`/ingest/${jobId}`);
  },

  async semanticSearch(payload: SearchRequest) {
    return request<SearchResponse>("/search/semantic", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  async keywordSearch(payload: SearchRequest) {
    return request<SearchResponse>("/search/keyword", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  async getSimilarDocuments(documentId: string, topK = 5) {
    return request<SimilarityResponse>(`/documents/${documentId}/similar?topK=${topK}`);
  },

  async getSignedDownloadUrl(documentId: string) {
    return request<SignedDownloadResponse>("/documents/signed-download", {
      method: "POST",
      body: JSON.stringify({ documentId })
    });
  },

  async getDocumentFullText(documentId: string) {
    return request<{ fullText: string; title: string; documentId: string }>(
      `/documents/full-text?documentId=${encodeURIComponent(documentId)}`
    );
  },

  async getStatus() {
    return request<{
      initialized: boolean;
      total_chunks: number;
      total_documents: number;
      error?: string;
    }>("/status");
  },

  async getIndexedDocuments() {
    return request<{ documents: Array<{ filename: string; pages?: number; chunks?: number }> }>(
      "/indexed-documents"
    );
  }
};

export const api = USE_MOCK_API ? mockApi : httpApi;
