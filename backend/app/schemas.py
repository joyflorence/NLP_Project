"""Pydantic schemas matching frontend domain types."""

from typing import Optional, List, Literal
from pydantic import BaseModel, Field


class SearchFilters(BaseModel):
    level: Optional[Literal["undergraduate", "postgrad"]] = None
    year: Optional[int] = None
    department: Optional[str] = None
    supervisor: Optional[str] = None


class SearchRequest(BaseModel):
    query: str
    topK: int = 10
    filters: Optional[SearchFilters] = None
    sortBy: Optional[Literal["relevance", "year", "title"]] = "relevance"
    sortOrder: Optional[Literal["asc", "desc"]] = "desc"
    page: Optional[int] = 1
    pageSize: Optional[int] = 5


class DocumentRecord(BaseModel):
    id: str
    title: str
    author: Optional[str] = None
    supervisor: Optional[str] = None
    year: Optional[int] = None
    level: Optional[Literal["undergraduate", "postgrad"]] = None
    downloadUrl: Optional[str] = None
    abstract: Optional[str] = None
    sourceType: Optional[Literal["pdf", "text"]] = None
    department: Optional[str] = None
    keywords: Optional[List[str]] = None
    score: Optional[float] = None


class SearchResponse(BaseModel):
    query: str
    topK: int
    semanticResults: List[DocumentRecord]
    keywordResults: Optional[List[DocumentRecord]] = None
    total: Optional[int] = None
    page: Optional[int] = None
    pageSize: Optional[int] = None
    latencyMs: Optional[dict] = None


class SimilarityResponse(BaseModel):
    documentId: str
    related: List[DocumentRecord]


class IngestPayload(BaseModel):
    sourcePath: Optional[str] = None
    files: Optional[List[str]] = None


class IngestFromUrlPayload(BaseModel):
    """Trigger ingestion by downloading a document from a URL (e.g. Supabase signed URL)."""
    url: str
    filename: Optional[str] = None  # e.g. "document.pdf"; derived from URL if not set
    bucketPath: Optional[str] = None  # storage path e.g. "user-id/123-file.pdf"; if set, marked indexed so poller skips


class IngestJob(BaseModel):
    jobId: str
    status: Literal["queued", "processing", "completed", "failed", "duplicate"]
    processedCount: Optional[int] = None
    totalCount: Optional[int] = None
    message: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    year: Optional[int] = None


class EvaluationMetrics(BaseModel):
    metricName: str
    semantic: float
    keyword: float


class EvaluationResponse(BaseModel):
    metrics: List[EvaluationMetrics]
    note: Optional[str] = None


class SignedDownloadRequest(BaseModel):
    documentId: str


class SignedDownloadResponse(BaseModel):
    documentId: str
    signedUrl: str
    expiresIn: Optional[int] = None
