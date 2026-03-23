# Academic Semantic Search - Backend API

FastAPI backend that wires the embedded NLP pipeline to the frontend.

## Setup

```bash
# From project root
cd backend
pip install -r requirements.txt
```

Configuration
-------------

The backend can be tuned via environment variables:

* `CORS_ALLOW_ORIGINS` - comma-separated list of allowed origins for CORS.
  Defaults to the development ports `localhost:5173`/`3000`.
* `FRONTEND_DIR` - if set and pointing to a directory, FastAPI will mount that
  path at `/` and serve the built frontend. By default it looks for
  `../frontend/dist` relative to the backend package.
* `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_POLL_INTERVAL_MINUTES`,
  and `SUPABASE_STORAGE_BUCKET` control optional Supabase bucket polling.

## Run

```bash
# From project root
.\.venv\Scripts\python.exe backend\run.py
```

The API will be available at `http://localhost:8001` by default.

## Data and Engine Layout

- Embedded NLP engine: `backend/University-Semantic-Search-System/NLP-Pipeline/NLP Data/`
- Raw PDFs: `backend/University-Semantic-Search-System/NLP-Pipeline/NLP Data/backend/data/raw_pdfs/`
- Engine cache: `backend/University-Semantic-Search-System/NLP-Pipeline/NLP Data/backend/cache/`

## Frontend

The frontend now lives in `frontend/`.
Run it with:

```bash
cd frontend
npm install
npm run dev
```
