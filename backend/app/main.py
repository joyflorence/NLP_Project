"""FastAPI application matching frontend API contract."""

import asyncio
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

load_dotenv()

from .schemas import (
    SearchRequest,
    SearchResponse,
    SimilarityResponse,
    IngestPayload,
    IngestFromUrlPayload,
    IngestJob,
    EvaluationResponse,
    SignedDownloadRequest,
    SignedDownloadResponse,
    ResetIndexCacheResponse,
)
from . import services
from .download_tokens import get_download_path


async def _supabase_poll_loop() -> None:
    """Background task: poll Supabase academic-docs bucket every N minutes and index new files."""
    interval_min = max(1, int(os.environ.get("SUPABASE_POLL_INTERVAL_MINUTES", "5")))
    while True:
        try:
            await asyncio.get_event_loop().run_in_executor(None, services.poll_supabase_academic_docs)
        except asyncio.CancelledError:
            break
        except Exception:  # noqa: BLE001
            pass
        await asyncio.sleep(interval_min * 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: optionally preload engine; start Supabase storage poller if configured."""
    poll_task = None
    if (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")) and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        poll_task = asyncio.create_task(_supabase_poll_loop())
    try:
        yield
    finally:
        if poll_task:
            poll_task.cancel()
            try:
                await poll_task
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="Academic Semantic Search API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for frontend.  We default to allowing the typical dev ports, but
# also respect an environment variable so that deployments can whitelist their
# own origin(s) without changing code.
allow_list = os.environ.get("CORS_ALLOW_ORIGINS")
if allow_list:
    origins = [o.strip() for o in allow_list.split(",") if o.strip()]
else:
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----- Routes -----


def _is_torch_dll_error(exc: BaseException) -> bool:
    """True if this looks like the Windows PyTorch c10.dll load failure."""
    msg = str(exc).lower()
    return (
        "c10.dll" in msg
        or "winerror 1114" in msg
        or (isinstance(exc, OSError) and getattr(exc, "winerror", None) == 1114)
    )


_TORCH_FIX_HINT = (
    "Search engine failed to load (PyTorch DLL error on Windows). "
    "Try: pip uninstall torch -y && pip install torch --index-url https://download.pytorch.org/whl/cpu"
)


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
            sort_by=req.sortBy or "relevance",
            sort_order=req.sortOrder or "desc",
        )
        return SearchResponse(**result)
    except ModuleNotFoundError as e:
        # common issue: missing ML dependencies such as torch
        raise HTTPException(
            status_code=500,
            detail=f"Backend dependency missing: {e.name}. "
            "Install required packages (see backend/requirements.txt).",
        )
    except Exception as e:
        if _is_torch_dll_error(e):
            raise HTTPException(status_code=503, detail=_TORCH_FIX_HINT)
        import traceback
        traceback.print_exc()
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
            sort_by=req.sortBy or "relevance",
            sort_order=req.sortOrder or "desc",
        )
        return SearchResponse(**result)
    except ModuleNotFoundError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Backend dependency missing: {e.name}. "
            "Install required packages (see backend/requirements.txt).",
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/indexed-documents")
async def list_indexed_documents():
    """List indexed documents for admin view."""
    try:
        docs = services.get_indexed_documents()
        return {"documents": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/admin/reset-index-cache", response_model=ResetIndexCacheResponse)
async def reset_index_cache():
    """Clear local index/cache state so deleted bucket files stop appearing until re-ingested."""
    try:
        result = services.reset_index_cache()
        return ResetIndexCacheResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documents/full-text")
async def get_document_full_text(documentId: str):
    """Get full extracted text for a document (all chunks). Used by View full text + download."""
    try:
        result = services.get_document_full_text(documentId)
        return result
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Document or text not found")
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


# Separate path so it is never matched by GET /api/ingest/{job_id}
@app.post("/api/ingest-from-url", response_model=IngestJob)
async def ingest_from_url(payload: IngestFromUrlPayload):
    """Download a document from URL (e.g. Supabase Storage signed URL) and index it for search."""
    try:
        job = services.run_ingest_from_url(
            url=payload.url,
            filename=payload.filename,
            bucket_path=payload.bucketPath,
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


@app.get("/api/ping")
async def ping():
    """Simple health check used by clients to verify connectivity."""
    return {"ping": "pong"}


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


@app.api_route("/", methods=["GET", "HEAD"])
async def root():
    return {"message": "Academic Semantic Search API", "docs": "/docs"}


# ----- Optional: Serve built frontend -----
# Mount the static frontend AFTER all API routes so they take precedence.
# If FRONTEND_DIR points to a directory, FastAPI will serve the built SPA
# and return index.html for unmatched routes (html=True).
frontend_dir = os.environ.get("FRONTEND_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.isdir(frontend_dir):
    from fastapi.staticfiles import StaticFiles

    app.mount(
        "/",
        StaticFiles(directory=frontend_dir, html=True),
        name="frontend",
    )





