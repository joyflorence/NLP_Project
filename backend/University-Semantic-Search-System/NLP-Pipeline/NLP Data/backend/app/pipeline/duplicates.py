"""Duplicate detection module."""
import hashlib
from pathlib import Path
import pandas as pd
import logging
from typing import List, Dict, Tuple
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)


def compute_file_hash(file_path: Path) -> str:
    """Compute SHA256 hash of file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def detect_exact_duplicates(
    metadata_df: pd.DataFrame,
    pdf_dir: Path
) -> pd.DataFrame:
    """
    Detect exact duplicates using file hash.
    
    Returns:
        DataFrame with duplicate groups
    """
    logger.info("Detecting exact duplicates using file hash...")
    
    hash_to_files = {}
    
    for idx, row in metadata_df.iterrows():
        doc_id = row['doc_id']
        file_name = row['file_name']
        pdf_path = pdf_dir / file_name
        
        if not pdf_path.exists():
            continue
        
        try:
            file_hash = compute_file_hash(pdf_path)
            if file_hash not in hash_to_files:
                hash_to_files[file_hash] = []
            hash_to_files[file_hash].append({
                'doc_id': doc_id,
                'file_name': file_name,
                'hash': file_hash
            })
        except Exception as e:
            logger.warning(f"Could not compute hash for {file_name}: {e}")
    
    # Build duplicate report
    duplicate_rows = []
    duplicate_group_id = 0
    
    for file_hash, files in hash_to_files.items():
        if len(files) > 1:
            duplicate_group_id += 1
            for file_info in files:
                duplicate_rows.append({
                    'duplicate_group_id': duplicate_group_id,
                    'duplicate_type': 'exact',
                    'doc_id': file_info['doc_id'],
                    'file_name': file_info['file_name'],
                    'hash': file_info['hash'],
                    'similarity': 1.0
                })
    
    if duplicate_rows:
        logger.info(f"Found {duplicate_group_id} groups of exact duplicates")
    else:
        logger.info("No exact duplicates found")
    
    return pd.DataFrame(duplicate_rows)


def detect_near_duplicates(
    metadata_df: pd.DataFrame,
    cleaned_text_dir: Path,
    threshold: float = 0.95,
    use_tfidf: bool = True
) -> pd.DataFrame:
    """
    Detect near-duplicates using TF-IDF similarity.
    
    Returns:
        DataFrame with near-duplicate pairs
    """
    logger.info(f"Detecting near-duplicates (threshold={threshold})...")
    
    # Load all cleaned texts
    texts = []
    doc_ids = []
    valid_indices = []
    
    for idx, row in metadata_df.iterrows():
        doc_id = row['doc_id']
        text_file = cleaned_text_dir / f"{doc_id}.txt"
        
        if text_file.exists():
            try:
                with open(text_file, 'r', encoding='utf-8') as f:
                    text = f.read().strip()
                if len(text) > 100:  # Minimum length for comparison
                    texts.append(text)
                    doc_ids.append(doc_id)
                    valid_indices.append(idx)
            except Exception as e:
                logger.warning(f"Could not read text for {doc_id}: {e}")
    
    if len(texts) < 2:
        logger.info("Not enough texts for near-duplicate detection")
        return pd.DataFrame()
    
    # Compute TF-IDF vectors
    if use_tfidf:
        vectorizer = TfidfVectorizer(max_features=5000, stop_words='english')
        try:
            tfidf_matrix = vectorizer.fit_transform(texts)
            similarity_matrix = cosine_similarity(tfidf_matrix)
        except Exception as e:
            logger.error(f"TF-IDF computation failed: {e}")
            return pd.DataFrame()
    else:
        logger.warning("Non-TF-IDF near-duplicate detection not implemented")
        return pd.DataFrame()
    
    # Find pairs above threshold
    duplicate_rows = []
    duplicate_group_id = 0
    processed_pairs = set()
    
    for i in range(len(doc_ids)):
        for j in range(i + 1, len(doc_ids)):
            similarity = similarity_matrix[i, j]
            if similarity >= threshold:
                pair_key = tuple(sorted([doc_ids[i], doc_ids[j]]))
                if pair_key not in processed_pairs:
                    processed_pairs.add(pair_key)
                    duplicate_group_id += 1
                    duplicate_rows.append({
                        'duplicate_group_id': duplicate_group_id,
                        'duplicate_type': 'near',
                        'doc_id_1': doc_ids[i],
                        'doc_id_2': doc_ids[j],
                        'similarity': float(similarity)
                    })
    
    if duplicate_rows:
        logger.info(f"Found {len(duplicate_rows)} near-duplicate pairs")
    else:
        logger.info("No near-duplicates found")
    
    return pd.DataFrame(duplicate_rows)


def detect_all_duplicates(
    metadata_df: pd.DataFrame,
    pdf_dir: Path,
    cleaned_text_dir: Path,
    config: Dict
) -> pd.DataFrame:
    """
    Detect both exact and near duplicates.
    
    Returns:
        Combined duplicate report DataFrame
    """
    duplicates_config = config.get('duplicates', {})
    
    all_duplicate_rows = []
    
    # Exact duplicates
    if duplicates_config.get('exact_hash', True):
        exact_duplicates = detect_exact_duplicates(metadata_df, pdf_dir)
        if len(exact_duplicates) > 0:
            all_duplicate_rows.append(exact_duplicates)
    
    # Near duplicates (only if enabled)
    if duplicates_config.get('enable_near_duplicate', True) and duplicates_config.get('use_tfidf', True):
        threshold = duplicates_config.get('near_duplicate_threshold', 0.95)
        near_duplicates = detect_near_duplicates(
            metadata_df,
            cleaned_text_dir,
            threshold=threshold
        )
        if len(near_duplicates) > 0:
            all_duplicate_rows.append(near_duplicates)
    elif not duplicates_config.get('enable_near_duplicate', True):
        logger.info("Near-duplicate detection is disabled in config")
    
    if all_duplicate_rows:
        combined_df = pd.concat(all_duplicate_rows, ignore_index=True)
    else:
        combined_df = pd.DataFrame()
    
    return combined_df
