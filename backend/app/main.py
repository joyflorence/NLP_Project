"""FastAPI application matching frontend API contract."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .schemas import (
    SearchRequest,
    SearchResponse,
    SimilarityResponse,
    IngestPayload,
    IngestJob,
    EvaluationResponse,
    SignedDownloadRequest,
    SignedDownloadResponse,
)
from . import services
from .download_tokens import get_download_path


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: optionally preload engine."""
    yield
    # Shutdown: nothing to clean up


app = FastAPI(
    title="Academic Semantic Search API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for frontend (Vite dev server on 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----- Routes -----


@app.post("/api/search/semantic", response_model=SearchResponse)
async def search_semantic(req: SearchRequest):
    """Semantic search."""
    try:
        filters = req.filters.model_dump(exclude_none=True) if req.filters else None
        result = services.semantic_search(
            query=req.query,
            top_k=req.topK,
            filters=filters,
            page=req.page or 1,
            page_size=req.pageSize or 5,
        )
        return SearchResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search/keyword", response_model=SearchResponse)
async def search_keyword(req: SearchRequest):
    """Keyword search baseline."""
    try:
        filters = req.filters.model_dump(exclude_none=True) if req.filters else None
        result = services.keyword_search(
            query=req.query,
            top_k=req.topK,
            filters=filters,
            page=req.page or 1,
            page_size=req.pageSize or 5,
        )
        return SearchResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/documents/{document_id}/similar", response_model=SimilarityResponse)
async def get_similar(document_id: str, topK: int = 5):
    """Get similar documents."""
    try:
        result = services.get_similar_documents(document_id=document_id, top_k=topK)
        return SimilarityResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ingest", response_model=IngestJob)
async def ingest_documents(payload: IngestPayload):
    """Trigger document ingestion."""
    try:
        job = services.run_ingest(
            source_path=payload.sourcePath,
            files=payload.files,
        )
        return IngestJob(**job)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ingest/{job_id}", response_model=IngestJob)
async def get_ingest_job(job_id: str):
    """Get ingest job status."""
    job = services.get_ingest_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return IngestJob(**job)


@app.get("/api/evaluation", response_model=EvaluationResponse)
async def get_evaluation():
    """Get evaluation metrics."""
    try:
        result = services.get_evaluation()
        return EvaluationResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/documents/signed-download", response_model=SignedDownloadResponse)
async def get_signed_download(req: SignedDownloadRequest, request: Request):
    """Get a signed download URL for a document."""
    try:
        base = str(request.base_url).rstrip("/")
        result = services.get_signed_download_url(
            document_id=req.documentId,
            base_url=base,
        )
        return SignedDownloadResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/documents/{document_id}/file")
async def serve_document_file(document_id: str, token: str):
    """Serve document file with token validation."""
    path = get_download_path(token)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Invalid or expired download link")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=path.name,
    )


@app.get("/api/status")
async def get_status():
    """Engine status."""
    try:
        engine = services._get_engine()
        stats = engine.get_stats()
        return {
            "initialized": engine.initialized,
            "total_chunks": stats.get("total_chunks", 0),
            "total_documents": stats.get("total_documents", 0),
        }
    except Exception as e:
        return {
            "initialized": False,
            "total_chunks": 0,
            "total_documents": 0,
            "error": str(e),
        }


@app.get("/")
async def root():
    return {"message": "Academic Semantic Search API", "docs": "/docs"}
