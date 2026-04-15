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
  matchSnippet?: string;
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


