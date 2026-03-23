"""Text cleaning and normalization module."""
import re
import unicodedata
from pathlib import Path
import pandas as pd
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


def normalize_unicode(text: str) -> str:
    """Normalize Unicode to NFKC form."""
    return unicodedata.normalize('NFKC', text)


def normalize_whitespace(text: str) -> str:
    """Normalize whitespace and newlines."""
    # Replace various whitespace characters with standard space
    text = re.sub(r'[\t\r\f\v]+', ' ', text)
    # Normalize multiple spaces to single space
    text = re.sub(r' +', ' ', text)
    # Normalize multiple newlines to double newline (paragraph break)
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Clean up spaces around newlines
    text = re.sub(r' +\n', '\n', text)
    text = re.sub(r'\n +', '\n', text)
    return text.strip()


def remove_hyphenation_artifacts(text: str) -> str:
    """Remove hyphenation artifacts from line breaks."""
    # Pattern: word ending with hyphen followed by newline and lowercase letter
    # This catches cases like "exam-\nple" -> "example"
    text = re.sub(r'(\w+)-\s*\n\s*([a-z])', r'\1\2', text, flags=re.MULTILINE)
    # Also handle cases with spaces: "exam- \nple"
    text = re.sub(r'(\w+)-\s+\n\s+([a-z])', r'\1\2', text, flags=re.MULTILINE)
    return text


def remove_page_numbers(text: str) -> str:
    """Remove page numbers using heuristics."""
    # Remove standalone numbers at start/end of lines (likely page numbers)
    # Pattern: line with just a number (1-3 digits) possibly with whitespace
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        # Skip lines that are just numbers (1-4 digits) or "Page X"
        if re.match(r'^\d{1,4}$', stripped):
            continue
        if re.match(r'^[Pp]age\s+\d+$', stripped):
            continue
        cleaned_lines.append(line)
    return '\n'.join(cleaned_lines)


def remove_repeated_lines(text: str, min_repeats: int = 3) -> str:
    """Remove repeated lines (likely headers/footers)."""
    lines = text.split('\n')
    if len(lines) < min_repeats:
        return text
    
    # Count line occurrences
    line_counts = {}
    for line in lines:
        stripped = line.strip()
        if len(stripped) > 5:  # Only consider substantial lines
            line_counts[stripped] = line_counts.get(stripped, 0) + 1
    
    # Remove lines that appear too frequently
    repeated_lines = {line for line, count in line_counts.items() 
                     if count >= min_repeats}
    
    if repeated_lines:
        cleaned_lines = [line for line in lines 
                        if line.strip() not in repeated_lines]
        return '\n'.join(cleaned_lines)
    
    return text


def remove_references_section(text: str) -> str:
    """Remove References/Bibliography section."""
    # Find References or Bibliography heading (case-insensitive)
    patterns = [
        r'\n\s*(?:References|Bibliography|Works\s+Cited|References\s+and\s+Bibliography)\s*\n',
        r'\n\s*(?:REFERENCES|BIBLIOGRAPHY|WORKS\s+CITED)\s*\n',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
        if match:
            # Cut text at the match position
            text = text[:match.start()]
            logger.debug("Removed References/Bibliography section")
            break
    
    return text


def extract_abstract(text: str) -> Optional[str]:
    """Extract abstract section if present."""
    # Look for ABSTRACT heading (case-insensitive)
    # Pattern: "ABSTRACT" or "Abstract" followed by content until next major heading
    patterns = [
        r'\n\s*ABSTRACT\s*\n\s*(.*?)(?=\n\s*(?:INTRODUCTION|1\.|CHAPTER|SECTION|BACKGROUND)\s*\n)',
        r'\n\s*Abstract\s*\n\s*(.*?)(?=\n\s*(?:INTRODUCTION|1\.|CHAPTER|SECTION|BACKGROUND)\s*\n)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL | re.MULTILINE)
        if match:
            abstract = match.group(1).strip()
            # Clean up the abstract
            abstract = normalize_whitespace(abstract)
            if len(abstract) > 50:  # Reasonable minimum length
                return abstract
    
    return None


def clean_text(text: str, config: Dict) -> Dict[str, any]:
    """
    Clean and normalize text according to configuration.
    
    Returns:
        Dictionary with 'cleaned_text', 'abstract', 'word_count', 'original_word_count'
    """
    cleaning_config = config.get('cleaning', {})
    original_word_count = len(text.split())
    
    cleaned = text
    
    if cleaning_config.get('normalize_unicode', True):
        cleaned = normalize_unicode(cleaned)
    
    if cleaning_config.get('remove_hyphenation', True):
        cleaned = remove_hyphenation_artifacts(cleaned)
    
    if cleaning_config.get('remove_page_numbers', True):
        cleaned = remove_page_numbers(cleaned)
    
    # Remove repeated lines (headers/footers)
    cleaned = remove_repeated_lines(cleaned)
    
    # Normalize whitespace
    cleaned = normalize_whitespace(cleaned)
    
    if cleaning_config.get('remove_references', True) or cleaning_config.get('remove_bibliography', True):
        cleaned = remove_references_section(cleaned)
    
    # Extract abstract if requested
    abstract = None
    if cleaning_config.get('abstract_detection', True):
        abstract = extract_abstract(cleaned)
    
    cleaned_word_count = len(cleaned.split())
    
    return {
        'cleaned_text': cleaned,
        'abstract': abstract,
        'word_count': cleaned_word_count,
        'original_word_count': original_word_count
    }


def clean_all_texts(
    metadata_df: pd.DataFrame,
    extracted_text_dir: Path,
    cleaned_text_dir: Path,
    config: Dict
) -> pd.DataFrame:
    """
    Clean all extracted texts.
    
    Returns:
        DataFrame with cleaning report
    """
    cleaned_text_dir.mkdir(parents=True, exist_ok=True)
    cleaning_config = config.get('cleaning', {})
    
    report_rows = []
    
    for idx, row in metadata_df.iterrows():
        doc_id = row['doc_id']
        extracted_file = extracted_text_dir / f"{doc_id}.txt"
        
        logger.info(f"Cleaning text for {doc_id}...")
        
        if not extracted_file.exists():
            logger.warning(f"Extracted text not found: {extracted_file}")
            report_rows.append({
                'doc_id': doc_id,
                'original_word_count': 0,
                'cleaned_word_count': 0,
                'abstract_extracted': False,
                'error': 'Extracted text file not found'
            })
            continue
        
        try:
            # Read extracted text
            with open(extracted_file, 'r', encoding='utf-8') as f:
                extracted_text = f.read()
            
            # Clean text
            result = clean_text(extracted_text, config)
            
            # Save cleaned text
            cleaned_file = cleaned_text_dir / f"{doc_id}.txt"
            with open(cleaned_file, 'w', encoding='utf-8') as f:
                f.write(result['cleaned_text'])
            
            # Save abstract if found
            abstract_extracted = result['abstract'] is not None
            if abstract_extracted:
                abstract_file = cleaned_text_dir / f"{doc_id}.abstract.txt"
                with open(abstract_file, 'w', encoding='utf-8') as f:
                    f.write(result['abstract'])
            
            report_rows.append({
                'doc_id': doc_id,
                'original_word_count': result['original_word_count'],
                'cleaned_word_count': result['word_count'],
                'abstract_extracted': abstract_extracted,
                'error': None
            })
            
            logger.info(f"Cleaned {doc_id}: {result['original_word_count']} -> {result['word_count']} words")
            if abstract_extracted:
                logger.info(f"Abstract extracted for {doc_id}")
        
        except Exception as e:
            logger.error(f"Error cleaning text for {doc_id}: {e}")
            report_rows.append({
                'doc_id': doc_id,
                'original_word_count': 0,
                'cleaned_word_count': 0,
                'abstract_extracted': False,
                'error': str(e)
            })
    
    report_df = pd.DataFrame(report_rows)
    return report_df
