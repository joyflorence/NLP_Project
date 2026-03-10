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

* **Supabase storage polling** (optional): to also index documents added directly
  to the Supabase Storage bucket `academic-docs`, set `SUPABASE_URL` (or use
  `VITE_SUPABASE_URL` from `.env`), `SUPABASE_SERVICE_ROLE_KEY`, and optionally
  `SUPABASE_POLL_INTERVAL_MINUTES` (default 5) and `SUPABASE_STORAGE_BUCKET`
  (default `academic-docs`). The backend then periodically lists the bucket,
  downloads new PDFs via signed URL, and indexes them. State: `backend/data/supabase_indexed_paths.json`.

## Run

```bash
# From project root (use the venv's Python so dependencies are found)
.\.venv\Scripts\python.exe backend\run.py
```

Or with a custom port:

```bash
$env:PORT="8001"; .\.venv\Scripts\python.exe backend\run.py
```

The API will be available at `http://localhost:8001` (or 8000 if PORT is not set). Docs: `http://localhost:8001/docs`.

## Troubleshooting

**Torch c10.dll / WinError 1114 (Windows) – quick fix**  
If search returns *503* or *500* with a message about `c10.dll`, run this from project root then restart the backend:

```powershell
.\.venv\Scripts\pip.exe uninstall torch -y
.\.venv\Scripts\pip.exe install torch --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\pip.exe install -r backend\requirements.txt
```

**NumPy / semantic engine import error**  
If you see `No module named 'numpy._core._multiarray_umath'` and files like `_multiarray_umath.cp311-win_amd64.pyd`, the venv has packages built for a different Python (e.g. 3.11) than the one you're running (e.g. 3.12). Fix:

```powershell
# From project root, reinstall NumPy (and optionally all deps) for current Python
.\.venv\Scripts\pip.exe install --force-reinstall numpy
# Or reinstall everything:
.\.venv\Scripts\pip.exe install --force-reinstall -r backend\requirements.txt
```

Then restart the backend.

**Torch c10.dll / WinError 1114 (Windows)**  
If you see `OSError: [WinError 1114] A dynamic link library (DLL) initialization routine failed` when loading `c10.dll`, try:

1. **Install Microsoft Visual C++ Redistributable**  
   Install the latest [Visual C++ Redistributable for Visual Studio 2015–2022 (x64)](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist). Reinstall or repair if already present.

2. **Use CPU-only PyTorch** (avoids CUDA/DLL conflicts; fine for semantic search):
   ```powershell
   .\.venv\Scripts\pip.exe uninstall torch -y
   .\.venv\Scripts\pip.exe install torch --index-url https://download.pytorch.org/whl/cpu
   ```
   Then reinstall the rest of the backend deps if needed:  
   `.\.venv\Scripts\pip.exe install -r backend\requirements.txt`

3. **Downgrade PyTorch** if you are on 2.9+ and the error persists:  
   `.\.venv\Scripts\pip.exe install "torch>=2.1.0,<2.9"`

Restart the backend after any of these steps.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/search/semantic` | Semantic search |
| POST | `/api/search/keyword` | Keyword search baseline |
| GET | `/api/documents/{id}/similar?topK=5` | Similar documents |
| POST | `/api/ingest` | Trigger document ingestion |
| POST | `/api/ingest-from-url` | Ingest from URL (e.g. Supabase signed URL) |
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
