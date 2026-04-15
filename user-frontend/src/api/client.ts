import { mockApi } from "@/api/mock";
import {
  FullTextResponse,
  SearchRequest,
  SearchResponse,
  SavedDocument,
  SignedDownloadResponse,
  SimilarityResponse
} from "@/types/domain";

let API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  "/api";
if (!API_BASE.endsWith("/api")) {
  API_BASE = API_BASE.replace(/\/+$/, "");
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
    return request<{ ping: string }>("/ping");
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
    return request<FullTextResponse>(`/documents/full-text?documentId=${encodeURIComponent(documentId)}`);
  },



  async getSavedDocuments() {
    return request<{ documents: SavedDocument[] }>("/library");
  },

  async saveDocumentToLibrary(documentId: string, note?: string) {
    return request<{success: boolean; message: string}>("/library", {
      method: "POST",
      body: JSON.stringify({ documentId, ...(note ? { note } : {}) })
    });
  },

  async removeDocumentFromLibrary(documentId: string) {
    return request<{success: boolean; message: string}>(`/library/${documentId}`, {
      method: "DELETE"
    });
  }
};

export const api = USE_MOCK_API ? mockApi : httpApi;
