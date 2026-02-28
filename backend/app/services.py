"""Service layer: glue between API and semantic engine."""

import os
import sys
import json
import time
import uuid
import importlib.util
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_NLP_DATA = _PROJECT_ROOT / "University-Semantic-Search-System" / "NLP-Pipeline" / "NLP Data"

logger = logging.getLogger(__name__)

# Lazy-loaded engine
_engine = None
_ingest_jobs: Dict[str, dict] = {}


def _get_engine():
    global _engine
    if _engine is None:
        # Ensure NLP Data backend is on path for app.config (semantic_engine imports "from app.config")
        _backend_path = str(_NLP_DATA / "backend")
        if _backend_path not in sys.path:
            sys.path.insert(0, _backend_path)
        # Load semantic engine from NLP Data
        engine_path = _NLP_DATA / "backend" / "app" / "semantic_engine.py"
        if not engine_path.exists():
            raise FileNotFoundError(f"Semantic engine not found at {engine_path}")
        spec = importlib.util.spec_from_file_location("_semantic_engine", engine_path)
        mod = importlib.util.module_from_spec(spec)
        sys.modules["_semantic_engine"] = mod
        spec.loader.exec_module(mod)
        SemanticSearchEngine = mod.SemanticSearchEngine
        _engine = SemanticSearchEngine(use_faiss=True)
        if not _engine.initialize():
            logger.warning("Semantic engine failed to initialize; search may return empty results")
    return _engine


def _backend_to_document(r: dict, doc_id: Optional[str] = None) -> dict:
    """Convert backend result to frontend DocumentRecord."""
    filename = r.get("filename", "")
    fid = doc_id or filename or r.get("id", "")
    title = Path(filename).stem.replace("_", " ").replace("-", " ") if filename else str(fid)
    return {
        "id": fid,
        "title": title,
        "author": None,
        "supervisor": None,
        "year": None,
        "level": None,
        "downloadUrl": None,
        "abstract": r.get("preview") or r.get("text_preview", ""),
        "sourceType": "pdf",
        "department": None,
        "keywords": None,
        "score": r.get("score"),
    }


def _load_document_metadata() -> Dict[str, dict]:
    """Load document registry for extra metadata (title, author, etc.)."""
    try:
        engine = _get_engine()
        cache_dir = getattr(engine.config, "cache_dir", None)
        if not cache_dir:
            return {}
        reg_path = Path(cache_dir) / "documents.json"
        if not reg_path.exists():
            return {}
        with open(reg_path, "r") as f:
            docs = json.load(f)
        return {d.get("filename", ""): d for d in docs if isinstance(d, dict)}
    except Exception as e:
        logger.warning(f"Could not load document registry: {e}")
        return {}


def semantic_search(
    query: str,
    top_k: int = 10,
    filters: Optional[dict] = None,
    page: int = 1,
    page_size: int = 5,
) -> dict:
    """Run semantic search and return frontend-compatible response."""
    start = time.perf_counter()
    engine = _get_engine()
    filter_dict = None
    if filters and filters.get("filename"):
        filter_dict = {"filename": {"$eq": filters["filename"]}}

    result = engine.search(query=query, top_k=top_k * 2, filter_dict=filter_dict)
    latency_ms = int((time.perf_counter() - start) * 1000)

    if not result.get("success"):
        return {
            "query": query,
            "topK": top_k,
            "semanticResults": [],
            "total": 0,
            "page": page,
            "pageSize": page_size,
            "latencyMs": {"semantic": latency_ms},
        }

    results = result.get("results", [])
    meta = _load_document_metadata()

    docs = []
    for r in results:
        d = _backend_to_document(r)
        fn = r.get("filename", "")
        if fn and fn in meta:
            m = meta[fn]
            if m.get("title"):
                d["title"] = m["title"]
        docs.append(d)

    # Paginate
    total = len(docs)
    start_idx = (page - 1) * page_size
    paged = docs[start_idx : start_idx + page_size]

    return {
        "query": query,
        "topK": top_k,
        "semanticResults": paged,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "latencyMs": {"semantic": latency_ms},
    }


def keyword_search(
    query: str,
    top_k: int = 10,
    filters: Optional[dict] = None,
    page: int = 1,
    page_size: int = 5,
) -> dict:
    """Simple keyword search over cached chunks (TF-IDF style)."""
    start = time.perf_counter()
    engine = _get_engine()
    chunks = engine.get_all_cached_chunks()
    latency_ms = int((time.perf_counter() - start) * 1000)

    if not chunks or not query.strip():
        return {
            "query": query,
            "topK": top_k,
            "semanticResults": [],
            "keywordResults": [],
            "total": 0,
            "page": page,
            "pageSize": page_size,
            "latencyMs": {"keyword": latency_ms},
        }

    q_terms = set(query.lower().split())
    scored = []
    for c in chunks:
        text = (c.get("text", "") or "").lower()
        hits = sum(1 for t in q_terms if t in text)
        if hits > 0:
            score = hits / max(len(q_terms), 1)
            scored.append({
                "filename": c.get("filename", ""),
                "score": min(0.95, 0.3 + score * 0.5),
                "preview": (c.get("text", "") or "")[:200] + ("..." if len(c.get("text", "")) > 200 else ""),
                "text_preview": (c.get("text", "") or "")[:200],
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    scored = scored[: top_k * 2]

    meta = _load_document_metadata()
    docs = [_backend_to_document(r) for r in scored]

    total = len(docs)
    start_idx = (page - 1) * page_size
    paged = docs[start_idx : start_idx + page_size]

    return {
        "query": query,
        "topK": top_k,
        "semanticResults": paged,
        "keywordResults": paged,
        "total": total,
        "page": page,
        "pageSize": page_size,
        "latencyMs": {"keyword": latency_ms},
    }


def get_similar_documents(document_id: str, top_k: int = 5) -> dict:
    """Get similar documents by document id (filename)."""
    engine = _get_engine()
    result = engine.get_similar_documents(filename=document_id, top_k=top_k)

    if not result.get("success"):
        return {"documentId": document_id, "related": []}

    results = result.get("results", [])
    related = [_backend_to_document(r) for r in results]
    return {"documentId": document_id, "related": related}


def run_ingest(source_path: Optional[str] = None, files: Optional[List[str]] = None) -> dict:
    """Run document ingestion. Returns job dict."""
    job_id = str(uuid.uuid4())
    _ingest_jobs[job_id] = {
        "jobId": job_id,
        "status": "processing",
        "processedCount": 0,
        "totalCount": 0,
        "message": "Starting ingestion...",
    }

    try:
        engine = _get_engine()
        filepaths = []

        if source_path and os.path.isdir(source_path):
            for f in Path(source_path).rglob("*.pdf"):
                filepaths.append(str(f))
        elif source_path and os.path.isfile(source_path):
            filepaths = [source_path]

        if files:
            base = Path(engine.config.local_data_dir) / "raw_pdfs"
            for f in files:
                p = base / f if not os.path.isabs(f) else Path(f)
                if p.exists():
                    filepaths.append(str(p))

        if not filepaths:
            # Fallback: use raw_pdfs dir
            raw = Path(engine.config.local_data_dir) / "raw_pdfs"
            if raw.exists():
                filepaths = [str(p) for p in raw.rglob("*.pdf")]

        if not filepaths:
            _ingest_jobs[job_id] = {
                "jobId": job_id,
                "status": "failed",
                "processedCount": 0,
                "totalCount": 0,
                "message": "No PDF files found to ingest.",
            }
            return _ingest_jobs[job_id]

        result = engine.index_documents(filepaths)
        processed = result.get("processed", 0)
        total_chunks = result.get("total_chunks", 0)

        _ingest_jobs[job_id] = {
            "jobId": job_id,
            "status": "completed" if result.get("success") else "failed",
            "processedCount": processed,
            "totalCount": len(filepaths),
            "message": result.get("message") or f"Processed {processed} documents, {total_chunks} chunks.",
        }
    except Exception as e:
        logger.exception("Ingest failed")
        _ingest_jobs[job_id] = {
            "jobId": job_id,
            "status": "failed",
            "processedCount": 0,
            "totalCount": 0,
            "message": str(e),
        }

    return _ingest_jobs[job_id]


def get_ingest_job(job_id: str) -> Optional[dict]:
    return _ingest_jobs.get(job_id)


def get_evaluation() -> dict:
    """Return evaluation metrics. Uses stored report or stub."""
    try:
        engine = _get_engine()
        reports_dir = getattr(engine.config, "artifacts_reports_dir", None) or Path(
            getattr(engine.config, "artifacts_dir", "."), "reports"
        )
        summary_path = Path(reports_dir) / "pipeline_summary.md"
        if summary_path.exists():
            # Parse or return placeholder from pipeline
            pass

        # Check for evaluation report
        eval_path = Path(reports_dir) / "evaluation_metrics.json"
        if eval_path.exists():
            with open(eval_path, "r") as f:
                data = json.load(f)
                return {
                    "metrics": data.get("metrics", []),
                    "note": data.get("note", "From pipeline evaluation."),
                }
    except Exception as e:
        logger.warning(f"Could not load evaluation: {e}")

    # Stub when no evaluation exists
    return {
        "metrics": [
            {"metricName": "Precision@5", "semantic": 0.0, "keyword": 0.0},
            {"metricName": "Recall@5", "semantic": 0.0, "keyword": 0.0},
            {"metricName": "nDCG@10", "semantic": 0.0, "keyword": 0.0},
            {"metricName": "MRR", "semantic": 0.0, "keyword": 0.0},
        ],
        "note": "Run the NLP pipeline to generate evaluation metrics.",
    }


def get_signed_download_url(document_id: str, base_url: str = "http://localhost:8000") -> dict:
    """Generate a download URL for a document. Uses local file serving with token."""
    from .download_tokens import add_download_token

    engine = _get_engine()
    cache_dir = Path(getattr(engine.config, "cache_dir", "."))
    raw_pdfs = Path(getattr(engine.config, "local_data_dir", ".")) / "raw_pdfs"

    # Resolve document path: id can be filename or doc_id
    candidates = [
        raw_pdfs / document_id,
        raw_pdfs / f"{document_id}.pdf",
        cache_dir / document_id,
        cache_dir / f"{document_id}.pdf",
    ]
    for p in candidates:
        if p.exists() and p.is_file():
            token = add_download_token(document_id, str(p))
            url = f"{base_url}/api/documents/{document_id}/file?token={token}"
            return {
                "documentId": document_id,
                "signedUrl": url,
                "expiresIn": 300,
            }

    # Check documents.json for file_path
    reg_path = cache_dir / "documents.json"
    if reg_path.exists():
        with open(reg_path, "r") as f:
            docs = json.load(f)
        for d in docs:
            fn = d.get("filename", "")
            if fn == document_id or fn.replace(".pdf", "") == document_id:
                p = raw_pdfs / fn
                if p.exists():
                    token = add_download_token(document_id, str(p))
                    url = f"{base_url}/api/documents/{document_id}/file?token={token}"
                    return {
                        "documentId": document_id,
                        "signedUrl": url,
                        "expiresIn": 300,
                    }

    raise FileNotFoundError(f"Document not found: {document_id}")
