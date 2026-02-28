"""Embeddings generation module using sentence-transformers."""
import json
import numpy as np
from pathlib import Path
import logging
from typing import Dict, List, Optional
from sentence_transformers import SentenceTransformer
from tqdm import tqdm

logger = logging.getLogger(__name__)


def truncate_text_to_tokens(text: str, max_tokens: int, tokenizer) -> str:
    """
    Truncate text to fit within token limit.
    
    Args:
        text: Input text
        max_tokens: Maximum number of tokens
        tokenizer: Tokenizer from the model
    
    Returns:
        Truncated text
    """
    # Tokenize and truncate if needed
    tokens = tokenizer.encode(text, add_special_tokens=True, max_length=max_tokens, truncation=True)
    # Decode back to text (this ensures we don't cut mid-word)
    truncated_text = tokenizer.decode(tokens, skip_special_tokens=True)
    return truncated_text


def generate_embeddings(
    chunks_file: Path,
    output_dir: Path,
    config: Dict
) -> Dict[str, any]:
    """
    Generate embeddings for all chunks.
    
    Returns:
        Dictionary with metadata about embeddings
    """
    embeddings_config = config.get('embeddings', {})
    model_name = embeddings_config.get('model_name', 'sentence-transformers/all-MiniLM-L6-v2')
    batch_size = embeddings_config.get('batch_size', 32)
    normalize = embeddings_config.get('normalize', True)
    device = embeddings_config.get('device', 'cpu')
    max_tokens = embeddings_config.get('max_tokens', 512)
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info(f"Loading model: {model_name}")
    model = SentenceTransformer(model_name, device=device)
    
    # Get tokenizer for truncation
    tokenizer = model.tokenizer
    
    # Load all chunks
    logger.info(f"Loading chunks from {chunks_file}...")
    chunks = []
    chunk_map = []
    chunks_by_doc = {}  # For document-level embeddings
    truncated_count = 0
    
    with open(chunks_file, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            chunk = json.loads(line.strip())
            chunk_text = chunk['text']
            doc_id = chunk['doc_id']
            original_length = len(chunk_text)
            
            # Truncate if exceeds token limit
            if max_tokens:
                truncated_text = truncate_text_to_tokens(chunk_text, max_tokens, tokenizer)
                if len(truncated_text) < original_length:
                    truncated_count += 1
                    logger.debug(f"Truncated chunk {chunk['chunk_id']} from {original_length} to {len(truncated_text)} chars")
                chunk_text = truncated_text
            
            chunks.append(chunk_text)
            chunk_map.append({
                'embedding_index': idx,
                'chunk_id': chunk['chunk_id'],
                'doc_id': doc_id,
                'chunk_index': chunk['chunk_index']
            })
            
            # Track chunks by document for document-level embeddings
            if doc_id not in chunks_by_doc:
                chunks_by_doc[doc_id] = []
            chunks_by_doc[doc_id].append(idx)
    
    if truncated_count > 0:
        logger.warning(f"⚠ {truncated_count} chunks were truncated to fit token limit ({max_tokens} tokens)")
    else:
        logger.info(f"✓ All chunks fit within token limit ({max_tokens} tokens)")
    
    logger.info(f"Generating embeddings for {len(chunks)} chunks...")
    
    # Generate embeddings in batches
    all_embeddings = []
    for i in tqdm(range(0, len(chunks), batch_size), desc="Embedding batches"):
        batch = chunks[i:i+batch_size]
        batch_embeddings = model.encode(
            batch,
            show_progress_bar=False,
            normalize_embeddings=normalize,
            convert_to_numpy=True
        )
        all_embeddings.append(batch_embeddings)
    
    # Concatenate all embeddings
    embeddings = np.vstack(all_embeddings)
    
    logger.info(f"Generated embeddings shape: {embeddings.shape}")
    
    # Save chunk embeddings (renamed for clarity)
    chunk_embeddings_file = output_dir / "chunk_embeddings.npy"
    np.save(chunk_embeddings_file, embeddings)
    logger.info(f"Saved chunk embeddings to {chunk_embeddings_file}")
    
    # Save chunk map
    chunk_map_file = output_dir / "chunk_map.json"
    with open(chunk_map_file, 'w', encoding='utf-8') as f:
        json.dump(chunk_map, f, indent=2, ensure_ascii=False)
    logger.info(f"Saved chunk map to {chunk_map_file}")
    
    # Generate document-level embeddings (mean of chunk embeddings)
    doc_embeddings_result = None
    if embeddings_config.get('generate_document_embeddings', True):
        logger.info("Generating document-level embeddings...")
        doc_embeddings = {}
        doc_embedding_map = []
        
        for doc_id, chunk_indices in chunks_by_doc.items():
            doc_chunk_embeddings = embeddings[chunk_indices]
            doc_embedding = np.mean(doc_chunk_embeddings, axis=0)
            if normalize:
                # Re-normalize after averaging
                norm = np.linalg.norm(doc_embedding)
                if norm > 0:
                    doc_embedding = doc_embedding / norm
            doc_embeddings[doc_id] = doc_embedding
            doc_embedding_map.append({
                'doc_id': doc_id,
                'embedding_index': len(doc_embedding_map)
            })
        
        if doc_embeddings:
            doc_embeddings_array = np.array([doc_embeddings[doc_id] for doc_id in sorted(doc_embeddings.keys())])
            doc_embeddings_file = output_dir / "doc_embeddings.npy"
            np.save(doc_embeddings_file, doc_embeddings_array)
            logger.info(f"Saved document-level embeddings to {doc_embeddings_file}")
            
            doc_embedding_map_file = output_dir / "doc_embedding_map.json"
            with open(doc_embedding_map_file, 'w', encoding='utf-8') as f:
                json.dump(doc_embedding_map, f, indent=2, ensure_ascii=False)
            logger.info(f"Saved document embedding map to {doc_embedding_map_file}")
            
            doc_embeddings_result = {
                'embeddings': doc_embeddings_array,
                'embedding_map': doc_embedding_map,
                'num_documents': len(doc_embeddings)
            }
    
    # Save metadata
    metadata = {
        'model_name': model_name,
        'embedding_dim': int(embeddings.shape[1]),
        'num_chunks': int(embeddings.shape[0]),
        'normalized': normalize,
        'device': device,
        'max_tokens': max_tokens,
        'chunks_truncated': truncated_count,
        'document_embeddings_generated': embeddings_config.get('generate_document_embeddings', False)
    }
    
    metadata_file = output_dir / "embeddings_meta.json"
    with open(metadata_file, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    logger.info(f"Saved embeddings metadata to {metadata_file}")
    
    return {
        'embeddings': embeddings,
        'chunk_embeddings_file': chunk_embeddings_file,
        'chunk_map': chunk_map,
        'metadata': metadata,
        'document_embeddings': doc_embeddings_result
    }


def generate_abstract_embeddings(
    metadata_df,
    cleaned_text_dir: Path,
    output_dir: Path,
    config: Dict
) -> Optional[Dict[str, any]]:
    """
    Generate embeddings for document abstracts separately.
    
    Returns:
        Dictionary with abstract embeddings and metadata, or None if no abstracts found
    """
    embeddings_config = config.get('embeddings', {})
    if not embeddings_config.get('generate_abstract_embeddings', True):
        logger.info("Abstract embedding generation is disabled")
        return None
    
    model_name = embeddings_config.get('model_name', 'sentence-transformers/all-MiniLM-L6-v2')
    normalize = embeddings_config.get('normalize', True)
    device = embeddings_config.get('device', 'cpu')
    max_tokens = embeddings_config.get('max_tokens', 512)
    
    logger.info(f"Loading model for abstract embeddings: {model_name}")
    model = SentenceTransformer(model_name, device=device)
    tokenizer = model.tokenizer
    
    # Load abstracts
    abstracts = []
    abstract_map = []
    
    for idx, row in metadata_df.iterrows():
        doc_id = row['doc_id']
        abstract_file = cleaned_text_dir / f"{doc_id}.abstract.txt"
        
        if abstract_file.exists():
            try:
                with open(abstract_file, 'r', encoding='utf-8') as f:
                    abstract_text = f.read().strip()
                
                if abstract_text and len(abstract_text) > 50:  # Minimum length
                    # Truncate if needed
                    if max_tokens:
                        abstract_text = truncate_text_to_tokens(abstract_text, max_tokens, tokenizer)
                    
                    abstracts.append(abstract_text)
                    abstract_map.append({
                        'doc_id': doc_id,
                        'embedding_index': len(abstracts) - 1
                    })
            except Exception as e:
                logger.warning(f"Could not read abstract for {doc_id}: {e}")
    
    if not abstracts:
        logger.info("No abstracts found for embedding generation")
        return None
    
    logger.info(f"Generating embeddings for {len(abstracts)} abstracts...")
    
    # Generate embeddings
    abstract_embeddings = model.encode(
        abstracts,
        show_progress_bar=True,
        normalize_embeddings=normalize,
        convert_to_numpy=True
    )
    
    logger.info(f"Generated abstract embeddings shape: {abstract_embeddings.shape}")
    
    # Save abstract embeddings
    abstract_embeddings_file = output_dir / "abstract_embeddings.npy"
    np.save(abstract_embeddings_file, abstract_embeddings)
    logger.info(f"Saved abstract embeddings to {abstract_embeddings_file}")
    
    # Save abstract map
    abstract_map_file = output_dir / "abstract_embedding_map.json"
    with open(abstract_map_file, 'w', encoding='utf-8') as f:
        json.dump(abstract_map, f, indent=2, ensure_ascii=False)
    logger.info(f"Saved abstract embedding map to {abstract_map_file}")
    
    return {
        'embeddings': abstract_embeddings,
        'embedding_map': abstract_map,
        'num_abstracts': len(abstracts)
    }
