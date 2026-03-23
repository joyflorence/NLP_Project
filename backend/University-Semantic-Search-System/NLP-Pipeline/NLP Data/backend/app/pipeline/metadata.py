"""Metadata generation and repair module."""
import pandas as pd
import re
from pathlib import Path
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


def infer_year_from_filename(filename: str) -> Optional[int]:
    """Extract year from filename using regex."""
    # Look for 4-digit years (19xx or 20xx)
    matches = re.findall(r'\b(19\d{2}|20\d{2})\b', filename)
    if matches:
        return int(matches[-1])  # Take the last match (most likely the document year)
    return None


def infer_document_type(filename: str) -> str:
    """Infer document type from filename keywords."""
    filename_lower = filename.lower()
    
    if any(kw in filename_lower for kw in ['dissertation', 'diss']):
        return 'dissertation'
    elif any(kw in filename_lower for kw in ['thesis', 'thes']):
        return 'thesis'
    elif any(kw in filename_lower for kw in ['proposal', 'prop']):
        return 'proposal'
    elif any(kw in filename_lower for kw in ['outline', 'course']):
        return 'outline'
    elif any(kw in filename_lower for kw in ['notes', 'lecture']):
        return 'notes'
    elif any(kw in filename_lower for kw in ['article', 'paper']):
        return 'article'
    elif any(kw in filename_lower for kw in ['report', 'rpt']):
        return 'report'
    else:
        return 'report'  # default


def clean_title_from_filename(filename: str) -> str:
    """Generate a clean title from filename."""
    # Remove extension
    title = Path(filename).stem
    # Replace underscores and hyphens with spaces
    title = title.replace('_', ' ').replace('-', ' ')
    # Clean up multiple spaces
    title = re.sub(r'\s+', ' ', title).strip()
    return title


def generate_doc_id(index: int) -> str:
    """Generate deterministic doc_id (DOC0001, DOC0002, ...)."""
    return f"DOC{index:04d}"


def scan_pdfs(pdf_dir: Path) -> List[Dict[str, str]]:
    """Scan PDF directory and return list of PDF files with metadata."""
    pdf_files = sorted(pdf_dir.glob("*.pdf"))
    pdfs_data = []
    
    for pdf_file in pdf_files:
        filename = pdf_file.name
        pdfs_data.append({
            'file_name': filename,
            'file_path': str(pdf_file),
        })
    
    return pdfs_data


def generate_or_repair_metadata(
    pdf_dir: Path,
    metadata_path: Path,
    required_columns: List[str] = None
) -> pd.DataFrame:
    """
    Generate metadata.csv if missing, or repair existing one.
    
    Args:
        pdf_dir: Directory containing PDFs
        metadata_path: Path to metadata.csv
        required_columns: Required columns in metadata
        
    Returns:
        DataFrame with complete metadata
    """
    if required_columns is None:
        required_columns = ['doc_id', 'file_name', 'title', 'year', 'department', 
                          'program', 'document_type']
    
    # Scan all PDFs
    pdfs_data = scan_pdfs(pdf_dir)
    logger.info(f"Found {len(pdfs_data)} PDF files in {pdf_dir}")
    
    # Load existing metadata if it exists
    existing_metadata = None
    if metadata_path.exists():
        try:
            existing_metadata = pd.read_csv(metadata_path)
            logger.info(f"Loaded existing metadata with {len(existing_metadata)} rows")
        except Exception as e:
            logger.warning(f"Could not load existing metadata: {e}. Generating new one.")
            existing_metadata = None
    
    # Create new metadata entries
    new_entries = []
    existing_file_names = set()
    
    if existing_metadata is not None:
        existing_file_names = set(existing_metadata['file_name'].values)
        # Keep valid existing rows
        for _, row in existing_metadata.iterrows():
            file_path = pdf_dir / row['file_name']
            if file_path.exists() and pd.notna(row.get('doc_id')):
                new_entries.append(row.to_dict())
    
    # Add missing PDFs
    max_doc_id = 0
    if new_entries:
        # Find max doc_id
        for entry in new_entries:
            if 'doc_id' in entry and pd.notna(entry['doc_id']):
                match = re.match(r'DOC(\d+)', str(entry['doc_id']))
                if match:
                    max_doc_id = max(max_doc_id, int(match.group(1)))
    
    for pdf_data in pdfs_data:
        filename = pdf_data['file_name']
        if filename not in existing_file_names:
            # Generate new entry
            max_doc_id += 1
            doc_id = generate_doc_id(max_doc_id)
            
            year = infer_year_from_filename(filename)
            doc_type = infer_document_type(filename)
            title = clean_title_from_filename(filename)
            
            entry = {
                'doc_id': doc_id,
                'file_name': filename,
                'title': title,
                'year': year if year else None,
                'department': 'Unknown',
                'program': 'Unknown',
                'document_type': doc_type,
            }
            
            # Add optional columns if they exist in existing metadata
            if existing_metadata is not None:
                for col in ['author', 'supervisor', 'keywords']:
                    if col in existing_metadata.columns:
                        entry[col] = None
            
            new_entries.append(entry)
            logger.info(f"Generated metadata for new PDF: {filename} -> {doc_id}")
    
    # Create DataFrame
    metadata_df = pd.DataFrame(new_entries)
    
    # Ensure all required columns exist
    for col in required_columns:
        if col not in metadata_df.columns:
            metadata_df[col] = None
    
    # Ensure doc_id uniqueness
    if 'doc_id' in metadata_df.columns:
        # Check for duplicates
        duplicates = metadata_df[metadata_df.duplicated(subset=['doc_id'], keep=False)]
        if len(duplicates) > 0:
            logger.warning(f"Found {len(duplicates)} duplicate doc_ids. Regenerating...")
            # Regenerate doc_ids
            metadata_df = metadata_df.sort_values('file_name')
            metadata_df['doc_id'] = [generate_doc_id(i+1) for i in range(len(metadata_df))]
    
    # Ensure one row per PDF
    metadata_df = metadata_df.drop_duplicates(subset=['file_name'], keep='first')
    
    # Sort by doc_id
    if 'doc_id' in metadata_df.columns:
        metadata_df = metadata_df.sort_values('doc_id').reset_index(drop=True)
    
    logger.info(f"Final metadata has {len(metadata_df)} entries")
    return metadata_df


def validate_metadata(metadata_df: pd.DataFrame, pdf_dir: Path) -> tuple[bool, List[str]]:
    """
    Validate metadata DataFrame.
    
    Returns:
        (is_valid, list_of_errors)
    """
    errors = []
    required_columns = ['doc_id', 'file_name', 'title', 'year', 'department', 
                       'program', 'document_type']
    
    # Check required columns
    missing_cols = [col for col in required_columns if col not in metadata_df.columns]
    if missing_cols:
        errors.append(f"Missing required columns: {missing_cols}")
    
    # Check doc_id uniqueness
    if 'doc_id' in metadata_df.columns:
        duplicates = metadata_df[metadata_df.duplicated(subset=['doc_id'], keep=False)]
        if len(duplicates) > 0:
            errors.append(f"Duplicate doc_ids found: {duplicates['doc_id'].tolist()}")
    
    # Check file existence
    if 'file_name' in metadata_df.columns:
        missing_files = []
        for _, row in metadata_df.iterrows():
            file_path = pdf_dir / row['file_name']
            if not file_path.exists():
                missing_files.append(row['file_name'])
        if missing_files:
            errors.append(f"Missing PDF files: {missing_files[:5]}...")  # Show first 5
    
    # Check for null doc_ids
    if 'doc_id' in metadata_df.columns:
        null_doc_ids = metadata_df[metadata_df['doc_id'].isna()]
        if len(null_doc_ids) > 0:
            errors.append(f"Found {len(null_doc_ids)} rows with null doc_id")
    
    is_valid = len(errors) == 0
    return is_valid, errors
