**University Academic Semantic Search System**

A production-grade, deployable semantic search and analytics platform for university academic documents (theses, dissertations, proposals, course outlines, and reports.

This system enables meaning-based retrieval, document similarity recommendations, and academic knowledge reuse across departments.

Project Overview

Universities store large volumes of unstructured academic documents in PDF format. Traditional search systems rely on filename or keyword matching, which often fails to capture semantic meaning.

This project implements a Transformer-based Semantic Search System that allows users to:

Search academic documents using natural language

Retrieve semantically relevant results (not just keyword matches)

Discover similar or related academic works

Filter results by department, year, or document type

Analyze corpus characteristics

System Architecture

The system consists of three main components:

1️ NLP Indexing Pipeline
2️ Semantic Search Engine (Online Retrieval)
3️ Web Application (User Interface)

Architecture Flow

PDF Documents
      ↓
Text Extraction
      ↓
Cleaning & Normalization
      ↓
Chunking
      ↓
Embedding Generation (Transformer Model)
      ↓
FAISS Vector Index
      ↓
Semantic Search Engine
      ↓
Web Application Interface
Repository Structure
artifacts/
   chunks/
   cleaned_text/
   embeddings/
   extracted_text/
   indexes/
   reports/
   logs/

backend/
   app/
      pipeline/         # NLP indexing pipeline (Part A)
      search/           # Semantic engine (Part B)
   requirements.txt

config/
   pipeline_config.yaml

data/
   raw_pdfs/            # Input PDFs
   metadata.csv         # Generated/validated metadata

evaluation/
   queries.json
   relevance_labels.json

frontend/               # Web application (React)

pipeline_report.ipynb   # EDA and analysis notebook
README.md
