# Academic Semantic Search - Backend API

FastAPI backend that wires the University-Semantic-Search-System NLP pipeline to the frontend.

## Setup

```bash
# From project root
cd backend
pip install -r requirements.txt
```

Configuration
-------------

The backend can be tuned via environment variables:

* `CORS_ALLOW_ORIGINS` – comma‑separated list of allowed origins for CORS.
  Defaults to the development ports `localhost:5173`/`3000`.
* `FRONTEND_DIR` – if set and pointing to a directory, FastAPI will mount that
  path at `/` and serve the built frontend.  By default it looks for `../dist`
  (the standard Vite output location) relative to the backend package.

## Run

```bash
# From project root
python backend/run.py
```

Or:

```bash
cd backend
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`. Docs: `http://localhost:8000/docs`.

## Endpoints (match frontend contract)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/search/semantic` | Semantic search |
| POST | `/api/search/keyword` | Keyword search baseline |
| GET | `/api/documents/{id}/similar?topK=5` | Similar documents |
| POST | `/api/ingest` | Trigger document ingestion |
| GET | `/api/ingest/{jobId}` | Ingest job status |
| GET | `/api/evaluation` | Evaluation metrics |
| POST | `/api/documents/signed-download` | Signed download URL |
| GET | `/api/ping`   | Simple connectivity check |
| GET | `/api/status` | Engine status |

## Data

- **PDFs**: Place PDFs in `University-Semantic-Search-System/NLP-Pipeline/NLP Data/backend/data/raw_pdfs/`
- **Ingest**: Call `POST /api/ingest` with `{"sourcePath": "<path>"}` or `{"files": ["file1.pdf"]}` to index documents
- Or run the full pipeline: `python "University-Semantic-Search-System/NLP-Pipeline/NLP Data/run_pipeline.py"`

## Frontend

Set `.env`:

```
VITE_API_BASE_URL=http://localhost:8000/api
VITE_USE_MOCK_API=false
```

Then run the frontend: `npm run dev`
