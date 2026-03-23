"""PDF text extraction module with PyMuPDF and pdfplumber fallback."""
import fitz  # PyMuPDF
import pdfplumber
from pathlib import Path
import pandas as pd
import logging
from typing import Dict, Optional
from tqdm import tqdm

logger = logging.getLogger(__name__)


def extract_with_pymupdf(pdf_path: Path, max_pages: int = 1000) -> tuple[str, bool]:
    """
    Extract text using PyMuPDF (fitz).
    
    Args:
        pdf_path: Path to PDF file
        max_pages: Maximum number of pages to process (skip very large PDFs)
    
    Returns:
        (extracted_text, success)
    """
    try:
        # Check file size - skip very large files (>100MB) that might be problematic
        file_size = pdf_path.stat().st_size
        if file_size > 100 * 1024 * 1024:  # 100MB
            logger.warning(f"PDF too large ({file_size / (1024*1024):.1f}MB), skipping: {pdf_path.name}")
            return "", False
        
        doc = fitz.open(pdf_path)
        num_pages = len(doc)
        
        # Skip PDFs with too many pages (likely problematic)
        if num_pages > max_pages:
            logger.warning(f"PDF has too many pages ({num_pages}), skipping: {pdf_path.name}")
            doc.close()
            return "", False
        
        text_parts = []
        # Process pages with early exit if we get substantial text
        for page_num in range(min(num_pages, max_pages)):
            try:
                page = doc[page_num]
                text = page.get_text()
                if text:
                    text_parts.append(text)
                # Early exit if we have enough text (first 50 pages)
                if page_num >= 50 and len(' '.join(text_parts)) > 10000:
                    break
            except Exception as e:
                logger.debug(f"Error extracting page {page_num} from {pdf_path.name}: {e}")
                continue
        
        doc.close()
        full_text = "\n".join(text_parts)
        return full_text, True
    except Exception as e:
        logger.error(f"PyMuPDF extraction failed for {pdf_path.name}: {str(e)[:100]}")
        return "", False


def extract_with_pdfplumber(pdf_path: Path, max_pages: int = 1000) -> tuple[str, bool]:
    """
    Extract text using pdfplumber.
    
    Args:
        pdf_path: Path to PDF file
        max_pages: Maximum number of pages to process
    
    Returns:
        (extracted_text, success)
    """
    try:
        # Check file size
        file_size = pdf_path.stat().st_size
        if file_size > 100 * 1024 * 1024:  # 100MB
            logger.warning(f"PDF too large ({file_size / (1024*1024):.1f}MB), skipping: {pdf_path.name}")
            return "", False
        
        text_parts = []
        with pdfplumber.open(pdf_path) as pdf:
            num_pages = len(pdf.pages)
            if num_pages > max_pages:
                logger.warning(f"PDF has too many pages ({num_pages}), skipping: {pdf_path.name}")
                return "", False
            
            for i, page in enumerate(pdf.pages[:max_pages]):
                try:
                    text = page.extract_text()
                    if text:
                        text_parts.append(text)
                    # Early exit for large PDFs
                    if i >= 50 and len(' '.join(text_parts)) > 10000:
                        break
                except Exception as e:
                    logger.debug(f"Error extracting page {i} from {pdf_path.name}: {e}")
                    continue
        
        full_text = "\n".join(text_parts)
        return full_text, True
    except Exception as e:
        logger.error(f"pdfplumber extraction failed for {pdf_path.name}: {str(e)[:100]}")
        return "", False


def extract_text(
    pdf_path: Path,
    primary_extractor: str = "pymupdf",
    fallback_extractor: str = "pdfplumber",
    min_word_count: int = 50
) -> Dict[str, any]:
    """
    Extract text from PDF with fallback mechanism.
    
    Returns:
        Dictionary with 'text', 'extractor_used', 'word_count', 'scanned_suspected', 'error'
    """
    result = {
        'text': '',
        'extractor_used': None,
        'word_count': 0,
        'scanned_suspected': False,
        'error': None
    }
    
    # Try primary extractor
    if primary_extractor == "pymupdf":
        text, success = extract_with_pymupdf(pdf_path, max_pages=1000)
        if success and text.strip():
            result['text'] = text
            result['extractor_used'] = 'pymupdf'
        else:
            # Try fallback
            if fallback_extractor == "pdfplumber":
                text, success = extract_with_pdfplumber(pdf_path, max_pages=1000)
                if success and text.strip():
                    result['text'] = text
                    result['extractor_used'] = 'pdfplumber'
                else:
                    result['error'] = 'Both extractors failed'
            else:
                result['error'] = 'Primary extractor failed, no fallback'
    elif primary_extractor == "pdfplumber":
        text, success = extract_with_pdfplumber(pdf_path, max_pages=1000)
        if success and text.strip():
            result['text'] = text
            result['extractor_used'] = 'pdfplumber'
        else:
            # Try fallback
            if fallback_extractor == "pymupdf":
                text, success = extract_with_pymupdf(pdf_path, max_pages=1000)
                if success and text.strip():
                    result['text'] = text
                    result['extractor_used'] = 'pymupdf'
                else:
                    result['error'] = 'Both extractors failed'
            else:
                result['error'] = 'Primary extractor failed, no fallback'
    else:
        result['error'] = f'Unknown extractor: {primary_extractor}'
    
    # Calculate word count
    if result['text']:
        words = result['text'].split()
        result['word_count'] = len(words)
        result['scanned_suspected'] = result['word_count'] < min_word_count
    
    return result


def extract_all_pdfs(
    metadata_df: pd.DataFrame,
    pdf_dir: Path,
    output_dir: Path,
    config: Dict
) -> pd.DataFrame:
    """
    Extract text from all PDFs in metadata.
    
    Returns:
        DataFrame with extraction report
    """
    extraction_config = config.get('extraction', {})
    primary_extractor = extraction_config.get('primary_extractor', 'pymupdf')
    fallback_extractor = extraction_config.get('fallback_extractor', 'pdfplumber')
    min_word_count = extraction_config.get('min_word_count', 50)
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    report_rows = []
    total_docs = len(metadata_df)
    
    # Use tqdm for progress indication
    progress_bar = tqdm(total=total_docs, desc="Extracting PDFs", unit="doc")
    
    for idx, row in metadata_df.iterrows():
        doc_id = row['doc_id']
        file_name = row['file_name']
        pdf_path = pdf_dir / file_name
        
        progress_bar.set_description(f"Extracting: {file_name[:30]}...")
        
        # Update progress bar
        progress_bar.update(1)
        
        if not pdf_path.exists():
            logger.warning(f"PDF not found: {pdf_path}")
            report_rows.append({
                'doc_id': doc_id,
                'file_name': file_name,
                'extractor_used': None,
                'word_count': 0,
                'scanned_suspected': False,
                'error': 'File not found',
                'success': False
            })
            continue
        
        # Extract text
        result = extract_text(
            pdf_path,
            primary_extractor=primary_extractor,
            fallback_extractor=fallback_extractor,
            min_word_count=min_word_count
        )
        
        # Save extracted text
        output_file = output_dir / f"{doc_id}.txt"
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(result['text'])
        except Exception as e:
            logger.error(f"Failed to save extracted text for {doc_id}: {e}")
            result['error'] = f"Save error: {e}"
        
        # Record in report
        report_rows.append({
            'doc_id': doc_id,
            'file_name': file_name,
            'extractor_used': result['extractor_used'],
            'word_count': result['word_count'],
            'scanned_suspected': result['scanned_suspected'],
            'error': result['error'],
            'success': result['extractor_used'] is not None
        })
        
        if result['error']:
            logger.warning(f"Extraction issue for {doc_id}: {result['error']}")
        else:
            logger.debug(f"Extracted {result['word_count']} words from {doc_id}")
    
    progress_bar.close()
    report_df = pd.DataFrame(report_rows)
    
    # Print summary
    successful = report_df['success'].sum() if 'success' in report_df.columns else 0
    logger.info(f"Extraction complete: {successful}/{total_docs} successful")
    
    return report_df
