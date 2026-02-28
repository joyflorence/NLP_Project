"""Text chunking module with paragraph and sentence awareness."""
import re
import json
from pathlib import Path
import pandas as pd
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


def split_into_paragraphs(text: str) -> List[str]:
    """Split text into paragraphs."""
    # Split on double newlines (paragraph breaks)
    paragraphs = re.split(r'\n\s*\n', text)
    # Filter out empty paragraphs
    paragraphs = [p.strip() for p in paragraphs if p.strip()]
    return paragraphs


def split_into_sentences(text: str) -> List[str]:
    """Split text into sentences using simple heuristics."""
    # Simple sentence splitting: period, exclamation, question mark followed by space and capital
    sentences = re.split(r'([.!?])\s+([A-Z])', text)
    
    # Reconstruct sentences
    result = []
    for i in range(0, len(sentences) - 2, 3):
        sentence = sentences[i] + sentences[i+1] + sentences[i+2]
        result.append(sentence.strip())
    
    # Handle last sentence if exists
    if len(sentences) % 3 == 1:
        result.append(sentences[-1].strip())
    
    return [s for s in result if s]


def count_words(text: str) -> int:
    """Count words in text."""
    return len(text.split())


def create_chunks(
    text: str,
    target_words: int = 350,
    min_words: int = 250,
    max_words: int = 450,
    overlap_words: int = 60,
    paragraph_aware: bool = True,
    sentence_aware: bool = True
) -> List[Dict[str, any]]:
    """
    Create chunks from text with paragraph and sentence awareness.
    
    Returns:
        List of chunk dictionaries with 'text', 'chunk_index', 'word_count', 'start_char', 'end_char'
    """
    chunks = []
    
    if paragraph_aware:
        # Split into paragraphs first
        paragraphs = split_into_paragraphs(text)
        
        current_chunk = []
        current_word_count = 0
        chunk_index = 0
        start_char = 0
        
        for para in paragraphs:
            para_words = count_words(para)
            
            # If adding this paragraph would exceed max, finalize current chunk
            if current_word_count + para_words > max_words and current_chunk:
                # Finalize chunk
                chunk_text = '\n\n'.join(current_chunk)
                end_char = start_char + len(chunk_text)
                
                chunks.append({
                    'chunk_index': chunk_index,
                    'text': chunk_text,
                    'word_count': current_word_count,
                    'start_char': start_char,
                    'end_char': end_char
                })
                
                # Start new chunk with overlap
                chunk_index += 1
                if overlap_words > 0 and sentence_aware:
                    # Try to include last sentences for overlap
                    last_sentences = []
                    last_word_count = 0
                    for sent in reversed(split_into_sentences(chunk_text)):
                        sent_words = count_words(sent)
                        if last_word_count + sent_words <= overlap_words:
                            last_sentences.insert(0, sent)
                            last_word_count += sent_words
                        else:
                            break
                    current_chunk = last_sentences
                    current_word_count = last_word_count
                    start_char = end_char - len('\n\n'.join(last_sentences))
                else:
                    current_chunk = []
                    current_word_count = 0
                    start_char = end_char
            
            # Add paragraph to current chunk
            current_chunk.append(para)
            current_word_count += para_words
            
            # If we've reached target, consider finalizing
            if current_word_count >= target_words:
                # Check if next paragraph would push us over max
                # (We'll check this in the next iteration)
                pass
        
        # Add final chunk if exists
        if current_chunk:
            chunk_text = '\n\n'.join(current_chunk)
            end_char = start_char + len(chunk_text)
            chunks.append({
                'chunk_index': chunk_index,
                'text': chunk_text,
                'word_count': current_word_count,
                'start_char': start_char,
                'end_char': end_char
            })
    
    else:
        # Simple word-based chunking without paragraph awareness
        words = text.split()
        chunk_index = 0
        start_char = 0
        
        i = 0
        while i < len(words):
            chunk_words = []
            word_count = 0
            
            # Build chunk up to target
            while i < len(words) and word_count < target_words:
                chunk_words.append(words[i])
                word_count += 1
                i += 1
            
            # If we're below min and there are more words, continue
            if word_count < min_words and i < len(words):
                while i < len(words) and word_count < max_words:
                    chunk_words.append(words[i])
                    word_count += 1
                    i += 1
            
            # Create chunk
            chunk_text = ' '.join(chunk_words)
            end_char = start_char + len(chunk_text)
            
            chunks.append({
                'chunk_index': chunk_index,
                'text': chunk_text,
                'word_count': word_count,
                'start_char': start_char,
                'end_char': end_char
            })
            
            chunk_index += 1
            start_char = end_char - overlap_words * 10  # Rough estimate for overlap
            i = max(0, i - overlap_words)  # Overlap by going back
    
    return chunks


def chunk_all_documents(
    metadata_df: pd.DataFrame,
    cleaned_text_dir: Path,
    chunks_dir: Path,
    config: Dict
) -> pd.DataFrame:
    """
    Chunk all cleaned texts.
    
    Returns:
        DataFrame with chunking report
    """
    chunks_dir.mkdir(parents=True, exist_ok=True)
    chunking_config = config.get('chunking', {})
    
    target_words = chunking_config.get('target_words', 350)
    min_words = chunking_config.get('min_words', 250)
    max_words = chunking_config.get('max_words', 450)
    overlap_words = chunking_config.get('overlap_words', 60)
    paragraph_aware = chunking_config.get('paragraph_aware', True)
    sentence_aware = chunking_config.get('sentence_aware', True)
    
    all_chunks = []
    report_rows = []
    
    for idx, row in metadata_df.iterrows():
        doc_id = row['doc_id']
        cleaned_file = cleaned_text_dir / f"{doc_id}.txt"
        
        logger.info(f"Chunking text for {doc_id}...")
        
        if not cleaned_file.exists():
            logger.warning(f"Cleaned text not found: {cleaned_file}")
            report_rows.append({
                'doc_id': doc_id,
                'chunk_count': 0,
                'total_words': 0,
                'avg_chunk_size': 0,
                'min_chunk_size': 0,
                'max_chunk_size': 0,
                'error': 'Cleaned text file not found'
            })
            continue
        
        try:
            # Read cleaned text
            with open(cleaned_file, 'r', encoding='utf-8') as f:
                cleaned_text = f.read()
            
            if not cleaned_text.strip():
                logger.warning(f"Empty cleaned text for {doc_id}")
                report_rows.append({
                    'doc_id': doc_id,
                    'chunk_count': 0,
                    'total_words': 0,
                    'avg_chunk_size': 0,
                    'min_chunk_size': 0,
                    'max_chunk_size': 0,
                    'error': 'Empty text'
                })
                continue
            
            # Create chunks
            chunks = create_chunks(
                cleaned_text,
                target_words=target_words,
                min_words=min_words,
                max_words=max_words,
                overlap_words=overlap_words,
                paragraph_aware=paragraph_aware,
                sentence_aware=sentence_aware
            )
            
            # Save per-document chunks
            doc_chunks_file = chunks_dir / f"{doc_id}.jsonl"
            chunk_sizes = []
            
            with open(doc_chunks_file, 'w', encoding='utf-8') as f:
                for chunk in chunks:
                    chunk_id = f"{doc_id}__{chunk['chunk_index']:05d}"
                    chunk_record = {
                        'chunk_id': chunk_id,
                        'doc_id': doc_id,
                        'chunk_index': chunk['chunk_index'],
                        'text': chunk['text'],
                        'word_count': chunk['word_count'],
                        'start_char': chunk['start_char'],
                        'end_char': chunk['end_char']
                    }
                    f.write(json.dumps(chunk_record, ensure_ascii=False) + '\n')
                    all_chunks.append(chunk_record)
                    chunk_sizes.append(chunk['word_count'])
            
            # Statistics
            total_words = sum(chunk_sizes)
            avg_size = total_words / len(chunks) if chunks else 0
            min_size = min(chunk_sizes) if chunk_sizes else 0
            max_size = max(chunk_sizes) if chunk_sizes else 0
            
            report_rows.append({
                'doc_id': doc_id,
                'chunk_count': len(chunks),
                'total_words': total_words,
                'avg_chunk_size': round(avg_size, 1),
                'min_chunk_size': min_size,
                'max_chunk_size': max_size,
                'error': None
            })
            
            logger.info(f"Created {len(chunks)} chunks for {doc_id} (avg size: {avg_size:.1f} words)")
        
        except Exception as e:
            logger.error(f"Error chunking text for {doc_id}: {e}")
            report_rows.append({
                'doc_id': doc_id,
                'chunk_count': 0,
                'total_words': 0,
                'avg_chunk_size': 0,
                'min_chunk_size': 0,
                'max_chunk_size': 0,
                'error': str(e)
            })
    
    # Save all chunks to single file
    all_chunks_file = chunks_dir / "all_chunks.jsonl"
    logger.info(f"Saving {len(all_chunks)} total chunks to {all_chunks_file}...")
    with open(all_chunks_file, 'w', encoding='utf-8') as f:
        for chunk in all_chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + '\n')
    
    report_df = pd.DataFrame(report_rows)
    return report_df
