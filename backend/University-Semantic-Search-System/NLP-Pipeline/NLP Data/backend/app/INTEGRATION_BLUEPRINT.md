# Semantic Search Engine — Technical Integration Blueprint

**University Academic Semantic Search System**  
*Modular, production-ready design with FAISS primary and optional Pinecone support*

---

## 1. High-Level Architecture

The system is a **batch (offline) indexing + online query** pipeline. PDFs are ingested, turned into text, cleaned, chunked, embedded, and stored in a vector index. At query time, the user query is embedded and the vector store returns the nearest chunks; results are aggregated by document and optionally re-ranked.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           OFFLINE (Indexing Pipeline)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│  PDFs → Extract → Clean → Chunk → Embed → Vector Store + Metadata               │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         ONLINE (Query Path)                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│  Query → Embed → Vector Search → Aggregate by Doc → Rank → API → Web UI          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Design principles:**
- **Vector store abstraction**: One interface; FAISS (default) or Pinecone implementation. Switching store does not change pipeline or API.
- **Modular pipeline**: Each stage (extract, clean, chunk, embed, index) has clear inputs/outputs and can be run independently or as a DAG.
- **Reusable search engine**: The semantic search component can be imported and used by the web backend, CLI tools, or batch jobs without depending on Flask.

---

## 2. Architecture Flow (Preserved) — Stage-by-Stage

| Stage | Input | Output | Data Format |
|-------|--------|--------|-------------|
| **1. Text extraction** | PDF files (paths) | Raw text per document + extraction metadata | `{ doc_id, file_path, raw_text, page_count, extraction_ok }` |
| **2. Cleaning & normalization** | Raw text | Normalized text (optional: strip after "References") | Same structure + `cleaned_text` |
| **3. Chunking** | Cleaned text | Chunks with doc/page/position | `[{ chunk_id, doc_id, text, page, chunk_index, word_offset }]` |
| **4. Embedding generation** | Chunks (text) | Vectors per chunk | `[{ chunk_id, doc_id, embedding (float32[]), metadata }]` |
| **5. Vector index** | Vectors + metadata | FAISS index (or Pinecone namespace) + chunk metadata store | Index on disk + `chunk_id → (doc_id, text_preview, page)` |
| **6. Semantic search** | Query string + top_k + optional filters | Ranked chunks/documents with scores | `{ results: [{ id, score, filename, page, preview }], method }` |
| **7. Web application** | HTTP requests | HTML/JSON | REST: `/api/search`, `/api/documents`, etc. |

**Connections:**
- **Extract → Clean**: One-to-one per document; cleaning is in-memory from `raw_text` to `cleaned_text`.
- **Clean → Chunk**: One document → many chunks; chunker emits list of chunks with `doc_id` and `chunk_index`.
- **Chunk → Embed**: Batch of chunks → batch of vectors; same order; embedding model is stateless.
- **Embed → Index**: Vectors + chunk metadata are sent to the **vector store abstraction**; the implementation (FAISS or Pinecone) persists them.
- **Index → Search**: Query is embedded with the same model; the same vector store abstraction is used for `search(query_vector, top_k, filter)`.
- **Search → Web**: Backend calls the semantic search engine (and optionally keyword baseline), then returns JSON to the front end.

---

## 3. Component Diagram (Textual)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              ARTIFACTS (Disk)                                │
│  artifacts/extracted_text/  artifacts/cleaned_text/  artifacts/chunks/        │
│  artifacts/embeddings/      artifacts/indexes/      artifacts/reports/      │
│  artifacts/logs/                                                             │
└──────────────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         PIPELINE (Backend — Offline)                         │
│  ExtractTextStep → CleanAndNormalizeStep → ChunkStep → EmbedStep → IndexStep  │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     VECTOR STORE ABSTRACTION LAYER                            │
│  IVectorStore (interface)                                                     │
│       ├── FaissVectorStore (default): load/save index under artifacts/indexes │
│       └── PineconeVectorStore (optional): cloud index, same interface         │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      SEMANTIC SEARCH ENGINE (Reusable)                        │
│  EmbeddingModelLoader + IVectorStore + ChunkMetadataStore                     │
│  → search(query, top_k, filters), get_similar(doc_id), stats                 │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         WEB BACKEND (Flask / FastAPI)                         │
│  /api/search (semantic), /api/search/keyword, /api/documents, /api/ingest      │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              WEB UI (Templates / SPA)                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Repository Structure and Responsibilities

```
NLP_Semantic_search/
├── artifacts/                    # All pipeline outputs (do not commit large files)
│   ├── chunks/                   # Chunk JSON/JSONL per document or global
│   ├── cleaned_text/             # Cleaned full text per document
│   ├── embeddings/               # Optional: saved embeddings for reprocessing
│   ├── extracted_text/           # Raw extracted text per document
│   ├── indexes/                  # FAISS index + metadata pickle (or symlink)
│   ├── reports/                  # Evaluation reports, run summaries
│   └── logs/                     # Pipeline and engine logs
│
├── app/                          # Web application and API (backend)
│   ├── __init__.py
│   ├── app.py                    # Flask app, routes
│   ├── config.py                 # Central config (paths, model, chunk, artifacts)
│   ├── semantic_engine.py       # Orchestrator: model + vector store + pipeline hooks
│   ├── keyword_engine.py         # TF-IDF/BM25 baseline
│   ├── database.py               # SQLite: documents, chunks, eval
│   ├── vector_store.py           # IVectorStore + FaissVectorStore + PineconeVectorStore
│   ├── templates/
│   └── static/
│
├── pipeline/                     # Optional: standalone scripts for batch runs
│   ├── run_extract.py
│   ├── run_chunk_embed.py
│   └── run_full_pipeline.py
│
├── data/                         # Input PDFs (or symlink to shared drive)
│   └── raw_pdfs/
├── docs/
│   └── INTEGRATION_BLUEPRINT.md  # This document
├── run.py                        # Entry point: start web server
└── requirements.txt
```

**Folder responsibilities:**

| Path | Responsibility |
|------|----------------|
| `artifacts/` | Single root for all generated data; easy to backup, clear, or move. |
| `artifacts/indexes/` | FAISS index file(s) and chunk metadata; loaded at backend startup. |
| `app/` | Web server, API, search engine orchestration, vector store usage. |
| `pipeline/` | Scripts to run extraction, chunking, embedding, and indexing (e.g. cron). |
| `data/raw_pdfs/` | Canonical location for PDFs to ingest. |

---

## 5. Key Interfaces and Classes

### 5.1 Vector Store Abstraction (Critical)

```python
# backend/app/vector_store.py

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple

class IVectorStore(ABC):
    """Abstract interface for vector storage. FAISS or Pinecone implement this."""

    @abstractmethod
    def upsert(self, vectors: List[Tuple[str, List[float], Dict[str, Any]]]) -> None:
        """Insert or update vectors. Each item: (id, embedding, metadata)."""

    @abstractmethod
    def search(self, query_vector: List[float], top_k: int, filter_dict: Optional[Dict] = None) -> List[Dict[str, Any]]:
        """Return list of { id, score, metadata } sorted by similarity."""

    @abstractmethod
    def delete_by_metadata(self, filter_dict: Dict) -> int:
        """Delete vectors matching filter (e.g. filename). Return count deleted."""

    @abstractmethod
    def count(self) -> int:
        """Total number of vectors in the store."""

    @abstractmethod
    def load(self) -> bool:
        """Load existing index from disk or cloud. Return True if loaded."""

    @abstractmethod
    def save(self) -> bool:
        """Persist index (for FAISS). No-op for Pinecone. Return True on success."""
```

- **FaissVectorStore**: Uses `artifacts/indexes/faiss.index` and `artifacts/indexes/faiss_metadata.pkl`. On `load()`, reads from disk; on `save()`, writes after `upsert` or `delete`.
- **PineconeVectorStore**: Uses Pinecone SDK; `load()` checks index exists and is ready; `save()` is no-op. Same `upsert`/`search`/`delete_by_metadata` semantics so the rest of the system is unchanged.

### 5.2 Semantic Search Engine (Orchestrator)

```python
# SemanticSearchEngine (existing, refactored to use IVectorStore)

class SemanticSearchEngine:
    def __init__(self, vector_store: IVectorStore, config: Config):
        self.vector_store = vector_store
        self.config = config
        self.model = None  # SentenceTransformer, loaded in initialize()

    def initialize(self) -> bool:
        # Load embedding model; call vector_store.load()
        ...

    def index_documents(self, filepaths: List[str]) -> Dict[str, Any]:
        # For each file: extract → clean → chunk → embed → vector_store.upsert()
        # Persist document registry and optional chunk metadata for snippets
        ...

    def search(self, query: str, top_k: int = 10, filter_dict: Optional[Dict] = None) -> Dict[str, Any]:
        query_embedding = self.model.encode(query)
        raw = self.vector_store.search(query_embedding.tolist(), top_k, filter_dict)
        return self._format_results(raw, query)
```

The engine does **not** import FAISS or Pinecone directly; it only uses `IVectorStore`. The choice of FAISS vs Pinecone is made at wiring time (config or factory).

### 5.3 Pipeline Steps (Optional Modular Steps)

- **ExtractTextStep**: Input: list of PDF paths. Output: write `artifacts/extracted_text/{doc_id}.txt`, return list of `{ doc_id, path, ok }`.
- **CleanAndNormalizeStep**: Input: read extracted text. Output: write `artifacts/cleaned_text/{doc_id}.txt`.
- **ChunkStep**: Input: cleaned text. Output: write `artifacts/chunks/{doc_id}.json` (list of chunks).
- **EmbedStep**: Input: read chunks, load model. Output: in-memory list of (chunk_id, vector, metadata).
- **IndexStep**: Input: vectors + metadata. Output: call `vector_store.upsert()`, then `vector_store.save()` for FAISS.

Incremental indexing: run pipeline only for new or changed PDFs; append new vectors via `vector_store.upsert()` and optionally merge/replace FAISS index on disk.

---

## 6. Document Ingestion Pipeline (Pseudocode)

```python
def run_document_ingestion(pdf_paths: List[str], config: Config, vector_store: IVectorStore) -> Dict:
    engine = SemanticSearchEngine(vector_store=vector_store, config=config)
    engine.initialize()

    all_chunks = []
    doc_registry = []

    for path in pdf_paths:
        # 1. Extract
        raw = extract_text_from_pdf(path)  # PyMuPDF/pdfplumber
        write_text(artifacts_dir / "extracted_text" / f"{doc_id}.txt", raw)

        # 2. Clean
        cleaned = clean_text(raw)  # regex, optional stop at "References"
        write_text(artifacts_dir / "cleaned_text" / f"{doc_id}.txt", cleaned)

        # 3. Chunk (250–400 words, 40–80 overlap)
        chunks = chunk_text(cleaned, doc_id=doc_id, chunk_size=300, overlap=50)
        write_json(artifacts_dir / "chunks" / f"{doc_id}.json", chunks)
        all_chunks.extend(chunks)
        doc_registry.append({"doc_id": doc_id, "filename": os.path.basename(path), "chunk_count": len(chunks)})

    # 4. Embed (batch)
    vectors = engine.generate_embeddings(all_chunks)  # list of (id, vec, meta)

    # 5. Index (incremental: append to store)
    vector_store.upsert(vectors)
    vector_store.save()

    update_document_registry(doc_registry)
    return {"documents": len(doc_registry), "chunks": len(all_chunks)}
```

---

## 7. Index Creation and Loading

- **Creation**: After `vector_store.upsert(vectors)`, call `vector_store.save()`. For FAISS, write `faiss.index` and `faiss_metadata.pkl` under `artifacts/indexes/`.
- **Loading**: On backend startup, instantiate `FaissVectorStore(artifacts_index_dir)` or `PineconeVectorStore(api_key, index_name)`, then call `load()`. If no index exists, `load()` returns False and the engine starts with an empty index (ready for first ingestion).
- **Incremental**: For FAISS, either (a) load existing index, append new vectors, then save again, or (b) rebuild a new index from all chunk files and replace the old one. (a) is simpler for small-to-medium corpus; (b) is better for very large or when you need index compaction.

---

## 8. Query Processing and Ranking

```python
def search(self, query: str, top_k: int = 10, filter_dict: Optional[Dict] = None) -> Dict[str, Any]:
    query_vec = self.model.encode(query).tolist()
    hits = self.vector_store.search(query_vec, top_k * 2, filter_dict)  # over-fetch for doc agg

    # Aggregate by document (max score or top-3 average per doc)
    by_doc = {}
    for h in hits:
        doc_id = h["metadata"].get("filename") or h["metadata"].get("doc_id")
        if doc_id not in by_doc or h["score"] > by_doc[doc_id]["score"]:
            by_doc[doc_id] = {**h, "score": h["score"]}

    # Sort and take top_k documents (or chunks, per product requirement)
    sorted_docs = sorted(by_doc.values(), key=lambda x: x["score"], reverse=True)[:top_k]
    return {"success": True, "query": query, "results": sorted_docs, "method": "semantic"}
```

Optional: hybrid ranking = semantic score + keyword (BM25) score; combine with a weighted sum or reciprocal rank fusion.

---

## 9. API Exposure for the Web Application

Prefer **REST** (Flask or FastAPI). Example endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/search` | Semantic search. Body: `{ "query": "...", "top_k": 10, "filename": "optional filter" }`. Returns `{ results, query, method }`. |
| POST | `/api/search/keyword` | Keyword (BM25/TF-IDF) baseline. Same body. |
| GET | `/api/documents` | List indexed documents and stats. |
| GET | `/api/documents/<doc_id>` | Document metadata + top snippets. |
| GET | `/api/documents/<doc_id>/similar` | Similar documents (by doc vector). |
| POST | `/api/ingest/upload` | Upload PDF(s), run ingestion pipeline, return summary. |
| POST | `/api/admin/reindex` | Trigger full reindex (optional, protected). |
| GET | `/api/status` | Engine status (initialized, total_chunks, total_documents). |
| GET | `/api/evaluation` | Evaluation metrics (P@5, P@10, MRR) if available. |

**FastAPI example (structure):**

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()
engine = SemanticSearchEngine(vector_store=create_vector_store(config), config=config)

class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    filename: str | None = None

@app.post("/api/search")
def search_semantic(req: SearchRequest):
    if not engine.initialized:
        raise HTTPException(503, "Search engine not ready")
    filter_dict = {"filename": {"$eq": req.filename}} if req.filename else None
    return engine.search(req.query, top_k=req.top_k, filter_dict=filter_dict)
```

---

## 10. Error Handling, Logging, and Scalability

- **Error handling**: Pipeline steps should catch exceptions, log with context (doc_id, path), and return structured errors (e.g. `{ "ok": false, "error": "...", "doc_id": "..." }`). API returns 4xx/5xx with a consistent JSON body.
- **Logging**: Use a single logger per module; log to `artifacts/logs/` (e.g. `pipeline.log`, `engine.log`). Include timestamp, level, message, and optional `doc_id`/`query_id` for traceability.
- **Scalability**: (1) FAISS: use IVF or HNSW for large corpora; (2) batch embedding and batch upsert; (3) incremental indexing to avoid full rebuilds; (4) optional async queue for upload-then-index so the API returns quickly and indexing runs in background.
- **Pinecone**: If the SDK is missing or deprecated (e.g. old `pinecone-client`), catch the exception at import and set `PINECONE_AVAILABLE = False`; the factory then returns `FaissVectorStore` so the system never breaks.

---

## 11. Incremental Indexing

- **New PDFs only**: Run extraction → clean → chunk for new files; load existing FAISS index and metadata, append new vectors, save. Document registry is merged (append new entries).
- **Idempotency**: Use stable `doc_id` (e.g. hash of path or metadata). Before append, call `vector_store.delete_by_metadata({"filename": doc_id})` for that doc so re-runs replace rather than duplicate.
- **Rebuild**: Provide a script or `/api/admin/reindex` that clears the index and re-runs the full pipeline over `artifacts/chunks/` or over all PDFs in `data/raw_pdfs/`.

---

## 12. Step-by-Step Integration Workflow

1. **Adopt artifact layout**: Create `artifacts/{chunks,cleaned_text,embeddings,extracted_text,indexes,reports,logs}` and point config to `artifacts/indexes` and `artifacts/logs`.
2. **Introduce `IVectorStore`**: Add `vector_store.py` with `IVectorStore`, `FaissVectorStore`, `PineconeVectorStore`. Factory: `create_vector_store(config)` → FAISS if no Pinecone key or `USE_FAISS=1`, else Pinecone.
3. **Refactor `SemanticSearchEngine`**: Inject `IVectorStore` and config; replace direct FAISS/Pinecone calls with `self.vector_store.upsert/search/load/save`. Keep embedding and chunking logic in the engine or in pipeline steps.
4. **Wire app startup**: In `app.py`, call `create_vector_store(config)`, then `SemanticSearchEngine(vector_store, config)`, then `engine.initialize()` (load model + `vector_store.load()`).
5. **Optional pipeline scripts**: Implement `run_extract.py`, `run_chunk_embed.py` that read/write under `artifacts/` and call the same chunk/embed logic as the engine, then call `vector_store.upsert()` and `save()`.
6. **API**: Ensure all search and document endpoints use the shared engine instance; add `/api/ingest/upload` and optional `/api/admin/reindex` with the same pipeline.
7. **Tests**: Unit test `FaissVectorStore` and `PineconeVectorStore` (mock) with in-memory/small index; integration test full pipeline with one PDF and one search.

This blueprint keeps the architecture flow intact, makes the vector store swappable, and keeps the semantic search engine reusable and production-ready.

---

## Implementation status (in this repo)

| Component | Status |
|-----------|--------|
| **Artifacts layout** | `artifacts/{chunks,cleaned_text,embeddings,extracted_text,indexes,reports,logs}` created; config exposes `artifacts_dir`, `artifacts_indexes_dir`, etc. |
| **Vector store abstraction** | `app/vector_store.py`: `IVectorStore`, `FaissVectorStore`, `PineconeVectorStore`, `create_vector_store(config)`. FAISS default when Pinecone unavailable or `USE_FAISS=1`. |
| **Semantic engine** | Existing `SemanticSearchEngine` still uses in-engine FAISS/Pinecone logic; can be refactored to accept `IVectorStore` via constructor injection. |
| **Pipeline stages** | Extract/clean/chunk/embed live inside `semantic_engine`; optional standalone pipeline scripts can call the same logic and write to `artifacts/`. |
| **API** | Flask routes: `/api/search`, `/api/search/keyword`, `/api/documents`, `/api/documents/<id>/similar`, `/api/ingest/upload`, `/api/status`, `/api/evaluation`. |
| **Incremental indexing** | Supported: new PDFs are chunked and embedded, then vectors appended via `upsert`; document registry merged. |
