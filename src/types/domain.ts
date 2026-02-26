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

export type IngestJob = {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  processedCount?: number;
  totalCount?: number;
  message?: string;
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
