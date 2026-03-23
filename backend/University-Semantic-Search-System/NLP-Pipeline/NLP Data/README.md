# NLP Indexing Pipeline for University Semantic Search System

A production-grade, reproducible, and deployable NLP indexing pipeline for semantic search over university documents.

## Overview

This pipeline processes PDF documents through a complete workflow:
1. **Metadata Generation/Repair** - Automatically generates or repairs metadata from PDFs
2. **Text Extraction** - Extracts text using PyMuPDF with pdfplumber fallback
3. **Text Cleaning** - Normalizes and cleans extracted text, extracts abstracts
4. **Duplicate Detection** - Identifies exact and near-duplicate documents
5. **Chunking** - Creates paragraph-aware chunks with overlap
6. **Embedding Generation** - Generates embeddings using sentence-transformers
7. **FAISS Indexing** - Builds searchable vector index
8. **QA & Reporting** - Validates outputs and generates comprehensive reports

## Installation

### Prerequisites

- Python 3.8 or higher
- pip

### Setup

1. **Install dependencies:**

```bash
pip install -r requirements.txt
```

2. **Organize your PDFs:**

Place all PDF files in `data/raw_pdfs/` directory. If PDFs are in the root directory, move them:

```bash
# Windows PowerShell
Move-Item *.pdf data/raw_pdfs/
```

3. **Configure (optional):**

Edit `config/pipeline_config.yaml` to customize settings like chunk sizes, embedding model, etc.

## Usage

### Command-Line Interface

The pipeline provides a CLI with individual commands or a complete run:

```bash
# Run complete pipeline (recommended for first run)
python -m backend.app.pipeline.cli all

# Or run individual steps:
python -m backend.app.pipeline.cli validate    # Validate metadata
python -m backend.app.pipeline.cli extract      # Extract text from PDFs
python -m backend.app.pipeline.cli clean       # Clean extracted text
python -m backend.app.pipeline.cli chunk       # Create chunks
python -m backend.app.pipeline.cli embed       # Generate embeddings
python -m backend.app.pipeline.cli index        # Build FAISS index
```

### Configuration

The pipeline uses `config/pipeline_config.yaml` for configuration. Key settings:

- **Chunking**: `target_words`, `min_words`, `max_words`, `overlap_words`
- **Embeddings**: `model_name`, `batch_size`, `device` (cpu/cuda)
- **Extraction**: `min_word_count` (threshold for scanned PDF detection)

### Output Structure

After running the pipeline, you'll find:

```
artifacts/
├── extracted_text/          # Raw extracted text per document
├── cleaned_text/            # Cleaned text and abstracts
├── chunks/                  # Per-document and combined chunks (JSONL)
├── embeddings/              # Embeddings (numpy), chunk map, metadata
├── indexes/                 # FAISS index and index report
└── reports/                 # All pipeline reports and summary
    ├── extraction_report.csv
    ├── cleaning_report.csv
    ├── chunking_report.csv
    ├── duplicates_report.csv
    └── pipeline_summary.md

data/
└── metadata.csv             # Generated/updated metadata
```

## Pipeline Steps

### Step 0: Metadata Generation/Repair

- Scans `data/raw_pdfs/` for all PDF files
- Generates `data/metadata.csv` if missing
- Repairs existing metadata (adds missing PDFs, fixes invalid rows)
- Infers: doc_id, title, year, document_type from filenames
- Sets department/program to "Unknown" if not inferable

### Step 1: Text Extraction

- Uses PyMuPDF (fitz) as primary extractor
- Falls back to pdfplumber if extraction fails or is too short
- Detects suspected scanned PDFs (word count < threshold)
- Saves extracted text to `artifacts/extracted_text/{doc_id}.txt`

### Step 2: Text Cleaning

- Unicode normalization (NFKC)
- Whitespace normalization
- Removes hyphenation artifacts
- Removes page numbers and headers/footers
- Removes References/Bibliography sections
- Extracts abstracts (best-effort)
- Saves to `artifacts/cleaned_text/{doc_id}.txt` and `{doc_id}.abstract.txt`

### Step 3: Duplicate Detection

- Exact duplicates: SHA256 file hash comparison
- Near-duplicates: TF-IDF cosine similarity (threshold: 0.95)
- Outputs `artifacts/reports/duplicates_report.csv`

### Step 4: Chunking

- Paragraph-aware chunking
- Target: 300-400 words per chunk (configurable)
- Overlap: 50-80 words (configurable)
- Sentence boundary awareness
- Saves per-document and combined chunks (JSONL format)

### Step 5: Embedding Generation

- Uses sentence-transformers (default: `all-MiniLM-L6-v2`)
- Batch processing with progress tracking
- L2-normalized embeddings for cosine similarity
- Saves embeddings, chunk map, and metadata

### Step 6: FAISS Indexing

- Builds IndexFlatIP (inner product = cosine for normalized vectors)
- Validates vector count
- Saves index and build report

### Step 7: QA & Reporting

- Checks embeddings for NaNs/Infs
- Validates chunk size distributions
- Generates comprehensive pipeline summary

## Features

- **Automatic Metadata Generation**: No manual metadata entry required
- **Robust Error Handling**: Continues processing even if individual PDFs fail
- **Idempotent**: Re-running overwrites artifacts cleanly
- **Comprehensive Reporting**: Detailed reports at each step
- **Configurable**: YAML-based configuration for all parameters
- **Production-Ready**: Logging, error handling, validation

## Troubleshooting

### PDFs not found

Ensure PDFs are in `data/raw_pdfs/` directory. The pipeline will create this directory if it doesn't exist.

### Low word count warnings

PDFs with very low word counts (< 50 by default) are flagged as potentially scanned. Consider OCR for these documents.

### Memory issues

- Reduce `batch_size` in embedding configuration
- Process documents in batches
- Use CPU instead of GPU if memory constrained

### Duplicate detection slow

Near-duplicate detection uses TF-IDF which can be slow for large document sets. Consider increasing the similarity threshold or disabling it for initial runs.

## License

This pipeline is designed for university semantic search systems.

## Support

For issues or questions, check the pipeline logs in `artifacts/reports/pipeline.log`.
