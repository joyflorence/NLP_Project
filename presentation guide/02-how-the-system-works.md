# How The System Works

## High-Level Flow
The system has two main sides:
- Frontend: React + Vite user interface
- Backend: FastAPI API plus embedded NLP indexing/search engine

Document storage and metadata persistence are handled through Supabase.

## End-to-End Workflow

### 1. Admin Uploads a Document
An admin signs in and uploads a PDF through the admin workspace.

The system then:
- uploads the file to the Supabase storage bucket
- creates or updates metadata in the `documents` table
- downloads/indexes the file into the local semantic engine
- records recent ingest activity for monitoring

### 2. Metadata Extraction Happens
During ingestion, the backend extracts or repairs metadata such as:
- title
- author
- year
- abstract

If the admin manually enters metadata, that can override or supplement extracted values.

### 3. Document Is Chunked
The PDF text is extracted and broken into smaller overlapping chunks so that semantic search can work at chunk level instead of only whole-document level.

### 4. Embeddings Are Generated
Each chunk is converted into a dense vector embedding using a sentence-transformer model.

### 5. Vectors Are Indexed
The embeddings are stored in a FAISS index for fast nearest-neighbor semantic retrieval.

### 6. User Searches
When a user types a query:
- the backend embeds the query
- the semantic engine compares the query vector to indexed document vectors
- the best matches are returned
- metadata, filters, and sort options are applied
- the frontend displays paginated results

### 7. User Interacts With Results
From each result, the user can:
- preview the document
- download the document
- find similar documents
- cite the document
- save it to My Library

### 8. Library Workflow
If a signed-in non-admin user saves a document:
- the save is stored in Supabase in `saved_documents`
- optional notes can be attached to that saved item
- the document appears in the user library for later review

### 9. Admin Monitoring
The admin page allows the admin to:
- see searchable/indexed document counts
- view recent ingest activity
- edit metadata
- reindex a single document locally
- rebuild the local index
- delete a document from metadata, storage, and local index state

## Search Modes in Practice

### Semantic Search
Finds conceptually related documents, not only exact keyword matches.

Example:
A query like `local revenue collection service delivery` can still retrieve a document whose wording is not identical but discusses the same topic.

### Keyword Search
Available as a simpler fallback/search baseline in the backend.

## Why Semantic Search Matters Here
Traditional keyword search depends on exact word overlap.
Semantic search works better for academic repositories because:
- students describe similar topics differently
- titles are not always standardized
- the same concept may be expressed with different wording
