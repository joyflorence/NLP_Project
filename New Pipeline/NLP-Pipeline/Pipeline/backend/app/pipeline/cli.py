"""Command-line interface for the NLP pipeline."""
import argparse
import sys
import logging
from pathlib import Path
import pandas as pd
import json

from .config_loader import load_config
from .metadata import generate_or_repair_metadata, validate_metadata
from .extraction import extract_all_pdfs
from .cleaning import clean_all_texts
from .duplicates import detect_all_duplicates
from .chunking import chunk_all_documents
from .embeddings import generate_embeddings, generate_abstract_embeddings
from .faiss_index import build_faiss_index
from .qa_reporting import run_qa_checks, generate_pipeline_summary
from .eda_visualizations import generate_all_eda_plots
from .reproducibility import fix_random_seeds, log_system_versions


def setup_logging(config: dict):
    """Setup logging configuration."""
    log_config = config.get('logging', {})
    log_level = getattr(logging, log_config.get('level', 'INFO'))
    log_file = log_config.get('log_file', 'artifacts/reports/pipeline.log')
    
    # Create log directory if needed
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)
    
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )


def cmd_validate(args, config):
    """Validate metadata."""
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("VALIDATE: Metadata validation")
    logger.info("=" * 60)
    
    pdf_dir = Path(config['paths']['raw_pdfs'])
    metadata_path = Path(config['paths']['metadata'])
    
    if not metadata_path.exists():
        logger.error(f"Metadata file not found: {metadata_path}")
        logger.info("Run 'all' command to generate metadata first.")
        return False
    
    metadata_df = pd.read_csv(metadata_path)
    is_valid, errors = validate_metadata(metadata_df, pdf_dir)
    
    if is_valid:
        logger.info("✓ Metadata validation passed!")
        return True
    else:
        logger.error("✗ Metadata validation failed:")
        for error in errors:
            logger.error(f"  - {error}")
        return False


def cmd_extract(args, config):
    """Extract text from PDFs."""
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("EXTRACT: PDF text extraction")
    logger.info("=" * 60)
    
    pdf_dir = Path(config['paths']['raw_pdfs'])
    metadata_path = Path(config['paths']['metadata'])
    output_dir = Path(config['paths']['extracted_text'])
    reports_dir = Path(config['paths']['reports'])
    
    # Load metadata
    if not metadata_path.exists():
        logger.error(f"Metadata file not found: {metadata_path}")
        logger.info("Run 'all' command to generate metadata first.")
        return False
    
    metadata_df = pd.read_csv(metadata_path)
    
    # Extract
    extraction_report = extract_all_pdfs(metadata_df, pdf_dir, output_dir, config)
    
    # Save report
    reports_dir.mkdir(parents=True, exist_ok=True)
    report_file = reports_dir / "extraction_report.csv"
    extraction_report.to_csv(report_file, index=False)
    logger.info(f"Saved extraction report to {report_file}")
    
    return True


def cmd_clean(args, config):
    """Clean extracted text."""
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("CLEAN: Text cleaning and normalization")
    logger.info("=" * 60)
    
    metadata_path = Path(config['paths']['metadata'])
    extracted_text_dir = Path(config['paths']['extracted_text'])
    cleaned_text_dir = Path(config['paths']['cleaned_text'])
    reports_dir = Path(config['paths']['reports'])
    
    # Load metadata
    if not metadata_path.exists():
        logger.error(f"Metadata file not found: {metadata_path}")
        return False
    
    metadata_df = pd.read_csv(metadata_path)
    
    # Clean
    cleaning_report = clean_all_texts(metadata_df, extracted_text_dir, cleaned_text_dir, config)
    
    # Save report
    reports_dir.mkdir(parents=True, exist_ok=True)
    report_file = reports_dir / "cleaning_report.csv"
    cleaning_report.to_csv(report_file, index=False)
    logger.info(f"Saved cleaning report to {report_file}")
    
    return True


def cmd_chunk(args, config):
    """Chunk cleaned texts."""
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("CHUNK: Text chunking")
    logger.info("=" * 60)
    
    metadata_path = Path(config['paths']['metadata'])
    cleaned_text_dir = Path(config['paths']['cleaned_text'])
    chunks_dir = Path(config['paths']['chunks'])
    reports_dir = Path(config['paths']['reports'])
    
    # Load metadata
    if not metadata_path.exists():
        logger.error(f"Metadata file not found: {metadata_path}")
        return False
    
    metadata_df = pd.read_csv(metadata_path)
    
    # Chunk
    chunking_report = chunk_all_documents(metadata_df, cleaned_text_dir, chunks_dir, config)
    
    # Save report
    reports_dir.mkdir(parents=True, exist_ok=True)
    report_file = reports_dir / "chunking_report.csv"
    chunking_report.to_csv(report_file, index=False)
    logger.info(f"Saved chunking report to {report_file}")
    
    return True


def cmd_embed(args, config):
    """Generate embeddings."""
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("EMBED: Embedding generation")
    logger.info("=" * 60)
    
    chunks_file = Path(config['paths']['chunks']) / "all_chunks.jsonl"
    output_dir = Path(config['paths']['embeddings'])
    
    if not chunks_file.exists():
        logger.error(f"Chunks file not found: {chunks_file}")
        logger.info("Run 'chunk' command first.")
        return False
    
    # Generate embeddings
    result = generate_embeddings(chunks_file, output_dir, config)
    
    logger.info("Embedding generation completed!")
    return True


def cmd_index(args, config):
    """Build FAISS index."""
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("INDEX: FAISS index building")
    logger.info("=" * 60)
    
    embeddings_file = Path(config['paths']['embeddings']) / "chunk_embeddings.npy"
    output_dir = Path(config['paths']['indexes'])
    
    if not embeddings_file.exists():
        logger.error(f"Embeddings file not found: {embeddings_file}")
        logger.info("Run 'embed' command first.")
        return False
    
    # Build index
    index_report = build_faiss_index(embeddings_file, output_dir, config)
    
    logger.info("FAISS index building completed!")
    return True


def cmd_all(args, config):
    """Run complete pipeline."""
    logger = logging.getLogger(__name__)
    logger.info("=" * 60)
    logger.info("ALL: Running complete NLP pipeline")
    logger.info("=" * 60)
    
    # Setup reproducibility
    repro_config = config.get('reproducibility', {})
    seed = repro_config.get('random_seed', 42)
    fix_all = repro_config.get('fix_all_seeds', True)
    if fix_all:
        fix_random_seeds(seed, fix_all)
    
    # Log system versions
    log_system_versions()
    
    # Step 0: Metadata generation/repair
    logger.info("\n[Step 0] Metadata generation/repair...")
    pdf_dir = Path(config['paths']['raw_pdfs'])
    metadata_path = Path(config['paths']['metadata'])
    
    metadata_df = generate_or_repair_metadata(pdf_dir, metadata_path)
    metadata_df.to_csv(metadata_path, index=False)
    logger.info(f"Metadata saved to {metadata_path}")
    
    # Validate
    is_valid, errors = validate_metadata(metadata_df, pdf_dir)
    if not is_valid:
        logger.warning("Metadata validation issues (continuing anyway):")
        for error in errors:
            logger.warning(f"  - {error}")
    
    # Step 1: Extract
    logger.info("\n[Step 1] PDF text extraction...")
    output_dir = Path(config['paths']['extracted_text'])
    reports_dir = Path(config['paths']['reports'])
    reports_dir.mkdir(parents=True, exist_ok=True)
    
    extraction_report = extract_all_pdfs(metadata_df, pdf_dir, output_dir, config)
    extraction_report.to_csv(reports_dir / "extraction_report.csv", index=False)
    
    # Step 2: Clean
    logger.info("\n[Step 2] Text cleaning...")
    cleaned_text_dir = Path(config['paths']['cleaned_text'])
    cleaning_report = clean_all_texts(metadata_df, output_dir, cleaned_text_dir, config)
    cleaning_report.to_csv(reports_dir / "cleaning_report.csv", index=False)
    
    # Generate EDA plots after cleaning
    logger.info("\n[Step 2.5] Generating EDA visualizations (after cleaning)...")
    generate_all_eda_plots(
        config, metadata_df, cleaning_report, 
        pd.DataFrame(),  # Empty chunking report for now
        all_chunks_file=None
    )
    
    # Step 3: Duplicates
    logger.info("\n[Step 3] Duplicate detection...")
    duplicates_report = detect_all_duplicates(metadata_df, pdf_dir, cleaned_text_dir, config)
    if len(duplicates_report) > 0:
        duplicates_report.to_csv(reports_dir / "duplicates_report.csv", index=False)
    else:
        # Create empty report
        pd.DataFrame().to_csv(reports_dir / "duplicates_report.csv", index=False)
    
    # Step 4: Chunk
    logger.info("\n[Step 4] Text chunking...")
    chunks_dir = Path(config['paths']['chunks'])
    chunking_report = chunk_all_documents(metadata_df, cleaned_text_dir, chunks_dir, config)
    chunking_report.to_csv(reports_dir / "chunking_report.csv", index=False)
    
    # Update metadata with chunk statistics
    logger.info("\n[Step 4.5] Updating metadata with chunk statistics...")
    if 'chunk_count' in chunking_report.columns and 'total_words' in chunking_report.columns:
        chunk_stats = chunking_report.set_index('doc_id')[['chunk_count', 'total_words']].to_dict('index')
        for doc_id in metadata_df['doc_id']:
            if doc_id in chunk_stats:
                metadata_df.loc[metadata_df['doc_id'] == doc_id, 'total_chunk_count'] = chunk_stats[doc_id]['chunk_count']
                metadata_df.loc[metadata_df['doc_id'] == doc_id, 'total_word_count'] = chunk_stats[doc_id]['total_words']
        metadata_df.to_csv(metadata_path, index=False)
        logger.info("Metadata updated with chunk statistics")
    
    # Generate EDA plots after chunking
    logger.info("\n[Step 4.6] Generating EDA visualizations (after chunking)...")
    all_chunks_file = chunks_dir / "all_chunks.jsonl"
    generate_all_eda_plots(
        config, metadata_df, cleaning_report, chunking_report,
        all_chunks_file=all_chunks_file if all_chunks_file.exists() else None
    )
    
    # Step 5: Embed
    logger.info("\n[Step 5] Embedding generation...")
    chunks_file = chunks_dir / "all_chunks.jsonl"
    embeddings_dir = Path(config['paths']['embeddings'])
    embeddings_result = generate_embeddings(chunks_file, embeddings_dir, config)
    
    # Generate abstract embeddings
    logger.info("\n[Step 5.5] Generating abstract embeddings...")
    abstract_embeddings_result = generate_abstract_embeddings(
        metadata_df, cleaned_text_dir, embeddings_dir, config
    )
    if abstract_embeddings_result:
        # Update embeddings metadata
        embeddings_meta_file = embeddings_dir / "embeddings_meta.json"
        if embeddings_meta_file.exists():
            with open(embeddings_meta_file, 'r', encoding='utf-8') as f:
                embeddings_meta = json.load(f)
            embeddings_meta['abstract_embeddings_generated'] = True
            embeddings_meta['num_abstracts'] = abstract_embeddings_result['num_abstracts']
            with open(embeddings_meta_file, 'w', encoding='utf-8') as f:
                json.dump(embeddings_meta, f, indent=2, ensure_ascii=False)
    
    # Generate embedding space visualization
    logger.info("\n[Step 5.6] Generating embedding space visualization...")
    embeddings_file = embeddings_dir / "chunk_embeddings.npy"
    chunk_map_file = embeddings_dir / "chunk_map.json"
    if embeddings_file.exists() and chunk_map_file.exists():
        from .eda_visualizations import plot_embedding_space_visualization
        plot_embedding_space_visualization(
            embeddings_file, chunk_map_file, metadata_df,
            reports_dir / "embedding_projection.png",
            method='pca'
        )
    
    # Step 6: Index
    logger.info("\n[Step 6] FAISS index building...")
    embeddings_file = embeddings_dir / "chunk_embeddings.npy"
    indexes_dir = Path(config['paths']['indexes'])
    index_report = build_faiss_index(embeddings_file, indexes_dir, config)
    
    # Log index integrity check result
    if index_report.get('integrity_check', {}).get('passed', False):
        logger.info("✓ Index integrity check passed")
    else:
        logger.warning("⚠ Index integrity check failed or had issues")
    
    # Step 7: QA and Summary
    logger.info("\n[Step 7] QA checks and summary generation...")
    qa_results = run_qa_checks(config, embeddings_file, chunking_report)
    
    # Load embeddings metadata
    embeddings_meta_file = embeddings_dir / "embeddings_meta.json"
    embeddings_meta = None
    if embeddings_meta_file.exists():
        with open(embeddings_meta_file, 'r') as f:
            embeddings_meta = json.load(f)
    
    # Generate summary
    summary = generate_pipeline_summary(
        config,
        metadata_df,
        extraction_report,
        cleaning_report,
        chunking_report,
        duplicates_report,
        embeddings_meta=embeddings_meta,
        index_report=index_report,
        embeddings_quality=qa_results.get('embeddings_quality')
    )
    
    summary_file = reports_dir / "pipeline_summary.md"
    with open(summary_file, 'w', encoding='utf-8') as f:
        f.write(summary)
    logger.info(f"Pipeline summary saved to {summary_file}")
    
    logger.info("\n" + "=" * 60)
    logger.info("Pipeline completed successfully!")
    logger.info("=" * 60)
    
    return True


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description='NLP Indexing Pipeline for University Semantic Search System'
    )
    parser.add_argument(
        'command',
        choices=['validate', 'extract', 'clean', 'chunk', 'embed', 'index', 'all'],
        help='Pipeline command to execute'
    )
    parser.add_argument(
        '--config',
        type=str,
        default='config/pipeline_config.yaml',
        help='Path to configuration file'
    )
    
    args = parser.parse_args()
    
    # Load config
    config = load_config(args.config)
    
    # Setup logging
    setup_logging(config)
    
    # Execute command
    command_map = {
        'validate': cmd_validate,
        'extract': cmd_extract,
        'clean': cmd_clean,
        'chunk': cmd_chunk,
        'embed': cmd_embed,
        'index': cmd_index,
        'all': cmd_all
    }
    
    success = command_map[args.command](args, config)
    
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
