# System Architecture

## **System Architecture Overview**

The University Semantic Search System is a full-stack web application that enables semantic search across academic documents using natural language processing and vector similarity. It combines modern web technologies with an embedded NLP pipeline for document processing and retrieval.

## **Core Components**

### **1. Frontend Layer (React/TypeScript)**
- **Technology Stack**: React 18, TypeScript, Vite, React Router, Supabase JS Client
- **Location**: `frontend/` directory
- **Key Responsibilities**:
  - User interface for semantic search queries
  - Document upload and ingestion workflow
  - Admin management interface (document editing, reindexing, deletion)
  - User authentication and library management
  - Document preview and citation generation
  - Search result display with filtering and sorting

### **2. Backend API Layer (FastAPI/Python)**
- **Technology Stack**: FastAPI, Uvicorn, Python, httpx, python-dotenv, Supabase Python Client
- **Location**: `backend/app/` directory
- **Key Responsibilities**:
  - REST API endpoints for search, ingestion, and admin operations
  - Integration with embedded semantic engine
  - Document download and signed URL generation
  - Background polling of Supabase storage for new documents
  - User authentication and authorization
  - Admin workflow management

### **3. Data Persistence Layer (Supabase)**
- **Technology Stack**: PostgreSQL, Supabase Auth, Supabase Storage
- **Location**: `supabase/` directory (SQL schemas and policies)
- **Key Components**:
  - **Authentication**: User login/signup with role-based access
  - **Storage Bucket**: "academic-docs" bucket for PDF file storage
  - **Documents Table**: Metadata storage (title, author, year, department, level, supervisor, etc.)
  - **Saved Documents Table**: User library/bookmark functionality
  - **Recent Activity Table**: Audit log for admin operations
  - **Row Level Security (RLS)**: Database-level access control

### **4. Semantic Engine Layer (Embedded NLP Pipeline)**
- **Technology Stack**: Python, PyTorch, Sentence Transformers, FAISS, PyMuPDF, pdfplumber
- **Location**: `backend/University-Semantic-Search-System/NLP-Pipeline/NLP Data/`
- **Key Components**:
  - **PDF Text Extraction**: PyMuPDF (primary) + pdfplumber (fallback)
  - **Text Processing**: Cleaning, normalization, and chunking
  - **Embedding Generation**: sentence-transformers/all-MiniLM-L6-v2 model
  - **Vector Storage**: FAISS (local) or Pinecone (cloud) for similarity search
  - **Duplicate Detection**: Hash-based exact matching + TF-IDF similarity for near-duplicates

## **Data Flow Architecture**

### **Document Ingestion Flow**
1. **Upload**: User uploads PDF via React frontend → Supabase Storage bucket
2. **Metadata Extraction**: Backend fetches PDF via signed URL → NLP pipeline extracts text
3. **Processing**: Text cleaning → duplicate detection → chunking (configurable sizes)
4. **Embedding**: Convert text chunks to vectors using Sentence Transformers
5. **Indexing**: Store vectors in FAISS index with metadata mapping
6. **Persistence**: Save document metadata to Supabase documents table

### **Search Query Flow**
1. **Query Input**: User enters natural language query in React UI
2. **Preprocessing**: Frontend sends query to FastAPI backend
3. **Embedding**: Backend converts query to vector using same Sentence Transformers model
4. **Similarity Search**: Query vector compared against FAISS index → retrieve top-K similar chunks
5. **Aggregation**: Group chunk results back to source documents
6. **Enrichment**: Merge with Supabase metadata (title, author, year, etc.)
7. **Filtering/Sorting**: Apply user filters (year, department, level) and sort preferences
8. **Response**: Return paginated results to frontend for display

### **Admin Management Flow**
1. **Document Management**: Admin can view/edit/delete documents via React admin panel
2. **Metadata Updates**: Changes sync between Supabase table and local cache
3. **Reindexing**: Trigger full reprocessing of document through NLP pipeline
4. **Cache Management**: Reset local FAISS index and rebuild from Supabase storage
5. **Activity Logging**: All admin actions logged to recent_activity table

## **Key Architectural Patterns**

### **Hybrid Cloud-Local Design**
- **Cloud Components**: Authentication, file storage, metadata persistence (Supabase)
- **Local Components**: Semantic indexing, vector search, NLP processing (FAISS + embedded engine)
- **Benefits**: Cost-effective for academic projects, works offline, demonstrates both paradigms

### **Background Processing**
- **Supabase Polling**: Background task monitors storage bucket for new uploads
- **Asynchronous Ingestion**: Document processing happens in background threads
- **Cache Management**: Local artifacts (PDFs, indexes, caches) managed separately from cloud data

### **Separation of Concerns**
- **Frontend**: Pure UI/UX, no business logic
- **Backend API**: Request routing, authentication, service orchestration
- **Semantic Engine**: Pure NLP/vector operations, no web concerns
- **Data Layer**: Persistence and access control

### **Duplicate Prevention**
- **Content Hashing**: SHA-256 of document content prevents exact duplicates
- **Filename Normalization**: Case-insensitive matching across frontend/backend
- **Near-Duplicate Detection**: TF-IDF similarity for similar documents

## **Deployment Architecture**

### **Development Environment**
- **Frontend**: Vite dev server (localhost:5173)
- **Backend**: FastAPI server with auto-reload
- **Database**: Local Supabase instance or cloud Supabase project
- **NLP Engine**: Local FAISS indexes and cached artifacts


## **Security & Access Control**
- **Authentication**: Supabase Auth with JWT tokens
- **Authorization**: Role-based access (admin vs regular users)
- **API Security**: CORS configuration, request validation
- **Data Security**: Row Level Security in Supabase, signed URLs for file access
- **Admin Operations**: Protected endpoints requiring admin authorization

