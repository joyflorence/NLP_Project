# NLP_Project_1

This repository contains a React/Vite frontend and a FastAPI backend for an
academic semantic search application.  The two services communicate over REST
and can either run separately during development or be served together in
production via the backend's static file support.

## Getting started

1. **Backend**
   - `cd backend && pip install -r requirements.txt`
   - optionally set `CORS_ALLOW_ORIGINS` or `FRONTEND_DIR` in the environment
   - `python backend/run.py` (or `uvicorn backend.app.main:app --reload`)

2. **Frontend**
   - `npm install` from the project root
   - copy `.env.example` to `.env` and adjust values as needed
   - valid variables include `VITE_API_BASE_URL` (default `/api`),
     `VITE_USE_MOCK_API`, etc.
   - `npm run dev` to start Vite

The frontend ships with a proxy configuration so `/api` requests are
automatically forwarded to `http://localhost:8000` during development; in
production you can build the UI and let the backend serve the generated files.

If the browser console prints `Backend ping failed:` when the app loads, the
frontend is unable to reach the backend – check that the API base URL, CORS
settings, and network connectivity are correct.


