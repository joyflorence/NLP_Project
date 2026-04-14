# Demo Script

## 1. Opening Statement
Introduce the project in one sentence:

`This project is a University Academic Semantic Search System that uses NLP embeddings and vector search to help users find relevant academic documents beyond exact keyword matching.`

## 2. Explain The Problem
Say:
- universities store many PDFs
- traditional search depends too much on exact titles/keywords
- users need a better way to discover related academic work

## 3. Show The Search Page
Demonstrate:
- search input
- search suggestions
- year and level filters
- sorting
- pagination

Suggested narration:
`The user enters a natural-language topic, and the system returns documents that are semantically related to the query.`

## 4. Run A Search
Use a realistic academic query, for example:
- `local revenue collection and service delivery`
- `artificial intelligence in education`
- `financial management practices`

Show that:
- results appear
- metadata is visible
- year filter works

## 5. Show Preview And Similar Documents
Open preview for one result.
Then click `Find Similar`.

Narration:
`The preview supports fast review without downloading the PDF, while similar-document retrieval helps users discover related work.`

## 6. Show Citation
Click `Cite` and explain that the system supports:
- Plain
- APA
- MLA
- Chicago
- BibTeX

## 7. Show Save To Library
Save a document to the library.
Then open `My Library` and show:
- saved document list
- note/annotation support
- export bibliography

## 8. Move To Admin Workspace
Open admin.
Show:
- engine/index status
- recent ingest activity
- document table
- upload panel

## 9. Show Admin Upload / Ingestion
Upload one PDF and explain:
- file goes to storage
- metadata is persisted
- file is indexed locally for semantic search
- recent ingest activity is updated

## 10. Show Metadata Management
Open `Manage` for a document and explain:
- edit metadata
- reindex single document
- delete document
- rebuild local index if needed

## 11. Explain Core Backend Logic
Keep this short and clear:
- PDFs are extracted
- text is chunked
- embeddings are generated with `all-MiniLM-L6-v2`
- vectors are stored in FAISS
- queries are embedded and matched semantically

## 12. Closing Statement
Suggested closing:

`In summary, this system improves academic document discovery by combining document ingestion, metadata management, semantic retrieval, citation support, and a user library into one integrated platform.`

## Good Backup Plan During Demo
If live upload/search is slow:
- show already indexed documents
- show preview and citations
- show the admin list and recent activity
- explain that the backend uses local FAISS indexing and Supabase-backed metadata/storage
