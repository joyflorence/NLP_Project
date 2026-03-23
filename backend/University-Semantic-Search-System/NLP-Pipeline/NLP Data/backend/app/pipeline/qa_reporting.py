"""QA checks and final reporting module."""
import json
import numpy as np
import pandas as pd
from pathlib import Path
import logging
from typing import Dict, Optional
from datetime import datetime

from .reproducibility import get_system_versions

logger = logging.getLogger(__name__)


def check_embeddings_quality(embeddings_file: Path) -> Dict[str, any]:
    """Check embeddings for NaNs, infs, and other quality issues."""
    logger.info("Checking embeddings quality...")
    
    embeddings = np.load(embeddings_file)
    
    checks = {
        'has_nan': bool(np.isnan(embeddings).any()),
        'has_inf': bool(np.isinf(embeddings).any()),
        'shape': list(embeddings.shape),
        'mean': float(np.mean(embeddings)),
        'std': float(np.std(embeddings)),
        'min': float(np.min(embeddings)),
        'max': float(np.max(embeddings))
    }
    
    if checks['has_nan']:
        logger.warning("Found NaN values in embeddings!")
    if checks['has_inf']:
        logger.warning("Found Inf values in embeddings!")
    
    return checks


def generate_pipeline_summary(
    config: Dict,
    metadata_df: pd.DataFrame,
    extraction_report: pd.DataFrame,
    cleaning_report: pd.DataFrame,
    chunking_report: pd.DataFrame,
    duplicates_report: pd.DataFrame,
    embeddings_meta: Dict = None,
    index_report: Dict = None,
    embeddings_quality: Dict = None
) -> str:
    """Generate comprehensive pipeline summary markdown."""
    
    summary_lines = []
    summary_lines.append("# NLP Pipeline Summary Report")
    summary_lines.append(f"\n**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    # Overview
    summary_lines.append("## Overview")
    summary_lines.append(f"- **Total Documents:** {len(metadata_df)}")
    summary_lines.append(f"- **PDF Directory:** {config['paths']['raw_pdfs']}")
    summary_lines.append(f"- **Artifacts Directory:** `artifacts/`\n")
    
    # System and Library Versions
    summary_lines.append("## System and Library Versions")
    versions = get_system_versions()
    for key, value in versions.items():
        summary_lines.append(f"- **{key.replace('_', ' ').title()}:** {value}")
    summary_lines.append("")
    
    # Extraction Summary
    summary_lines.append("## Text Extraction")
    if len(extraction_report) > 0:
        successful = extraction_report['success'].sum()
        failed = len(extraction_report) - successful
        scanned_suspected = extraction_report['scanned_suspected'].sum()
        avg_words = extraction_report['word_count'].mean()
        
        summary_lines.append(f"- **Successful Extractions:** {successful}/{len(extraction_report)}")
        summary_lines.append(f"- **Failed Extractions:** {failed}")
        summary_lines.append(f"- **Scanned PDFs Suspected:** {scanned_suspected}")
        summary_lines.append(f"- **Average Words per Document:** {avg_words:.0f}")
        
        extractors_used = extraction_report['extractor_used'].value_counts()
        if len(extractors_used) > 0:
            summary_lines.append(f"- **Extractors Used:**")
            for ext, count in extractors_used.items():
                summary_lines.append(f"  - {ext}: {count}")
    summary_lines.append("")
    
    # Cleaning Summary
    summary_lines.append("## Text Cleaning")
    if len(cleaning_report) > 0:
        total_original = cleaning_report['original_word_count'].sum()
        total_cleaned = cleaning_report['cleaned_word_count'].sum()
        abstracts_extracted = cleaning_report['abstract_extracted'].sum()
        
        summary_lines.append(f"- **Total Original Words:** {total_original:,}")
        summary_lines.append(f"- **Total Cleaned Words:** {total_cleaned:,}")
        summary_lines.append(f"- **Reduction:** {((total_original - total_cleaned) / total_original * 100):.1f}%")
        summary_lines.append(f"- **Abstracts Extracted:** {abstracts_extracted}")
    summary_lines.append("")
    
    # Chunking Summary
    summary_lines.append("## Chunking")
    if len(chunking_report) > 0:
        total_chunks = chunking_report['chunk_count'].sum()
        avg_chunk_size = chunking_report['avg_chunk_size'].mean()
        min_chunk_size = chunking_report['min_chunk_size'].min()
        max_chunk_size = chunking_report['max_chunk_size'].max()
        
        summary_lines.append(f"- **Total Chunks:** {total_chunks:,}")
        summary_lines.append(f"- **Average Chunk Size:** {avg_chunk_size:.1f} words")
        summary_lines.append(f"- **Min Chunk Size:** {min_chunk_size} words")
        summary_lines.append(f"- **Max Chunk Size:** {max_chunk_size} words")
    summary_lines.append("")
    
    # Duplicates Summary
    summary_lines.append("## Duplicate Detection")
    if len(duplicates_report) > 0:
        exact_duplicates = len(duplicates_report[duplicates_report['duplicate_type'] == 'exact'])
        near_duplicates = len(duplicates_report[duplicates_report['duplicate_type'] == 'near'])
        duplicate_groups = duplicates_report['duplicate_group_id'].nunique()
        
        summary_lines.append(f"- **Exact Duplicate Groups:** {duplicate_groups}")
        summary_lines.append(f"- **Near-Duplicate Pairs:** {near_duplicates}")
        summary_lines.append(f"- **Total Duplicate Records:** {len(duplicates_report)}")
    else:
        summary_lines.append("- **No duplicates detected**")
    summary_lines.append("")
    
    # Embeddings Summary
    summary_lines.append("## Embeddings")
    if embeddings_meta:
        summary_lines.append(f"- **Model:** {embeddings_meta['model_name']}")
        summary_lines.append(f"- **Dimension:** {embeddings_meta['embedding_dim']}")
        summary_lines.append(f"- **Number of Embeddings:** {embeddings_meta['num_chunks']:,}")
        summary_lines.append(f"- **Normalized:** {embeddings_meta['normalized']}")
    
    if embeddings_quality:
        summary_lines.append(f"- **Quality Checks:**")
        summary_lines.append(f"  - Has NaN: {embeddings_quality['has_nan']}")
        summary_lines.append(f"  - Has Inf: {embeddings_quality['has_inf']}")
        summary_lines.append(f"  - Mean: {embeddings_quality['mean']:.4f}")
        summary_lines.append(f"  - Std: {embeddings_quality['std']:.4f}")
    summary_lines.append("")
    
    # FAISS Index Summary
    summary_lines.append("## FAISS Index")
    if index_report:
        summary_lines.append(f"- **Index Type:** {index_report['index_type']}")
        summary_lines.append(f"- **Vectors Indexed:** {index_report['num_vectors']:,}")
        summary_lines.append(f"- **Dimension:** {index_report['dimension']}")
        summary_lines.append(f"- **Build Time:** {index_report['build_time_seconds']:.2f} seconds")
        summary_lines.append(f"- **Index File:** `{index_report['index_file']}`")
    summary_lines.append("")
    
    # Artifacts
    summary_lines.append("## Output Artifacts")
    summary_lines.append("### Metadata")
    summary_lines.append(f"- `{config['paths']['metadata']}`")
    summary_lines.append("")
    summary_lines.append("### Extracted Text")
    summary_lines.append(f"- `{config['paths']['extracted_text']}/{{doc_id}}.txt`")
    summary_lines.append("")
    summary_lines.append("### Cleaned Text")
    summary_lines.append(f"- `{config['paths']['cleaned_text']}/{{doc_id}}.txt`")
    summary_lines.append(f"- `{config['paths']['cleaned_text']}/{{doc_id}}.abstract.txt` (if available)")
    summary_lines.append("")
    summary_lines.append("### Chunks")
    summary_lines.append(f"- `{config['paths']['chunks']}/{{doc_id}}.jsonl`")
    summary_lines.append(f"- `{config['paths']['chunks']}/all_chunks.jsonl`")
    summary_lines.append("")
    summary_lines.append("### Embeddings")
    summary_lines.append(f"- `{config['paths']['embeddings']}/chunk_embeddings.npy`")
    summary_lines.append(f"- `{config['paths']['embeddings']}/doc_embeddings.npy` (if enabled)")
    summary_lines.append(f"- `{config['paths']['embeddings']}/abstract_embeddings.npy` (if enabled)")
    summary_lines.append(f"- `{config['paths']['embeddings']}/chunk_map.json`")
    summary_lines.append(f"- `{config['paths']['embeddings']}/embeddings_meta.json`")
    summary_lines.append("")
    summary_lines.append("### Indexes")
    summary_lines.append(f"- `{config['paths']['indexes']}/chunk.index.faiss`")
    summary_lines.append(f"- `{config['paths']['indexes']}/index_meta.json`")
    summary_lines.append(f"- `{config['paths']['indexes']}/index_report.json`")
    summary_lines.append("")
    summary_lines.append("### Reports")
    summary_lines.append(f"- `{config['paths']['reports']}/extraction_report.csv`")
    summary_lines.append(f"- `{config['paths']['reports']}/cleaning_report.csv`")
    summary_lines.append(f"- `{config['paths']['reports']}/chunking_report.csv`")
    summary_lines.append(f"- `{config['paths']['reports']}/duplicates_report.csv`")
    summary_lines.append(f"- `{config['paths']['reports']}/pipeline_summary.md`")
    summary_lines.append("")
    
    # EDA Visualizations
    summary_lines.append("### EDA Visualizations")
    summary_lines.append(f"- `{config['paths']['reports']}/document_length_distribution.png`")
    summary_lines.append(f"- `{config['paths']['reports']}/chunk_size_distribution.png`")
    summary_lines.append(f"- `{config['paths']['reports']}/chunks_per_document.png`")
    summary_lines.append(f"- `{config['paths']['reports']}/document_type_distribution.png`")
    summary_lines.append(f"- `{config['paths']['reports']}/year_distribution.png`")
    summary_lines.append(f"- `{config['paths']['reports']}/embedding_projection.png`")
    summary_lines.append("")
    
    # Abstract Embeddings Strategy
    if embeddings_meta and embeddings_meta.get('abstract_embeddings_generated', False):
        summary_lines.append("## Abstract Embedding Strategy")
        summary_lines.append("Abstract embeddings have been generated separately from chunk embeddings.")
        summary_lines.append("These can be used in Part B to weight abstract similarity higher in ranking.")
        summary_lines.append("")
    
    return '\n'.join(summary_lines)


def run_qa_checks(
    config: Dict,
    embeddings_file: Path,
    chunking_report: pd.DataFrame
) -> Dict[str, any]:
    """Run all QA checks."""
    logger.info("Running QA checks...")
    
    results = {}
    
    # Check embeddings
    if embeddings_file.exists():
        results['embeddings_quality'] = check_embeddings_quality(embeddings_file)
    else:
        logger.warning(f"Embeddings file not found: {embeddings_file}")
        results['embeddings_quality'] = None
    
    # Check chunk size distribution
    if len(chunking_report) > 0:
        chunk_sizes = []
        for _, row in chunking_report.iterrows():
            # Estimate chunk sizes from report
            if pd.notna(row.get('avg_chunk_size')):
                chunk_sizes.append(row['avg_chunk_size'])
        
        if chunk_sizes:
            results['chunk_distribution'] = {
                'min': float(min(chunk_sizes)),
                'max': float(max(chunk_sizes)),
                'mean': float(np.mean(chunk_sizes)),
                'std': float(np.std(chunk_sizes))
            }
        else:
            results['chunk_distribution'] = None
    else:
        results['chunk_distribution'] = None
    
    return results
