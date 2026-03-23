#!/usr/bin/env python3
"""
Automated NLP Pipeline Runner

This script runs the complete NLP indexing pipeline for the university semantic search system.
It processes PDFs through all stages: metadata generation, extraction, cleaning, chunking,
embedding generation, and FAISS indexing.

Usage:
    python run_pipeline.py [--config CONFIG_PATH]

Example:
    python run_pipeline.py
    python run_pipeline.py --config config/custom_config.yaml
"""

import argparse
import sys
import logging
from pathlib import Path
from datetime import datetime

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from backend.app.pipeline.config_loader import load_config
from backend.app.pipeline.metadata import generate_or_repair_metadata, validate_metadata
from backend.app.pipeline.extraction import extract_all_pdfs
from backend.app.pipeline.cleaning import clean_all_texts
from backend.app.pipeline.duplicates import detect_all_duplicates
from backend.app.pipeline.chunking import chunk_all_documents
from backend.app.pipeline.embeddings import generate_embeddings, generate_abstract_embeddings
from backend.app.pipeline.faiss_index import build_faiss_index
from backend.app.pipeline.qa_reporting import run_qa_checks, generate_pipeline_summary
from backend.app.pipeline.eda_visualizations import generate_all_eda_plots
from backend.app.pipeline.reproducibility import fix_random_seeds, log_system_versions
import pandas as pd


def setup_logging(config: dict):
    """Setup logging configuration."""
    log_config = config.get('logging', {})
    log_level = getattr(logging, log_config.get('level', 'INFO'))
    log_file = log_config.get('log_file', 'artifacts/logs/pipeline.log')
    
    # Create log directory if needed
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)
    
    # Configure logging
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    
    return logging.getLogger(__name__)


def run_pipeline(config_path: str = 'config/pipeline_config.yaml'):
    """
    Run the complete NLP indexing pipeline.
    
    Args:
        config_path: Path to the configuration YAML file
        
    Returns:
        bool: True if pipeline completed successfully, False otherwise
    """
    # Load configuration
    print("=" * 80)
    print("NLP INDEXING PIPELINE - AUTOMATED RUNNER")
    print("=" * 80)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Configuration: {config_path}")
    print("=" * 80)
    
    try:
        config = load_config(config_path)
    except Exception as e:
        print(f"❌ ERROR: Failed to load configuration from {config_path}")
        print(f"   {e}")
        return False
    
    # Setup logging
    logger = setup_logging(config)
    logger.info("=" * 80)
    logger.info("NLP INDEXING PIPELINE - AUTOMATED RUNNER")
    logger.info("=" * 80)
    
    try:
        # Setup reproducibility
        repro_config = config.get('reproducibility', {})
        seed = repro_config.get('random_seed', 42)
        fix_all = repro_config.get('fix_all_seeds', True)
        if fix_all:
            fix_random_seeds(seed, fix_all)
            logger.info(f"Random seed set to {seed} for reproducibility")
        
        # Log system versions
        log_system_versions()
        
        # Step 0: Metadata generation/repair
        logger.info("\n" + "=" * 80)
        logger.info("[Step 0] Metadata generation/repair")
        logger.info("=" * 80)
        pdf_dir = Path(config['paths']['raw_pdfs'])
        metadata_path = Path(config['paths']['metadata'])
        
        if not pdf_dir.exists():
            logger.error(f"PDF directory not found: {pdf_dir}")
            return False
        
        metadata_df = generate_or_repair_metadata(pdf_dir, metadata_path)
        metadata_df.to_csv(metadata_path, index=False)
        logger.info(f"✓ Metadata saved to {metadata_path} ({len(metadata_df)} documents)")
        
        # Validate metadata
        is_valid, errors = validate_metadata(metadata_df, pdf_dir)
        if not is_valid:
            logger.warning("Metadata validation issues (continuing anyway):")
            for error in errors[:5]:  # Show first 5 errors
                logger.warning(f"  - {error}")
        
        # Step 1: Extract
        logger.info("\n" + "=" * 80)
        logger.info("[Step 1] PDF text extraction")
        logger.info("=" * 80)
        output_dir = Path(config['paths']['extracted_text'])
        reports_dir = Path(config['paths']['reports'])
        reports_dir.mkdir(parents=True, exist_ok=True)
        
        extraction_report = extract_all_pdfs(metadata_df, pdf_dir, output_dir, config)
        extraction_report.to_csv(reports_dir / "extraction_report.csv", index=False)
        successful = extraction_report['success'].sum() if len(extraction_report) > 0 else 0
        logger.info(f"✓ Extraction completed: {successful}/{len(extraction_report)} successful")
        
        # Step 2: Clean
        logger.info("\n" + "=" * 80)
        logger.info("[Step 2] Text cleaning and normalization")
        logger.info("=" * 80)
        cleaned_text_dir = Path(config['paths']['cleaned_text'])
        cleaning_report = clean_all_texts(metadata_df, output_dir, cleaned_text_dir, config)
        cleaning_report.to_csv(reports_dir / "cleaning_report.csv", index=False)
        logger.info(f"✓ Cleaning completed: {len(cleaning_report)} documents processed")
        
        # Generate EDA plots after cleaning
        logger.info("\n[Step 2.5] Generating EDA visualizations (after cleaning)...")
        generate_all_eda_plots(
            config, metadata_df, cleaning_report, 
            pd.DataFrame(),  # Empty chunking report for now
            all_chunks_file=None
        )
        
        # Step 3: Duplicates
        logger.info("\n" + "=" * 80)
        logger.info("[Step 3] Duplicate detection")
        logger.info("=" * 80)
        duplicates_report = detect_all_duplicates(metadata_df, pdf_dir, cleaned_text_dir, config)
        if len(duplicates_report) > 0:
            duplicates_report.to_csv(reports_dir / "duplicates_report.csv", index=False)
            logger.info(f"✓ Found {len(duplicates_report)} duplicate records")
        else:
            pd.DataFrame().to_csv(reports_dir / "duplicates_report.csv", index=False)
            logger.info("✓ No duplicates found")
        
        # Step 4: Chunk
        logger.info("\n" + "=" * 80)
        logger.info("[Step 4] Text chunking")
        logger.info("=" * 80)
        chunks_dir = Path(config['paths']['chunks'])
        chunking_report = chunk_all_documents(metadata_df, cleaned_text_dir, chunks_dir, config)
        chunking_report.to_csv(reports_dir / "chunking_report.csv", index=False)
        total_chunks = chunking_report['chunk_count'].sum() if len(chunking_report) > 0 else 0
        logger.info(f"✓ Chunking completed: {total_chunks:,} total chunks")
        
        # Update metadata with chunk statistics
        logger.info("\n[Step 4.5] Updating metadata with chunk statistics...")
        if 'chunk_count' in chunking_report.columns and 'total_words' in chunking_report.columns:
            chunk_stats = chunking_report.set_index('doc_id')[['chunk_count', 'total_words']].to_dict('index')
            for doc_id in metadata_df['doc_id']:
                if doc_id in chunk_stats:
                    metadata_df.loc[metadata_df['doc_id'] == doc_id, 'total_chunk_count'] = chunk_stats[doc_id]['chunk_count']
                    metadata_df.loc[metadata_df['doc_id'] == doc_id, 'total_word_count'] = chunk_stats[doc_id]['total_words']
            metadata_df.to_csv(metadata_path, index=False)
            logger.info("✓ Metadata updated with chunk statistics")
        
        # Generate EDA plots after chunking
        logger.info("\n[Step 4.6] Generating EDA visualizations (after chunking)...")
        all_chunks_file = chunks_dir / "all_chunks.jsonl"
        generate_all_eda_plots(
            config, metadata_df, cleaning_report, chunking_report,
            all_chunks_file=all_chunks_file if all_chunks_file.exists() else None
        )
        
        # Step 5: Embed
        logger.info("\n" + "=" * 80)
        logger.info("[Step 5] Embedding generation")
        logger.info("=" * 80)
        chunks_file = chunks_dir / "all_chunks.jsonl"
        embeddings_dir = Path(config['paths']['embeddings'])
        
        if not chunks_file.exists():
            logger.error(f"Chunks file not found: {chunks_file}")
            return False
        
        embeddings_result = generate_embeddings(chunks_file, embeddings_dir, config)
        logger.info(f"✓ Embeddings generated: {embeddings_result['metadata']['num_chunks']:,} chunks")
        
        # Generate abstract embeddings
        logger.info("\n[Step 5.5] Generating abstract embeddings...")
        abstract_embeddings_result = generate_abstract_embeddings(
            metadata_df, cleaned_text_dir, embeddings_dir, config
        )
        if abstract_embeddings_result:
            logger.info(f"✓ Abstract embeddings generated: {abstract_embeddings_result['num_abstracts']} abstracts")
            # Update embeddings metadata
            embeddings_meta_file = embeddings_dir / "embeddings_meta.json"
            if embeddings_meta_file.exists():
                import json
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
            from backend.app.pipeline.eda_visualizations import plot_embedding_space_visualization
            plot_embedding_space_visualization(
                embeddings_file, chunk_map_file, metadata_df,
                reports_dir / "embedding_projection.png",
                method='pca'
            )
            logger.info("✓ Embedding space visualization generated")
        
        # Step 6: Index
        logger.info("\n" + "=" * 80)
        logger.info("[Step 6] FAISS index building")
        logger.info("=" * 80)
        embeddings_file = embeddings_dir / "chunk_embeddings.npy"
        indexes_dir = Path(config['paths']['indexes'])
        
        if not embeddings_file.exists():
            logger.error(f"Embeddings file not found: {embeddings_file}")
            return False
        
        index_report = build_faiss_index(embeddings_file, indexes_dir, config)
        logger.info(f"✓ FAISS index built: {index_report['num_vectors']:,} vectors indexed")
        
        # Log index integrity check result
        if index_report.get('integrity_check', {}).get('passed', False):
            logger.info("✓ Index integrity check passed")
        else:
            logger.warning("⚠ Index integrity check failed or had issues")
        
        # Step 7: QA and Summary
        logger.info("\n" + "=" * 80)
        logger.info("[Step 7] QA checks and summary generation")
        logger.info("=" * 80)
        qa_results = run_qa_checks(config, embeddings_file, chunking_report)
        
        # Load embeddings metadata
        embeddings_meta_file = embeddings_dir / "embeddings_meta.json"
        embeddings_meta = None
        if embeddings_meta_file.exists():
            import json
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
        logger.info(f"✓ Pipeline summary saved to {summary_file}")
        
        # Final success message
        logger.info("\n" + "=" * 80)
        logger.info("✓ PIPELINE COMPLETED SUCCESSFULLY")
        logger.info("=" * 80)
        logger.info(f"Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info(f"Summary report: {summary_file}")
        logger.info("=" * 80)
        
        print("\n" + "=" * 80)
        print("✓ PIPELINE COMPLETED SUCCESSFULLY")
        print("=" * 80)
        print(f"Summary report: {summary_file}")
        print("=" * 80)
        
        return True
        
    except KeyboardInterrupt:
        logger.warning("\n⚠ Pipeline interrupted by user")
        print("\n⚠ Pipeline interrupted by user")
        return False
    except Exception as e:
        logger.error(f"\n❌ Pipeline failed with error: {e}", exc_info=True)
        print(f"\n❌ Pipeline failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Automated NLP Indexing Pipeline Runner',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_pipeline.py
  python run_pipeline.py --config config/custom_config.yaml
        """
    )
    parser.add_argument(
        '--config',
        type=str,
        default='config/pipeline_config.yaml',
        help='Path to configuration file (default: config/pipeline_config.yaml)'
    )
    
    args = parser.parse_args()
    
    # Run pipeline
    success = run_pipeline(args.config)
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
