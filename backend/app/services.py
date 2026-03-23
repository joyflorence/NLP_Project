"""Service layer: glue between API and semantic engine."""

import hashlib
import os
import sys
import json
import time
import uuid
import importlib.util
import logging
import threading
from pathlib import Path
from typing import Optional, List, Dict, Any, Set

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_NLP_DATA = _PROJECT_ROOT / "University-Semantic-Search-System" / "NLP-Pipeline" / "NLP Data"
_BACKEND_DATA = _PROJECT_ROOT / "backend" / "data"
_SUPABASE_INDEXED_PATH_FILE = _BACKEND_DATA / "supabase_indexed_paths.json"
_CONTENT_HASHES_FILE = _BACKEND_DATA / "indexed_content_hashes.json"

logger = logging.getLogger(__name__)

# Lazy-loaded engine
_engine = None
_ingest_jobs: Dict[str, dict] = {}
# Polling: set of bucket object paths we have already indexed (persisted to disk)
_supabase_indexed_paths: Set[str] = set()
_supabase_indexed_lock = threading.Lock()
# Content-based duplicate detection: SHA-256 hashes of indexed document contents
_indexed_content_hashes: Set[str] = set()
_content_hashes_lock = threading.Lock()


def _filter_and_sort_documents(
    docs: List[dict],
    filters: Optional[dict],
    sort_by: str,
    sort_order: str,
) -> List[dict]:
    """Apply SearchFilters (year, level, department, supervisor) and sorting."""
    if filters:
        year = filters.get("year")
        level = filters.get("level")
        department = filters.get("department")
        supervisor = filters.get("supervisor")

        def _matches(d: dict) -> bool:
            if year is not None and d.get("year") != year:
                return False
            if level is not None and d.get("level") != level:
                return False
            if department is not None and (d.get("department") or "").strip() != str(department).strip():
                return False
            if supervisor is not None and (d.get("supervisor") or "").strip() != str(supervisor).strip():
                return False
            return True

        docs = [d for d in docs if _matches(d)]

    sort_by = (sort_by or "relevance").lower()
    sort_order = (sort_order or "desc").lower()
    reverse = sort_order != "asc"

    if sort_by == "year":
        docs.sort(key=lambda x: (x.get("year") or 0, x.get("score") or 0), reverse=reverse)
    elif sort_by == "title":
        docs.sort(
            key=lambda x: ((x.get("title") or "") or "").lower() or "",
            reverse=reverse,
        )
    else:
        # Default: relevance (score)
        docs.sort(key=lambda x: (x.get("score") or 0), reverse=reverse)

    return docs


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
        try:
            spec = importlib.util.spec_from_file_location("_semantic_engine", engine_path)
            mod = importlib.util.module_from_spec(spec)
            sys.modules["_semantic_engine"] = mod
            spec.loader.exec_module(mod)
            SemanticSearchEngine = mod.SemanticSearchEngine
        except ModuleNotFoundError as e:
            # provide a clearer message so that missing dependencies like torch
            # are reflected in the API error rather than a generic 500.
            missing = e.name
            logger.error(f"Failed to import semantic engine dependency: {missing}")
            raise
        except Exception:
            logger.exception("Unexpected error loading semantic engine")
            raise

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


def get_indexed_documents() -> List[Dict[str, Any]]:
    """Return list of indexed documents (filename, pages, chunks) from engine registry."""
    try:
        engine = _get_engine()
        docs = engine.get_documents()
        return list(docs) if isinstance(docs, list) else []
    except Exception as e:
        logger.warning(f"Could not load indexed documents: {e}")
        return []


def reset_index_cache() -> dict:
    """Clear local engine cache, raw PDFs, and persisted Supabase indexing state."""
    engine = _get_engine()
    cache_dir = Path(getattr(engine.config, "cache_dir", "."))
    raw_pdfs = Path(getattr(engine.config, "local_data_dir", ".")) / "raw_pdfs"

    cleared = engine.clear_index()
    removed_cache_files = 0
    removed_raw_pdfs = 0

    # Clear any leftover cache artifacts after engine reset.
    if cache_dir.exists() and cache_dir.is_dir():
        for path in cache_dir.iterdir():
            if path.is_file():
                try:
                    path.unlink()
                    removed_cache_files += 1
                except Exception:
                    pass

    if raw_pdfs.exists() and raw_pdfs.is_dir():
        for path in raw_pdfs.iterdir():
            if path.is_file():
                try:
                    path.unlink()
                    removed_raw_pdfs += 1
                except Exception:
                    pass

    for state_file in (_SUPABASE_INDEXED_PATH_FILE, _CONTENT_HASHES_FILE):
        if state_file.exists():
            try:
                state_file.unlink()
            except Exception:
                pass

    global _supabase_indexed_paths, _indexed_content_hashes, _ingest_jobs
    _supabase_indexed_paths = set()
    _indexed_content_hashes = set()
    _ingest_jobs = {}

    return {
        "cleared": bool(cleared),
        "removed_cache_files": removed_cache_files,
        "removed_raw_pdfs": removed_raw_pdfs,
        "message": "Local search index cache cleared. Re-upload documents or let the poller ingest current bucket files again.",
    }

def _load_supabase_document_metadata() -> Dict[str, dict]:
    """Load document metadata from Supabase documents table. Key = filename (basename of file_path).
    Also keys by stem (no timestamp) and by backend-normalized name so engine filename matches."""
    import re
    from dotenv import load_dotenv
    load_dotenv()
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return {}
    try:
        from supabase import create_client
        client = create_client(url, key)
        resp = client.table("documents").select("file_path, title, author, supervisor, year, level, department, abstract").execute()
        rows = (resp.data or []) if hasattr(resp, "data") else []
        out: Dict[str, dict] = {}
        for row in rows if isinstance(rows, list) else []:
            fp = row.get("file_path")
            if not fp:
                continue
            filename = fp.split("/")[-1] if "/" in str(fp) else str(fp)
            if not filename:
                continue
            meta_entry = {
                "title": row.get("title"),
                "author": row.get("author"),
                "supervisor": row.get("supervisor"),
                "year": row.get("year"),
                "level": row.get("level"),
                "department": row.get("department"),
                "abstract": row.get("abstract"),
            }
            out[filename] = meta_entry
            # Stem: name without "timestamp-" prefix so engine filename matches
            stem = filename.split("-", 1)[-1] if "-" in filename else filename
            if stem:
                out[stem] = meta_entry
            # Backend ingest sanitizes with re.sub(r"[^\w.\-]", "_", ...); key by that so engine id matches
            normalized = re.sub(r"[^\w.\-]", "_", stem) if stem else ""
            if normalized:
                out[normalized] = meta_entry
        return out
    except Exception as e:
        logger.debug("Supabase document metadata not loaded: %s", e)
        return {}


def _apply_supabase_metadata(docs: List[dict], meta: Dict[str, dict]) -> None:
    """Merge author, supervisor, year, level, department (and title/abstract if present) from meta into docs in place."""
    import re
    for d in docs:
        doc_id = (d.get("id") or "").strip()
        if not doc_id:
            continue
        m = meta.get(doc_id) or meta.get(Path(doc_id).name) or meta.get(re.sub(r"[^\w.\-]", "_", doc_id))
        if not m:
            continue
        if m.get("author") is not None and str(m["author"]).strip():
            d["author"] = str(m["author"]).strip()
        if m.get("supervisor") is not None and str(m["supervisor"]).strip():
            d["supervisor"] = str(m["supervisor"]).strip()
        if m.get("year") is not None:
            try:
                d["year"] = int(m["year"])
            except (TypeError, ValueError):
                pass
        if m.get("level") is not None and str(m["level"]).strip():
            d["level"] = str(m["level"]).strip() if m["level"] in ("undergraduate", "postgrad") else None
        if m.get("department") is not None and str(m["department"]).strip():
            d["department"] = str(m["department"]).strip()
        if m.get("title") is not None and str(m["title"]).strip():
            d["title"] = str(m["title"]).strip()
        if m.get("abstract") is not None and str(m["abstract"]).strip():
            d["abstract"] = str(m["abstract"]).strip()


def semantic_search(
    query: str,
    top_k: int = 10,
    filters: Optional[dict] = None,
    page: int = 1,
    page_size: int = 5,
    sort_by: str = "relevance",
    sort_order: str = "desc",
) -> dict:
    """Run semantic search and return frontend-compatible response."""
    query = (query or "").strip() or "research"
    start = time.perf_counter()
    engine = _get_engine()
    filter_dict = None
    if filters and filters.get("filename"):
        filter_dict = {"filename": {"$eq": filters["filename"]}}

    result = engine.search(query=query, top_k=top_k * 8, filter_dict=filter_dict)
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

    # Deduplicate by document id (filename): keep best-scoring result per document
    by_id: Dict[str, dict] = {}
    for d in docs:
        doc_id = d.get("id") or d.get("title") or ""
        if doc_id and doc_id not in by_id:
            by_id[doc_id] = d
        elif doc_id:
            if (d.get("score") or 0) > (by_id[doc_id].get("score") or 0):
                by_id[doc_id] = d
    docs = list(by_id.values())

    supabase_meta = _load_supabase_document_metadata()
    _apply_supabase_metadata(docs, supabase_meta)

    docs = _filter_and_sort_documents(docs, filters, sort_by, sort_order)

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
    sort_by: str = "relevance",
    sort_order: str = "desc",
) -> dict:
    """Simple keyword search over cached chunks (TF-IDF style)."""
    query = (query or "").strip() or "research"
    empty_result = {
        "query": query,
        "topK": top_k,
        "semanticResults": [],
        "keywordResults": [],
        "total": 0,
        "page": page,
        "pageSize": page_size,
        "latencyMs": {"keyword": 0},
    }
    start = time.perf_counter()
    try:
        engine = _get_engine()
    except Exception as e:
        logger.warning(f"Keyword search: engine not available: {e}")
        empty_result["latencyMs"] = {"keyword": int((time.perf_counter() - start) * 1000)}
        return empty_result

    try:
        chunks = engine.get_all_cached_chunks()
    except Exception as e:
        logger.warning(f"Keyword search: could not load cached chunks: {e}")
        empty_result["latencyMs"] = {"keyword": int((time.perf_counter() - start) * 1000)}
        return empty_result

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
                "preview": (c.get("text", "") or "")[:800] + ("..." if len(c.get("text", "")) > 800 else ""),
                "text_preview": (c.get("text", "") or "")[:800],
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    scored = scored[: top_k * 8]

    meta = _load_document_metadata()
    docs = [_backend_to_document(r) for r in scored]
    for d in docs:
        fn = d.get("id", "")
        if fn and fn in meta and meta[fn].get("title"):
            d["title"] = meta[fn]["title"]

    # Deduplicate by document id: keep best-scoring result per document
    by_id: Dict[str, dict] = {}
    for d in docs:
        doc_id = d.get("id") or d.get("title") or ""
        if doc_id and doc_id not in by_id:
            by_id[doc_id] = d
        elif doc_id:
            if (d.get("score") or 0) > (by_id[doc_id].get("score") or 0):
                by_id[doc_id] = d
    docs = list(by_id.values())

    supabase_meta = _load_supabase_document_metadata()
    _apply_supabase_metadata(docs, supabase_meta)

    docs = _filter_and_sort_documents(docs, filters, sort_by, sort_order)

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
    supabase_meta = _load_supabase_document_metadata()
    _apply_supabase_metadata(related, supabase_meta)
    return {"documentId": document_id, "related": related}


def get_document_full_text(document_id: str) -> dict:
    """Get full extracted text for a document (all chunks concatenated). Returns dict with fullText and title or raises FileNotFoundError."""
    import re
    engine = _get_engine()
    cache_dir = Path(getattr(engine.config, "cache_dir", "."))
    # Build candidates: exact id, with/without .pdf, then any cached filename that matches
    candidates = [document_id]
    if not document_id.endswith(".pdf"):
        candidates.append(document_id + ".pdf")
    elif document_id.endswith(".pdf"):
        candidates.append(document_id[:-4])
    # From documents.json
    reg_path = cache_dir / "documents.json"
    if reg_path.exists():
        try:
            with open(reg_path, "r") as f:
                docs = json.load(f)
            for d in docs if isinstance(docs, list) else []:
                fn = (d or {}).get("filename", "")
                if fn and (fn == document_id or fn.replace(".pdf", "") == document_id.replace(".pdf", "")):
                    candidates = [fn] + [c for c in candidates if c != fn]
                    break
        except Exception:
            pass
    # List actual cache files: each "stem.json" is a valid filename
    if cache_dir.exists() and cache_dir.is_dir():
        try:
            for f in os.listdir(cache_dir):
                if f.endswith(".json") and f != "documents.json":
                    stem = f[:-5]  # remove .json
                    if stem and stem not in candidates:
                        candidates.append(stem)
        except Exception:
            pass
    # Normalized match: collapse multiple underscores so "a__b" matches "a_b"
    def norm(s: str) -> str:
        return re.sub(r"_+", "_", (s or "").strip().lower())

    doc_norm = norm(document_id)
    for c in list(candidates):
        if c != document_id and norm(c) == doc_norm:
            candidates.insert(0, c)
            break
    chunks = []
    for fid in candidates:
        chunks = engine.get_chunks_for_document(fid)
        if chunks:
            document_id = fid
            break
    if not chunks:
        raise FileNotFoundError(
            f"No text found for document: {document_id}. "
            f"Cache dir: {cache_dir!s}. Ensure the document is indexed and cache_dir contains {{filename}}.json files."
        )
    chunks_sorted = sorted(chunks, key=lambda c: (c.get("page", 0), c.get("chunk_index", 0)))
    full_text = "\n\n".join((c.get("text") or "").strip() for c in chunks_sorted if c.get("text"))
    title = Path(document_id).stem.replace("_", " ").replace("-", " ")
    supabase_meta = _load_supabase_document_metadata()
    if document_id in supabase_meta and supabase_meta[document_id].get("title"):
        title = str(supabase_meta[document_id]["title"]).strip()
    return {"fullText": full_text, "title": title, "documentId": document_id}


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


def _load_supabase_indexed_paths() -> Set[str]:
    """Load the set of bucket object paths we have already indexed."""
    global _supabase_indexed_paths
    with _supabase_indexed_lock:
        if _SUPABASE_INDEXED_PATH_FILE.exists():
            try:
                with open(_SUPABASE_INDEXED_PATH_FILE, "r") as f:
                    data = json.load(f)
                _supabase_indexed_paths = set(data.get("paths", []) or [])
            except Exception as e:
                logger.warning("Could not load supabase indexed paths: %s", e)
        return set(_supabase_indexed_paths)


def _save_supabase_indexed_paths(paths: Set[str]) -> None:
    """Persist the set of indexed bucket paths."""
    global _supabase_indexed_paths
    _BACKEND_DATA.mkdir(parents=True, exist_ok=True)
    with _supabase_indexed_lock:
        _supabase_indexed_paths = set(paths)
        try:
            with open(_SUPABASE_INDEXED_PATH_FILE, "w") as f:
                json.dump({"paths": list(_supabase_indexed_paths)}, f)
        except Exception as e:
            logger.warning("Could not save supabase indexed paths: %s", e)


def _load_indexed_content_hashes() -> Set[str]:
    """Load the set of content hashes we have already indexed (for duplicate detection)."""
    global _indexed_content_hashes
    with _content_hashes_lock:
        if _CONTENT_HASHES_FILE.exists():
            try:
                with open(_CONTENT_HASHES_FILE, "r") as f:
                    data = json.load(f)
                _indexed_content_hashes = set(data.get("hashes", []) or [])
            except Exception as e:
                logger.warning("Could not load indexed content hashes: %s", e)
        return set(_indexed_content_hashes)


def _save_indexed_content_hashes(hashes: Set[str]) -> None:
    """Persist the set of indexed content hashes."""
    global _indexed_content_hashes
    _BACKEND_DATA.mkdir(parents=True, exist_ok=True)
    with _content_hashes_lock:
        _indexed_content_hashes = set(hashes)
        try:
            with open(_CONTENT_HASHES_FILE, "w") as f:
                json.dump({"hashes": list(_indexed_content_hashes)}, f)
        except Exception as e:
            logger.warning("Could not save indexed content hashes: %s", e)


def _extract_pdf_metadata(path: Path) -> Dict[str, Any]:
    """Best-effort extraction of title/author/year from a PDF."""
    title: Optional[str] = None
    author: Optional[str] = None
    year: Optional[int] = None

    def _clean_candidate(text: str) -> str:
        return re.sub(r"\s+", " ", (text or "").strip()).strip("-_:|,.;")

    def _looks_like_person_name(text: str) -> bool:
        cleaned = _clean_candidate(text)
        if not cleaned or len(cleaned) > 80:
            return False
        parts = [p for p in cleaned.split() if p]
        if len(parts) < 2 or len(parts) > 5:
            return False
        return all(re.fullmatch(r"[A-Z][A-Za-z'\-]+", part) for part in parts)

    def _is_noise_line(text: str) -> bool:
        cleaned = _clean_candidate(text)
        low = cleaned.lower()
        if len(cleaned) < 8:
            return True
        noise_prefixes = (
            "by ",
            "author",
            "student",
            "student name",
            "registration",
            "reg no",
            "index no",
            "supervisor",
            "department",
            "faculty",
            "school of",
            "college of",
            "submitted",
            "presented",
            "partial fulfillment",
            "in partial fulfillment",
            "a dissertation",
            "a thesis",
            "a report",
            "uganda martyrs university",
            "makerere university",
            "kyambogo university",
            "ndejje university",
        )
        return low.startswith(noise_prefixes)

    try:
        import fitz  # PyMuPDF

        doc = fitz.open(str(path))
        meta = doc.metadata or {}
        raw_title = _clean_candidate((meta.get("title") or "").strip())
        raw_author = _clean_candidate((meta.get("author") or "").strip())

        if raw_title and not _looks_like_person_name(raw_title) and not _is_noise_line(raw_title):
            title = raw_title
        if raw_author:
            author = raw_author

        date_str = (meta.get("creationDate") or "") or (meta.get("modDate") or "")
        if date_str:
            m = re.search(r"(19|20)\d{2}", date_str)
            if m:
                try:
                    year = int(m.group(0))
                except ValueError:
                    year = None

        try:
            first_page_text = ""
            title_candidates: list[tuple[float, str]] = []
            if doc.page_count > 0:
                first_page = doc[0]
                first_page_text = first_page.get_text("text") or ""
                page_dict = first_page.get_text("dict") or {}
                for block in page_dict.get("blocks", []):
                    if block.get("type") != 0:
                        continue
                    block_lines = []
                    max_size = 0.0
                    top_y = None
                    for line in block.get("lines", []):
                        spans = line.get("spans", [])
                        span_text = " ".join((s.get("text") or "").strip() for s in spans if (s.get("text") or "").strip())
                        cleaned_line = _clean_candidate(span_text)
                        if cleaned_line:
                            block_lines.append(cleaned_line)
                        for span in spans:
                            try:
                                max_size = max(max_size, float(span.get("size") or 0))
                            except (TypeError, ValueError):
                                pass
                            bbox = span.get("bbox") or line.get("bbox") or block.get("bbox")
                            if bbox and top_y is None:
                                top_y = float(bbox[1])
                    candidate = _clean_candidate(" ".join(block_lines))
                    if not candidate or _is_noise_line(candidate):
                        continue
                    if _looks_like_person_name(candidate):
                        if not author:
                            author = candidate[:128]
                        continue
                    if len(candidate) < 12 or len(candidate) > 220:
                        continue
                    top_penalty = (top_y or 0.0) / 100.0
                    score = max_size - top_penalty + min(len(candidate), 120) / 120.0
                    title_candidates.append((score, candidate))

            lines = [_clean_candidate(ln) for ln in (first_page_text.splitlines() if first_page_text else [])]
            lines = [ln for ln in lines if ln]

            if not title:
                for ln in lines[:12]:
                    low = ln.lower()
                    if low.startswith("by "):
                        possible_author = _clean_candidate(ln[3:])
                        if possible_author and not author:
                            author = possible_author[:128]
                        continue
                    if _looks_like_person_name(ln):
                        if not author:
                            author = ln[:128]
                        continue
                    if _is_noise_line(ln):
                        continue
                    if 12 <= len(ln) <= 220:
                        score = 1.5 + min(len(ln), 120) / 120.0
                        title_candidates.append((score, ln))

                if title_candidates:
                    seen = set()
                    ranked = []
                    for score, candidate in sorted(title_candidates, key=lambda item: item[0], reverse=True):
                        norm = candidate.lower()
                        if norm in seen:
                            continue
                        seen.add(norm)
                        ranked.append((score, candidate))
                    title = ranked[0][1][:256]
                elif lines:
                    title = lines[0][:256]

            if year is None:
                for ln in lines[:20]:
                    m2 = re.search(r"(19|20)\d{2}", ln)
                    if m2:
                        try:
                            year = int(m2.group(0))
                        except ValueError:
                            year = None
                        if year is not None:
                            break
        finally:
            doc.close()
    except Exception as e:
        logger.warning("Metadata extraction failed for %s: %s", path, e)

    return {"title": title, "author": author, "year": year}

def _load_indexed_content_hashes() -> Set[str]:
    """Load the set of content hashes we have already indexed (for duplicate detection)."""
    global _indexed_content_hashes
    with _content_hashes_lock:
        if _CONTENT_HASHES_FILE.exists():
            try:
                with open(_CONTENT_HASHES_FILE, "r") as f:
                    data = json.load(f)
                _indexed_content_hashes = set(data.get("hashes", []) or [])
            except Exception as e:
                logger.warning("Could not load indexed content hashes: %s", e)
        return set(_indexed_content_hashes)


def _save_indexed_content_hashes(hashes: Set[str]) -> None:
    """Persist the set of indexed content hashes."""
    global _indexed_content_hashes
    _BACKEND_DATA.mkdir(parents=True, exist_ok=True)
    with _content_hashes_lock:
        _indexed_content_hashes = set(hashes)
        try:
            with open(_CONTENT_HASHES_FILE, "w") as f:
                json.dump({"hashes": list(_indexed_content_hashes)}, f)
        except Exception as e:
            logger.warning("Could not save indexed content hashes: %s", e)


def _list_bucket_object_paths(supabase_client, bucket: str, prefix: str = "") -> List[str]:
    """Recursively list all object paths in a storage bucket (files only, not folder markers)."""
    paths: List[str] = []
    try:
        opts = {"limit": 1000}
        response = supabase_client.storage.from_(bucket).list(prefix or "", opts)
        # response can be a list of dicts with 'name', 'id', 'metadata'
        items = response if isinstance(response, list) else getattr(response, "data", response) or []
        if not isinstance(items, list):
            items = []
        for item in items:
            name = item.get("name") if isinstance(item, dict) else getattr(item, "name", "")
            if not name:
                continue
            full_path = f"{prefix}/{name}".lstrip("/") if prefix else name
            # Supabase returns folders as items with no 'id' or metadata indicating folder
            is_folder = (
                isinstance(item, dict)
                and (item.get("id") is None or (item.get("metadata") or {}).get("mimetype") == "folder")
            ) or (not isinstance(item, dict) and not getattr(item, "id", None))
            if is_folder or "/" not in full_path and "." not in name:
                # Could be a folder (e.g. user-id prefix); recurse
                paths.extend(_list_bucket_object_paths(supabase_client, bucket, full_path))
            else:
                # Treat as file; only include PDFs for ingestion
                if full_path.lower().endswith(".pdf"):
                    paths.append(full_path)
    except Exception as e:
        logger.warning("Supabase list(%s) failed: %s", prefix or "/", e)
    return paths


def poll_supabase_academic_docs() -> None:
    """
    List objects in Supabase Storage bucket 'academic-docs', and for any object path
    not yet indexed, create a signed URL, download and run ingest. Runs in the same
    process (call from a background thread or task). No-op if SUPABASE_URL or
    SUPABASE_SERVICE_ROLE_KEY are not set.
    """
    from dotenv import load_dotenv

    load_dotenv()
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return

    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "academic-docs")
    try:
        from supabase import create_client

        client = create_client(url, key)
    except Exception as e:
        logger.warning("Supabase client creation failed: %s", e)
        return

    try:
        all_paths = _list_bucket_object_paths(client, bucket)
    except Exception as e:
        logger.warning("Supabase list bucket failed: %s", e)
        return

    indexed = _load_supabase_indexed_paths()
    new_paths = [p for p in all_paths if p not in indexed]
    if not new_paths:
        return

    for obj_path in new_paths:
        try:
            signed = client.storage.from_(bucket).create_signed_url(obj_path, 3600)
            signed_url = None
            if isinstance(signed, dict):
                signed_url = signed.get("signedUrl") or signed.get("signed_url")
            else:
                signed_url = getattr(signed, "signed_url", None) or getattr(signed, "signedUrl", None)
            if not signed_url:
                logger.warning("No signed URL for %s", obj_path)
                continue
            filename = Path(obj_path).name
            run_ingest_from_url(url=signed_url, filename=filename, bucket_path=obj_path)
            indexed.add(obj_path)
        except Exception as e:
            logger.warning("Ingest from bucket path %s failed: %s", obj_path, e)
    if new_paths:
        _save_supabase_indexed_paths(indexed)
        logger.info("Supabase poll: indexed %d new object(s) from %s", len(new_paths), bucket)


def get_ingest_job(job_id: str) -> Optional[dict]:
    return _ingest_jobs.get(job_id)


def run_ingest_from_url(url: str, filename: Optional[str] = None, bucket_path: Optional[str] = None) -> dict:
    """Download a document from URL to raw_pdfs and run ingestion. Used for Supabase Storage uploads.
    If bucket_path is provided and ingest succeeds, it is recorded so the Supabase poller skips it.
    """
    import re
    import httpx

    job_id = str(uuid.uuid4())
    _ingest_jobs[job_id] = {
        "jobId": job_id,
        "status": "processing",
        "processedCount": 0,
        "totalCount": 0,
        "message": "Downloading and indexing...",
    }

    try:
        engine = _get_engine()
        raw_pdfs = Path(engine.config.local_data_dir) / "raw_pdfs"
        raw_pdfs.mkdir(parents=True, exist_ok=True)

        if not filename or not str(filename).strip():
            # Derive from URL path (last segment)
            path_part = (url or "").split("?")[0].rstrip("/")
            filename = path_part.split("/")[-1] if "/" in path_part else "document.pdf"
        filename = str(filename or "document.pdf")
        # Sanitize: only allow alphanumeric, dash, underscore, dot
        safe_name = re.sub(r"[^\w.\-]", "_", filename)
        if not safe_name.lower().endswith(".pdf"):
            safe_name = safe_name + ".pdf"
        local_path = raw_pdfs / safe_name

        with httpx.Client(follow_redirects=True, timeout=60.0) as client:
            resp = client.get(url)
            resp.raise_for_status()
            content = resp.content
            local_path.write_bytes(content)

        # Content-based duplicate detection: same bytes = duplicate even if filename differs
        content_hash = hashlib.sha256(content).hexdigest()
        existing_hashes = _load_indexed_content_hashes()
        # One-time backfill: if we have no stored hashes, build set from existing raw_pdfs
        if not _CONTENT_HASHES_FILE.exists() and raw_pdfs.exists():
            for f in raw_pdfs.glob("*.pdf"):
                try:
                    existing_hashes.add(hashlib.sha256(f.read_bytes()).hexdigest())
                except Exception as e:
                    logger.warning("Could not hash %s: %s", f, e)
            _save_indexed_content_hashes(existing_hashes)
        if content_hash in existing_hashes:
            meta = _extract_pdf_metadata(local_path)
            _ingest_jobs[job_id] = {
                "jobId": job_id,
                "status": "duplicate",
                "processedCount": 0,
                "totalCount": 1,
                "message": "Duplicate document (same content).",
                "title": meta.get("title"),
                "author": meta.get("author"),
                "year": meta.get("year"),
            }
            return _ingest_jobs[job_id]

        result = engine.index_documents([str(local_path)])
        processed = result.get("processed", 0)
        total_chunks = result.get("total_chunks", 0)
        meta = _extract_pdf_metadata(local_path)
        _ingest_jobs[job_id] = {
            "jobId": job_id,
            "status": "completed" if result.get("success") else "failed",
            "processedCount": processed,
            "totalCount": 1,
            "message": result.get("message") or f"Indexed 1 document, {total_chunks} chunks.",
            "title": meta.get("title"),
            "author": meta.get("author"),
            "year": meta.get("year"),
        }
        if result.get("success"):
            existing_hashes.add(content_hash)
            _save_indexed_content_hashes(existing_hashes)
            if bucket_path and bucket_path.strip():
                idx = _load_supabase_indexed_paths()
                idx.add(bucket_path.strip())
                _save_supabase_indexed_paths(idx)
    except Exception as e:
        logger.exception("Ingest from URL failed")
        _ingest_jobs[job_id] = {
            "jobId": job_id,
            "status": "failed",
            "processedCount": 0,
            "totalCount": 0,
            "message": str(e),
        }

    return _ingest_jobs[job_id]


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



