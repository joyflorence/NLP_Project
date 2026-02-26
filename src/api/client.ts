import { mockApi } from "@/api/mock";
import {
  EvaluationResponse,
  IngestJob,
  SearchRequest,
  SearchResponse,
  SignedDownloadResponse,
  SimilarityResponse
} from "@/types/domain";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";
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
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}

const httpApi = {
  async ingestDocuments(payload: { sourcePath?: string; files?: string[] }) {
    return request<IngestJob>("/ingest", {
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

  async getEvaluation() {
    return request<EvaluationResponse>("/evaluation");
  },

  async getSignedDownloadUrl(documentId: string) {
    return request<SignedDownloadResponse>("/documents/signed-download", {
      method: "POST",
      body: JSON.stringify({ documentId })
    });
  }
};

export const api = USE_MOCK_API ? mockApi : httpApi;
