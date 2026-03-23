# NLP_Project_1

This repository contains a React/Vite frontend and a FastAPI backend for an
academic semantic search application. The two services communicate over REST
and can either run separately during development or be served together in
production via the backend's static file support.

## Getting started

1. **Backend**
   - From project root, activate the venv and install deps:
     - **Windows (PowerShell):** `.\.venv\Scripts\Activate.ps1` then `pip install -r backend\requirements.txt`
     - **Linux/macOS:** `source .venv/bin/activate` then `pip install -r backend/requirements.txt`
   - Run the backend (use the venv's Python so it finds installed packages):
     - **Windows:** `.\.venv\Scripts\python.exe backend\run.py` or `.\run-backend.ps1`
     - **Linux/macOS:** `python backend/run.py` (with venv activated)
   - The backend listens on `http://localhost:8001` by default.
   - Optionally set `CORS_ALLOW_ORIGINS` or `FRONTEND_DIR` in the environment.

2. **Frontend**
   - `npm install` from the project root
   - copy `.env.example` to `.env` and adjust values as needed
   - valid variables include `VITE_API_BASE_URL` (default `http://localhost:8001/api`), `VITE_USE_MOCK_API`, and the Supabase settings
   - `npm run dev` to start Vite

The frontend ships with a proxy configuration so `/api` requests are
automatically forwarded to `http://localhost:8001` during development; in
production you can build the UI and let the backend serve the generated files.

If the browser console prints `Backend ping failed:` when the app loads, the
frontend is unable to reach the backend. Check the API base URL, CORS settings,
and network connectivity.
