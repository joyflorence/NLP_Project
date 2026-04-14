# NLP_Project_1

This repository is organized into two main application folders:

- `frontend/` - React + Vite user interface
- `backend/` - FastAPI API and embedded NLP indexing/search engine

## System Architecture

```mermaid
graph TD
    %% Data Input Layer
    PDFs["📄 PDF Documents<br/>(Collected_Data/)"]
    UserQuery["🔍 User Query<br/>(Natural Language)"]
    
    %% Offline Indexing Pipeline
    Extract["Extract Text<br/>(PyMuPDF + pdfplumber)"]
    Clean["Clean & Normalize<br/>(Unicode, Whitespace, references)"]
    Dedupe["Duplicate Detection<br/>(Exact Hash + TF-IDF)"]
    Chunk["Text Chunking<br/>(Paragraph-aware, 350 words, 60 word overlap)"]
    Embed["Generate Embeddings<br/>(sentence-transformers/all-MiniLM-L6-v2)"]
    Index["Vector Indexing<br/>(FAISS IndexFlatIP)"]
    QA["Quality Assurance<br/>(Integrity checks & reporting)"]
    
    %% Storage Layer
    FAISSIndex["⚡ FAISS Index<br/>(Local Vector Store)"]
    PineconeIndex["☁️ Pinecone Index<br/>(Optional Cloud)"]
    MetadataDB["📊 Metadata Store<br/>(Doc metadata & mappings)"]
    SupabaseDB["🗄️ Supabase PostgreSQL<br/>(User auth, saved docs, metadata)"]
    
    %% Online Query Path
    EmbedQuery["Embed Query<br/>(Same model as documents)"]
    VectorSearch["Vector Search<br/>(Top-K nearest neighbors)"]
    Aggregate["Aggregate by Document<br/>(Combine chunk scores)"]
    Rank["Rank Results<br/>(Apply filters & sorting)"]
    
    %% API Layer
    FastAPI["⚙️ FastAPI Backend<br/>(main.py)"]
    SearchEndpoint["GET/POST /search/*<br/>(Semantic, Keyword, Similar)"]
    AdminEndpoint["GET/POST /admin/*<br/>(Index mgmt, docs)"]
    IngestEndpoint["POST /ingest<br/>(Upload & index documents)"]
    
    %% Frontend
    Frontend["🎨 React + Vite Frontend"]
    SearchUI["Search Interface"]
    AdminUI["Admin Dashboard"]
    IngestionUI["Ingest Panel"]
    DocumentUI["Document Viewer"]
    
    %% Connections - Offline Pipeline
    PDFs --> Extract
    Extract --> Clean
    Clean --> Dedupe
    Dedupe --> Chunk
    Chunk --> Embed
    Embed --> Index
    Index --> QA
    
    %% Index Storage
    Index --> FAISSIndex
    Index --> PineconeIndex
    Embed --> MetadataDB
    
    %% Online Query Path
    UserQuery --> EmbedQuery
    EmbedQuery --> VectorSearch
    VectorSearch --> FAISSIndex
    VectorSearch --> PineconeIndex
    VectorSearch --> Aggregate
    Aggregate --> Rank
    Rank --> FastAPI
    
    %% API Endpoints
    FastAPI --> SearchEndpoint
    FastAPI --> AdminEndpoint
    FastAPI --> IngestEndpoint
    
    %% User Interactions
    Frontend --> SearchUI
    Frontend --> AdminUI
    Frontend --> IngestionUI
    Frontend --> DocumentUI
    
    SearchUI --> SearchEndpoint
    AdminUI --> AdminEndpoint
    IngestionUI --> IngestEndpoint
    DocumentUI --> SearchEndpoint
    
    %% Database Connections
    FastAPI --> SupabaseDB
    IngestEndpoint --> SupabaseDB
    
    %% Styling
    classDef input fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef pipeline fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef storage fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef api fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef ui fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    
    class PDFs,UserQuery input
    class Extract,Clean,Dedupe,Chunk,Embed,Index,QA,EmbedQuery,VectorSearch,Aggregate,Rank pipeline
    class FAISSIndex,PineconeIndex,MetadataDB,SupabaseDB storage
    class FastAPI,SearchEndpoint,AdminEndpoint,IngestEndpoint api
    class Frontend,SearchUI,AdminUI,IngestionUI,DocumentUI ui
```

## Structure

- `frontend/` contains the Vite app, env template, and Netlify-facing frontend assets.
- `backend/` contains the API, backend env template, requirements, and the embedded NLP pipeline under `backend/University-Semantic-Search-System/`.
- `supabase/` contains SQL and helper scripts for Supabase setup and cleanup.

## Current admin capabilities

- Search/index status overview
- Recent ingest activity
- Metadata editing for stored documents
- Delete flow that removes Supabase metadata/storage and rebuilds the local index from remaining bucket files
- Local cache/index reset
- Citation and BibTeX copy support in the frontend

## Run locally

### Backend

```powershell
.\.venv\Scripts\python.exe backend\run.py
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

## Env templates

- Frontend env template: `frontend/.env.example`
- Backend env template: `backend/.env.example`
