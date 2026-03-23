# NLP Pipeline Summary Report

**Generated:** 2026-02-26 09:38:15

## Overview
- **Total Documents:** 173
- **PDF Directory:** c:\Users\USER\Desktop\NLP Data\Collected_Data
- **Artifacts Directory:** `artifacts/`

## System and Library Versions
- **Python Version:** 3.13.5
- **Platform:** Windows-11-10.0.26100-SP0
- **Numpy:** 2.3.5
- **Pandas:** 2.3.3
- **Torch:** 2.10.0+cpu
- **Tensorflow:** 2.20.0
- **Scikit-Learn:** 1.7.2
- **Sentence-Transformers:** 5.2.3
- **Faiss:** 1.13.2
- **Transformers:** 5.2.0

## Text Extraction
- **Successful Extractions:** 168/173
- **Failed Extractions:** 5
- **Scanned PDFs Suspected:** 2
- **Average Words per Document:** 8606
- **Extractors Used:**
  - pymupdf: 168

## Text Cleaning
- **Total Original Words:** 1,488,776
- **Total Cleaned Words:** 1,389,969
- **Reduction:** 6.6%
- **Abstracts Extracted:** 49

## Chunking
- **Total Chunks:** 4,306
- **Average Chunk Size:** 345.1 words
- **Min Chunk Size:** 0 words
- **Max Chunk Size:** 1148 words

## Duplicate Detection
- **Exact Duplicate Groups:** 4
- **Near-Duplicate Pairs:** 4
- **Total Duplicate Records:** 10

## Embeddings
- **Model:** sentence-transformers/all-MiniLM-L6-v2
- **Dimension:** 384
- **Number of Embeddings:** 4,306
- **Normalized:** True
- **Quality Checks:**
  - Has NaN: False
  - Has Inf: False
  - Mean: -0.0006
  - Std: 0.0510

## FAISS Index
- **Index Type:** IndexFlatIP
- **Vectors Indexed:** 4,306
- **Dimension:** 384
- **Build Time:** 0.04 seconds
- **Index File:** `c:\Users\USER\Desktop\NLP Data\artifacts\indexes\chunk.index.faiss`

## Output Artifacts
### Metadata
- `c:\Users\USER\Desktop\NLP Data\data\metadata.csv`

### Extracted Text
- `c:\Users\USER\Desktop\NLP Data\artifacts\extracted_text/{doc_id}.txt`

### Cleaned Text
- `c:\Users\USER\Desktop\NLP Data\artifacts\cleaned_text/{doc_id}.txt`
- `c:\Users\USER\Desktop\NLP Data\artifacts\cleaned_text/{doc_id}.abstract.txt` (if available)

### Chunks
- `c:\Users\USER\Desktop\NLP Data\artifacts\chunks/{doc_id}.jsonl`
- `c:\Users\USER\Desktop\NLP Data\artifacts\chunks/all_chunks.jsonl`

### Embeddings
- `c:\Users\USER\Desktop\NLP Data\artifacts\embeddings/embeddings.npy`
- `c:\Users\USER\Desktop\NLP Data\artifacts\embeddings/chunk_map.json`
- `c:\Users\USER\Desktop\NLP Data\artifacts\embeddings/embeddings_meta.json`

### Indexes
- `c:\Users\USER\Desktop\NLP Data\artifacts\indexes/chunk.index.faiss`
- `c:\Users\USER\Desktop\NLP Data\artifacts\indexes/index_report.json`

### Reports
- `c:\Users\USER\Desktop\NLP Data\artifacts\reports/extraction_report.csv`
- `c:\Users\USER\Desktop\NLP Data\artifacts\reports/cleaning_report.csv`
- `c:\Users\USER\Desktop\NLP Data\artifacts\reports/chunking_report.csv`
- `c:\Users\USER\Desktop\NLP Data\artifacts\reports/duplicates_report.csv`
- `c:\Users\USER\Desktop\NLP Data\artifacts\reports/pipeline_summary.md`

### EDA Visualizations
- `c:\Users\USER\Desktop\NLP Data\artifacts\reports/document_length_distribution.png`
- `c:\Users\USER\Desktop\NLP Data\artifacts\reports/chunk_size_distribution.png`
- `c:\Users\USER\Desktop\NLP Data\artifacts\reports/chunks_per_document.png`
- `c:\Users\USER\Desktop\NLP Data\artifacts\reports/document_type_distribution.png`
- `c:\Users\USER\Desktop\NLP Data\artifacts\reports/year_distribution.png`
- `c:\Users\USER\Desktop\NLP Data\artifacts\reports/embedding_projection.png`
