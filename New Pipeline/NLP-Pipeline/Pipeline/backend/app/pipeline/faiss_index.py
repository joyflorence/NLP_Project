"""FAISS indexing module."""
import json
import numpy as np
import faiss
from pathlib import Path
import logging
from typing import Dict
from datetime import datetime

logger = logging.getLogger(__name__)


def build_faiss_index(
    embeddings_file: Path,
    output_dir: Path,
    config: Dict
) -> Dict[str, any]:
    """
    Build FAISS index from embeddings.
    
    Returns:
        Dictionary with index metadata
    """
    faiss_config = config.get('faiss', {})
    index_type = faiss_config.get('index_type', 'IndexFlatIP')
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Load embeddings
    logger.info(f"Loading embeddings from {embeddings_file}...")
    embeddings = np.load(embeddings_file)
    
    num_vectors, dim = embeddings.shape
    logger.info(f"Loaded {num_vectors} vectors of dimension {dim}")
    
    # Create index
    if index_type == 'IndexFlatIP':
        # Inner product index (for normalized vectors = cosine similarity)
        index = faiss.IndexFlatIP(dim)
    elif index_type == 'IndexFlatL2':
        # L2 distance index
        index = faiss.IndexFlatL2(dim)
    else:
        raise ValueError(f"Unknown index type: {index_type}")
    
    # Add vectors to index
    logger.info("Adding vectors to FAISS index...")
    start_time = datetime.now()
    
    # Ensure embeddings are float32 (FAISS requirement)
    embeddings = embeddings.astype('float32')
    index.add(embeddings)
    
    build_time = (datetime.now() - start_time).total_seconds()
    
    # Verify
    ntotal = index.ntotal
    logger.info(f"Index built: {ntotal} vectors indexed in {build_time:.2f} seconds")
    
    if ntotal != num_vectors:
        logger.warning(f"Index count ({ntotal}) doesn't match embeddings count ({num_vectors})")
    
    # Save index
    index_file = output_dir / "chunk.index.faiss"
    faiss.write_index(index, str(index_file))
    logger.info(f"Saved FAISS index to {index_file}")
    
    # Index integrity check: test self-retrieval
    logger.info("Running index integrity check (self-retrieval test)...")
    try:
        # Load chunk map to verify doc_id matching
        chunk_map_file = embeddings_file.parent / "chunk_map.json"
        chunk_map = None
        if chunk_map_file.exists():
            try:
                with open(chunk_map_file, 'r', encoding='utf-8') as f:
                    chunk_map = json.load(f)
            except Exception:
                pass
        
        # Pick a random chunk embedding from the index (self-retrieval test)
        test_idx = np.random.randint(0, ntotal)
        test_query = embeddings[test_idx:test_idx+1].astype('float32')
        
        # Search for top 3 nearest neighbors (should include itself)
        k = min(3, ntotal)
        distances, indices = index.search(test_query, k)
        
        # Verify self-retrieval: top-1 should be the query itself
        top1_idx = int(indices[0][0])
        self_retrieved = (top1_idx == test_idx)
        
        # Also check if same doc_id (if chunk_map available)
        same_doc = False
        if chunk_map and len(chunk_map) > test_idx:
            query_doc_id = chunk_map[test_idx].get('doc_id')
            if top1_idx < len(chunk_map):
                top1_doc_id = chunk_map[top1_idx].get('doc_id')
                same_doc = (query_doc_id == top1_doc_id)
        
        integrity_check = {
            'passed': self_retrieved or same_doc,
            'test_chunk_index': int(test_idx),
            'top1_retrieved_index': int(top1_idx),
            'self_retrieved': self_retrieved,
            'same_doc_retrieved': same_doc,
            'k_neighbors': k,
            'search_successful': True,
            'top1_distance': float(distances[0][0]),
            'distances_range': [float(distances.min()), float(distances.max())]
        }
        
        if integrity_check['passed']:
            logger.info(f"✓ Index integrity check passed: query chunk {test_idx} retrieved itself (or same doc) as top-1")
        else:
            logger.warning(f"⚠ Index integrity check: query chunk {test_idx} did not retrieve itself as top-1 (retrieved {top1_idx})")
            
    except Exception as e:
        logger.warning(f"Index integrity check failed: {e}")
        integrity_check = {
            'passed': False,
            'error': str(e)
        }
    
    # Load embeddings metadata to get model name
    embeddings_meta_file = embeddings_file.parent / "embeddings_meta.json"
    model_name = "unknown"
    if embeddings_meta_file.exists():
        try:
            with open(embeddings_meta_file, 'r', encoding='utf-8') as f:
                embeddings_meta = json.load(f)
                model_name = embeddings_meta.get('model_name', 'unknown')
        except Exception as e:
            logger.warning(f"Could not load embeddings metadata: {e}")
    
    # Save index metadata (for reproducibility)
    index_meta = {
        'index_type': index_type,
        'embedding_dimension': int(dim),
        'num_vectors': int(ntotal),
        'model_name': model_name,
        'build_timestamp': datetime.now().isoformat(),
        'index_file': str(index_file)
    }
    
    index_meta_file = output_dir / "index_meta.json"
    with open(index_meta_file, 'w', encoding='utf-8') as f:
        json.dump(index_meta, f, indent=2, ensure_ascii=False)
    logger.info(f"Saved index metadata to {index_meta_file}")
    
    # Save index report (detailed report with integrity check)
    index_report = {
        'index_type': index_type,
        'num_vectors': int(ntotal),
        'dimension': int(dim),
        'build_time_seconds': round(build_time, 2),
        'build_timestamp': datetime.now().isoformat(),
        'index_file': str(index_file),
        'model_name': model_name,
        'integrity_check': integrity_check
    }
    
    report_file = output_dir / "index_report.json"
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(index_report, f, indent=2, ensure_ascii=False)
    logger.info(f"Saved index report to {report_file}")
    
    return index_report
