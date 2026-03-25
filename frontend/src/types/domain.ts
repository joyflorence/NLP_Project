export type DocumentRecord = {
  id: string;
  title: string;
  author?: string;
  supervisor?: string;
  year?: number;
  level?: "undergraduate" | "postgrad";
  downloadUrl?: string;
  abstract?: string;
  sourceType?: "pdf" | "text";
  department?: string;
  keywords?: string[];
  score?: number;
};

export type SearchFilters = {
  level?: "undergraduate" | "postgrad";
  year?: number;
  department?: string;
  supervisor?: string;
};

export type SearchSortBy = "relevance" | "year" | "title";
export type SearchSortOrder = "asc" | "desc";

export type SearchRequest = {
  query: string;
  topK: number;
  filters?: SearchFilters;
  sortBy?: SearchSortBy;
  sortOrder?: SearchSortOrder;
  page?: number;
  pageSize?: number;
};

export type SearchResponse = {
  query: string;
  topK: number;
  semanticResults: DocumentRecord[];
  keywordResults?: DocumentRecord[];
  total?: number;
  page?: number;
  pageSize?: number;
  latencyMs?: {
    semantic?: number;
    keyword?: number;
  };
};

export type SimilarityResponse = {
  documentId: string;
  related: DocumentRecord[];
};

export type SignedDownloadResponse = {
  documentId: string;
  signedUrl: string;
  expiresIn?: number;
};

export type SavedDocument = DocumentRecord & {
  documentId: string;
  savedAt?: string;
  note?: string;
};

export type IngestJob = {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed" | "duplicate";
  processedCount?: number;
  totalCount?: number;
  message?: string;
  title?: string | null;
  author?: string | null;
  year?: number | null;
  abstract?: string | null;
};

export type EvaluationMetrics = {
  metricName: string;
  semantic: number;
  keyword: number;
};

export type EvaluationResponse = {
  metrics: EvaluationMetrics[];
  note?: string;
};


export type FullTextResponse = {
  fullText: string;
  title: string;
  author?: string | null;
  year?: number | null;
  documentId: string;
};

export type AdminDocument = {
  id: string;
  title: string;
  author?: string | null;
  supervisor?: string | null;
  year?: number | null;
  level?: "undergraduate" | "postgrad" | null;
  department?: string | null;
  abstract?: string | null;
  file_path?: string | null;
  created_at?: string | null;
  indexed: boolean;
  pages?: number | null;
  chunks?: number | null;
};

export type AdminDocumentUpdateRequest = {
  title?: string;
  author?: string;
  supervisor?: string;
  year?: number;
  level?: "undergraduate" | "postgrad";
  department?: string;
  abstract?: string;
};

export type AdminActionResponse = {
  success: boolean;
  message: string;
};

export type AdminIngestJobSummary = {
  jobId: string;
  status: string;
  message?: string;
  title?: string | null;
  author?: string | null;
  year?: number | null;
  processedCount?: number;
  totalCount?: number;
};
