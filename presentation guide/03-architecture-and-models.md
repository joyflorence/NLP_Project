# Architecture And Models

## System Architecture

### Frontend
Location: `frontend/`

Technologies used:
- React 18
- TypeScript
- Vite
- React Router
- Supabase JS client

Main frontend responsibilities:
- search interface
- authentication dialog
- preview and citation UI
- saved library UI
- admin workspace UI

### Backend
Location: `backend/`

Technologies used:
- FastAPI
- Uvicorn
- Python
- httpx
- python-dotenv
- Supabase Python client

Main backend responsibilities:
- search API
- ingest API
- document download flow
- admin management API
- user library API
- local semantic engine integration

### Data Layer
Supabase is used for:
- authentication
- storage bucket for uploaded PDFs
- `documents` metadata table
- `saved_documents` user library table
- `recent_activity` activity log table

## NLP Pipeline Components
The embedded NLP engine lives under:
`backend/University-Semantic-Search-System/NLP-Pipeline/NLP Data/`

Pipeline stages include:
- PDF text extraction
- text cleaning
- duplicate detection
- chunking
- embedding generation
- vector indexing
- search/retrieval

## Exact Models / NLP Methods Used

### Embedding Model
Configured in:
[backend/University-Semantic-Search-System/NLP-Pipeline/NLP Data/config/pipeline_config.yaml](d:/NLP_Project_1/backend/University-Semantic-Search-System/NLP-Pipeline/NLP%20Data/config/pipeline_config.yaml)

Embedding model used:
- `sentence-transformers/all-MiniLM-L6-v2`

Why it was used:
- lightweight and practical for CPU environments
- strong baseline for semantic similarity tasks
- suitable for chunk-level semantic retrieval

### Vector Index
Vector search backend:
- FAISS

Current usage in this project:
- local FAISS index enabled from the backend integration
- the backend instantiates `SemanticSearchEngine(use_faiss=True)`

Why FAISS was used:
- fast local similarity search
- no cloud vector DB requirement for local/demo use
- practical for academic project deployment

### PDF Extraction Tools
Configured and used through the NLP pipeline:
- PyMuPDF as primary extractor
- pdfplumber as fallback extractor

Why both are used:
- PyMuPDF is fast and effective for many PDFs
- pdfplumber helps with fallback robustness when extraction quality is poor

### Other NLP / ML Tools
- sentence-transformers
- torch
- scikit-learn
- numpy
- pandas
- PyYAML
- tqdm

### Duplicate Detection Approach
The pipeline supports:
- exact duplicate detection with hashes
- near-duplicate detection using TF-IDF cosine similarity

## Retrieval Logic
At a simplified level:
1. Convert the query into an embedding
2. Search nearest vectors in FAISS
3. Aggregate chunk matches back to documents
4. Apply metadata enrichment
5. Apply filters and sort order
6. Return results to the frontend

## Local Engine Artifacts
The backend keeps local semantic-engine artifacts such as:
- raw PDFs
- chunk cache JSON files
- FAISS index files
- metadata cache

This is why the system can support local reindexing and offline-style local search behavior after documents are ingested.

## Important Design Choice
The system combines:
- cloud persistence for auth/storage/metadata via Supabase
- local semantic indexing and retrieval via the embedded NLP engine

This hybrid design makes the system suitable for an academic project because it demonstrates both:
- cloud-based application design
- NLP/IR pipeline implementation

## Presentation-ready Architecture Summary

### System Overview
- Frontend: React + Vite UI for search, ingestion, admin, and library.
- Backend: FastAPI API gateway that manages search, ingestion, and document flows.
- Storage: Supabase stores PDFs and metadata, plus handles authentication.
- Semantic Engine: Embedded local engine with FAISS for vector search and similarity.

### End-to-end flow
1. User submits a PDF via the frontend.
2. Frontend uploads the PDF to Supabase Storage.
3. Backend uses a signed URL to fetch the PDF and run ingestion.
4. Duplicate detection checks file content hashes before indexing.
5. New documents are converted to text, chunked, embedded, and saved into FAISS.
6. Search queries are converted to embeddings and matched against local vectors.
7. Results are enriched with Supabase metadata and returned to the UI.

### Why this architecture works
- Separates concerns: UI, API, storage, and semantic search are each distinct.
- Uses cloud storage and metadata persistence without requiring a cloud vector DB.
- Supports safe duplicate handling and local reindexing.
- Demonstrates both modern web app architecture and an NLP retrieval pipeline.

### Diagram text
```
[User Browser]
    ↓
[React Frontend]
    ↓ REST
[FastAPI Backend]
    ↙         ↘
[Supabase]   [Semantic Engine + FAISS]
    ↑
[PDF Storage]
```

### Key points for presentation
- Hybrid architecture: cloud persistence + local semantic search
- Admin workflows: ingest, reindex, delete, and cache reset
- NLP pipeline: extraction → clean → chunk → embed → index
- Search pipeline: query embedding → FAISS retrieval → metadata merge
