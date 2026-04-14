# Exam Checklist

## Before Presentation Day
- Run the updated Supabase SQL in `supabase/policies.sql`
- Start the backend successfully
- Start the frontend successfully
- Verify login works
- Verify admin role works
- Verify one document is searchable
- Verify preview opens
- Verify library loads
- Verify note saving works
- Verify recent activity loads
- Verify clear-history works

## Local Run Commands
### Backend
```powershell
.\.venv\Scripts\python.exe backendun.py
```

### Frontend
```powershell
cd frontend
npm run dev
```

## Final Demo Test Flow
1. Sign in
2. Search for a topic
3. Filter by year
4. Preview a result
5. Cite a result
6. Save a document to library
7. Show saved note in library
8. Open admin page
9. Show recent ingest activity
10. Show document management table
11. Upload or reference an uploaded document
12. Search again and show retrieval

## Fallback Items To Prepare
- one or two indexed documents already in the system
- one reliable query that returns results
- one screenshot of the admin page
- one screenshot of the library page
- one short explanation of the model and architecture

## Questions You Should Be Ready To Answer
- Why semantic search instead of keyword search?
- Why use FAISS?
- Why use `all-MiniLM-L6-v2`?
- How is metadata extracted?
- How are duplicates handled?
- What is the role of Supabase?
- What is stored locally and what is stored in the backend/database?
- What are the limitations of the current version?

## Honest Limitations To Mention If Asked
- metadata extraction is heuristic and can still need manual correction
- local semantic index rebuilds can be heavy for large collections
- some personalization features were added incrementally and can still be refined further
- the project is presentation-ready and functional, but not yet a large-scale production system
