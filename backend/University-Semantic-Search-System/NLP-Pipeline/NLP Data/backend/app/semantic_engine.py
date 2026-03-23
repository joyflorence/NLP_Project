"""
Core semantic search engine implementation
Supports both Pinecone (cloud) and FAISS (local) vector storage
"""

import os
import re
import json
import hashlib
import logging
import pickle
from typing import List, Dict, Tuple, Optional, Any
from datetime import datetime
import numpy as np
import torch
from sentence_transformers import SentenceTransformer

# Try importing vector store options (catch Exception: old pinecone-client raises to tell users to use `pinecone`)
try:
    from pinecone import Pinecone, ServerlessSpec
    PINECONE_AVAILABLE = True
except (ImportError, Exception):
    PINECONE_AVAILABLE = False

try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False

import pymupdf  # PyMuPDF

from app.config import config

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(config.logs_dir, 'engine.log')),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class SemanticSearchEngine:
    """Main search engine orchestrating all components
    
    Supports both Pinecone (cloud) and FAISS (local) vector storage
    per Section 2.2 and 3.1 of Implementation Guide
    """
    
    def __init__(self, pinecone_api_key: str = None, use_faiss: bool = None):
        self.config = config
        self.pinecone_api_key = pinecone_api_key or os.environ.get("PINECONE_API_KEY")
        
        # Determine which vector store to use (FAISS when no Pinecone key or explicitly set)
        if use_faiss is not None:
            self.use_faiss = use_faiss
        else:
            self.use_faiss = config.use_faiss or not (self.pinecone_api_key and PINECONE_AVAILABLE)
        
        # Components
        self.model = None
        self.pc = None
        self.index = None  # Pinecone index
        self.faiss_index = None  # FAISS index
        self.chunk_metadata = []  # Metadata for FAISS index
        self.dimension = None
        self.initialized = False
        
        # Stats
        self.stats = {
            'total_documents': 0,
            'total_chunks': 0,
            'last_indexed': None,
            'documents': []
        }
        
        logger.info(f"SemanticSearchEngine initialized (use_faiss: {self.use_faiss})")
        
    def initialize(self) -> bool:
        """Initialize all components"""
        try:
            logger.info("Initializing search engine...")
            
            # Load embedding model
            logger.info(f"Loading embedding model: {self.config.embedding_model}")
            self.model = SentenceTransformer(self.config.embedding_model)
            self.model.to(self.config.device)
            self.dimension = self.model.get_sentence_embedding_dimension()
            logger.info(f"Model loaded (dimension: {self.dimension}, device: {self.config.device})")
            
            # Initialize vector store
            if self.use_faiss:
                if not FAISS_AVAILABLE:
                    logger.warning("FAISS not available, falling back to Pinecone")
                    self.use_faiss = False
                else:
                    self._setup_faiss_index()
            else:
                self._setup_pinecone_index()
            
            self.initialized = True
            logger.info("Search engine initialized successfully!")
            return True
            
        except Exception as e:
            logger.error(f"Initialization failed: {str(e)}")
            return False
    
    def _setup_faiss_index(self):
        """Setup local FAISS index per Section 2.2"""
        logger.info("Setting up FAISS index...")
        
        index_path = os.path.join(self.config.cache_dir, 'faiss.index')
        metadata_path = os.path.join(self.config.cache_dir, 'faiss_metadata.pkl')
        
        # Try to load existing index
        if os.path.exists(index_path) and os.path.exists(metadata_path):
            try:
                self.faiss_index = faiss.read_index(index_path)
                with open(metadata_path, 'rb') as f:
                    self.chunk_metadata = pickle.load(f)
                logger.info(f"Loaded existing FAISS index with {self.faiss_index.ntotal} vectors")
            except Exception as e:
                logger.warning(f"Could not load existing index: {e}")
                self.faiss_index = None
                self.chunk_metadata = []
        
        # Create new index if needed
        if self.faiss_index is None:
            logger.info(f"Creating new FAISS index (dimension: {self.dimension})")
            # Use IVF index for better performance with large datasets
            if self.config.faiss_index_type == 'IVF_FLAT':
                quantizer = faiss.IndexFlatL2(self.dimension)
                self.faiss_index = faiss.IndexIVFFlat(
                    quantizer, self.dimension, self.config.faiss_nlist
                )
            else:
                # Simple flat index
                self.faiss_index = faiss.IndexFlatL2(self.dimension)
        
        logger.info("FAISS index ready")
        self._update_stats()
    
    def _setup_pinecone_index(self):
        """Setup Pinecone index (cloud vector storage)"""
        if not PINECONE_AVAILABLE:
            raise RuntimeError("Pinecone not available. Install with: pip install pinecone")
        
        if not self.pinecone_api_key:
            raise ValueError("Pinecone API key not provided")
        
        logger.info("Connecting to Pinecone...")
        self.pc = Pinecone(api_key=self.pinecone_api_key)
        
        # Check if index exists
        existing_indexes = self.pc.list_indexes().names()
        
        if self.config.index_name not in existing_indexes:
            logger.info(f"Creating index '{self.config.index_name}'...")
            
            self.pc.create_index(
                name=self.config.index_name,
                dimension=self.dimension,
                metric=self.config.pinecone_metric,
                spec=ServerlessSpec(
                    cloud=self.config.pinecone_cloud,
                    region=self.config.pinecone_region
                )
            )
            
            logger.info("Index created successfully")
        
        # Connect to index
        self.index = self.pc.Index(self.config.index_name)
        logger.info(f"Connected to index '{self.config.index_name}'")
        
        # Update stats
        self._update_stats()
    
    def _update_stats(self):
        """Update engine statistics"""
        try:
            if self.use_faiss and self.faiss_index:
                self.stats['total_chunks'] = self.faiss_index.ntotal
            elif self.index:
                stats = self.index.describe_index_stats()
                self.stats['total_chunks'] = stats['total_vector_count']
            
            # Load document metadata if exists
            metadata_path = os.path.join(self.config.cache_dir, 'documents.json')
            if os.path.exists(metadata_path):
                with open(metadata_path, 'r') as f:
                    self.stats['documents'] = json.load(f)
                    self.stats['total_documents'] = len(self.stats['documents'])
                    
            logger.info(f"Stats updated: {self.stats['total_chunks']} chunks, {self.stats['total_documents']} documents")
        except Exception as e:
            logger.warning(f"Failed to update stats: {e}")
    
    # ========== PDF PROCESSING ==========
    
    def process_pdf(self, filepath: str) -> Dict[str, Any]:
        """
        Process a single PDF file
        
        Args:
            filepath: Path to PDF file
            
        Returns:
            Dictionary with processing results
        """
        filename = os.path.basename(filepath)
        result = {
            'filename': filename,
            'success': False,
            'pages': 0,
            'chunks': 0,
            'error': None
        }
        
        try:
            logger.info(f"Processing PDF: {filename}")
            
            # Extract text from PDF
            doc = pymupdf.open(filepath)
            result['pages'] = doc.page_count
            
            # Process each page
            all_chunks = []
            for page_num in range(doc.page_count):
                page = doc[page_num]
                text = page.get_text("text")
                
                if text.strip():
                    # Clean text
                    text = self._clean_text(text)
                    
                    # Chunk text
                    chunks = self._chunk_text(text, page_num + 1, filename)
                    all_chunks.extend(chunks)
            
            doc.close()
            
            if all_chunks:
                result['chunks'] = len(all_chunks)
                result['success'] = True
                
                # Save to cache
                self._cache_chunks(filename, all_chunks)
                logger.info(f"Processed {filename}: {result['pages']} pages, {result['chunks']} chunks")
            else:
                logger.warning(f"No text extracted from {filename}")
            
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"Error processing {filename}: {e}")
        
        return result
    
    def _clean_text(self, text: str) -> str:
        """Clean extracted text per Section 2.1"""
        if not text:
            return ""
        
        # Replace multiple newlines
        text = re.sub(r'\n\s*\n', '\n\n', text)
        
        # Replace multiple spaces
        text = re.sub(r' +', ' ', text)
        
        # Optionally remove References section (per Section 2.1)
        # text = re.split(r'\n\s*References\s*\n', text, flags=re.IGNORECASE)[0]
        
        # Remove non-printable characters
        text = ''.join(char for char in text if char.isprintable() or char in '\n\t')
        
        return text.strip()
    
    def _chunk_text(self, text: str, page_num: int, filename: str) -> List[Dict]:
        """Split text into overlapping chunks per Section 2.1 (250-400 words, 40-80 overlap)"""
        if not text:
            return []
        
        # Tokenize by words for better chunking
        words = text.split()
        
        chunks = []
        if len(words) <= self.config.chunk_size:
            # Short text - single chunk
            chunk_id = self._generate_chunk_id(filename, page_num, 0)
            chunks.append({
                'id': chunk_id,
                'text': text,
                'page': page_num,
                'chunk_index': 0,
                'filename': filename,
                'timestamp': datetime.now().isoformat()
            })
            return chunks
        chunk_index = 0
        start = 0
        text_len = len(words)
        
        while start < text_len:
            end = min(start + self.config.chunk_size, text_len)
            
            # Try to end at sentence boundary
            if end < text_len:
                # Find the last period, question mark, or newline within the chunk
                chunk_text = ' '.join(words[start:end])
                sentence_ends = [
                    chunk_text.rfind('. '),
                    chunk_text.rfind('! '),
                    chunk_text.rfind('? '),
                    chunk_text.rfind('.\n'),
                ]
                sentence_end = max(sentence_ends)
                if sentence_end > len(chunk_text) // 2:
                    end = start + sentence_end + 1
            
            chunk_words = words[start:end]
            chunk_text = ' '.join(chunk_words)
            
            if chunk_text.strip():
                chunk_id = self._generate_chunk_id(filename, page_num, chunk_index)
                chunks.append({
                    'id': chunk_id,
                    'text': chunk_text,
                    'page': page_num,
                    'chunk_index': chunk_index,
                    'filename': filename,
                    'timestamp': datetime.now().isoformat()
                })
            
            # Move with overlap
            start = end - self.config.chunk_overlap
            chunk_index += 1
            
            if start >= text_len or start < 0:
                break
        
        return chunks
    
    def _generate_chunk_id(self, filename: str, page: int, chunk_index: int) -> str:
        """Generate unique ID for a chunk"""
        unique_str = f"{filename}_{page}_{chunk_index}_{datetime.now().timestamp()}"
        return hashlib.md5(unique_str.encode()).hexdigest()[:16]
    
    def _cache_chunks(self, filename: str, chunks: List[Dict]):
        """Cache chunks to disk"""
        cache_file = os.path.join(self.config.cache_dir, f"{filename}.json")
        with open(cache_file, 'w') as f:
            json.dump(chunks, f, indent=2)
    
    # ========== EMBEDDING GENERATION ==========
    
    def generate_embeddings(self, chunks: List[Dict]) -> List[Tuple]:
        """
        Generate embeddings for chunks
        
        Returns:
            List of (id, embedding_vector, metadata) tuples
        """
        if not self.model:
            raise RuntimeError("Model not initialized")
        
        texts = [chunk['text'] for chunk in chunks]
        logger.info(f"Generating embeddings for {len(texts)} chunks...")
        
        # Generate embeddings in batches
        all_embeddings = []
        
        for i in range(0, len(texts), self.config.batch_size):
            batch_texts = texts[i:i + self.config.batch_size]
            
            with torch.no_grad():
                embeddings = self.model.encode(
                    batch_texts,
                    convert_to_numpy=True,
                    show_progress_bar=False
                )
            
            all_embeddings.extend(embeddings)
        
        # Prepare vectors
        vectors = []
        for idx, (chunk, embedding) in enumerate(zip(chunks, all_embeddings)):
            metadata = {
                'filename': chunk['filename'],
                'page': chunk['page'],
                'chunk_index': chunk['chunk_index'],
                'text_preview': chunk['text'][:800] + ('...' if len(chunk['text']) > 800 else ''),
                'timestamp': chunk['timestamp']
            }
            vectors.append((chunk['id'], embedding.tolist(), metadata))
        
        logger.info(f"Generated {len(vectors)} embeddings")
        return vectors
    
    # ========== INDEX MANAGEMENT ==========
    
    def index_documents(self, filepaths: List[str]) -> Dict[str, Any]:
        """
        Index multiple PDF documents
        
        Args:
            filepaths: List of paths to PDF files
            
        Returns:
            Dictionary with indexing results
        """
        if not self.initialized:
            if not self.initialize():
                return {'success': False, 'error': 'Engine not initialized'}
        
        results = {
            'success': True,
            'total_files': len(filepaths),
            'processed': 0,
            'failed': 0,
            'total_chunks': 0,
            'documents': [],
            'errors': []
        }
        
        # Process each file
        all_chunks = []
        for filepath in filepaths:
            result = self.process_pdf(filepath)
            
            if result['success']:
                # Load chunks from cache
                cache_file = os.path.join(self.config.cache_dir, f"{result['filename']}.json")
                if os.path.exists(cache_file):
                    with open(cache_file, 'r') as f:
                        chunks = json.load(f)
                        all_chunks.extend(chunks)
                        
                results['processed'] += 1
                results['documents'].append({
                    'filename': result['filename'],
                    'pages': result['pages'],
                    'chunks': result['chunks']
                })
                results['total_chunks'] += result['chunks']
            else:
                results['failed'] += 1
                if result['error']:
                    results['errors'].append(f"{result['filename']}: {result['error']}")
        
        if all_chunks:
            # Generate embeddings
            vectors = self.generate_embeddings(all_chunks)
            
            # Upload to Pinecone
            self._upload_vectors(vectors)
            
            # Update document registry
            self._update_document_registry(results['documents'])
            
            self.stats['last_indexed'] = datetime.now().isoformat()
            
        logger.info(f"Indexing complete: {results['processed']} files, {results['total_chunks']} chunks")
        return results
    
    def _upload_vectors(self, vectors: List[Tuple], batch_size: int = 100):
        """Upload vectors to the configured vector store"""
        
        if self.use_faiss:
            # Add to FAISS index
            logger.info(f"Adding {len(vectors)} vectors to FAISS index...")
            
            # Prepare vectors array
            embeddings = np.array([v[1] for v in vectors], dtype='float32')
            if len(embeddings) == 0:
                return

            # IndexIVFFlat requires training before add; needs at least nlist vectors
            if hasattr(self.faiss_index, "is_trained") and not self.faiss_index.is_trained:
                n_required = self.config.faiss_nlist
                if len(embeddings) < n_required:
                    # Too few vectors for IVF training; switch to Flat index
                    logger.info(f"Switching to Flat index (only {len(embeddings)} vectors, need {n_required} for IVF)")
                    self.faiss_index = faiss.IndexFlatL2(embeddings.shape[1])
                else:
                    self.faiss_index.train(embeddings)
            self.faiss_index.add(embeddings)
            
            # Store metadata
            for v in vectors:
                self.chunk_metadata.append({
                    'id': v[0],
                    'filename': v[2].get('filename', ''),
                    'page': v[2].get('page', 0),
                    'chunk_index': v[2].get('chunk_index', 0),
                    'text_preview': v[2].get('text_preview', ''),
                    'timestamp': v[2].get('timestamp', '')
                })
            
            # Save index to disk
            index_path = os.path.join(self.config.cache_dir, 'faiss.index')
            metadata_path = os.path.join(self.config.cache_dir, 'faiss_metadata.pkl')
            
            faiss.write_index(self.faiss_index, index_path)
            with open(metadata_path, 'wb') as f:
                pickle.dump(self.chunk_metadata, f)
            
            logger.info(f"Added to FAISS index. Total: {self.faiss_index.ntotal}")
            
        else:
            # Upload to Pinecone (guard: index may be None if Pinecone failed to init)
            if self.index is None:
                logger.warning("Pinecone index not available; skipping upload")
                return
            logger.info(f"Uploading {len(vectors)} vectors to Pinecone...")
            for i in range(0, len(vectors), batch_size):
                batch = vectors[i:i + batch_size]
                self.index.upsert(vectors=batch)
            logger.info("Upload complete")
    
    def _update_document_registry(self, documents: List[Dict]):
        """Update document registry"""
        registry_path = os.path.join(self.config.cache_dir, 'documents.json')
        
        # Load existing
        existing = []
        if os.path.exists(registry_path):
            with open(registry_path, 'r') as f:
                existing = json.load(f)
        
        # Merge (avoid duplicates)
        existing_filenames = {d['filename'] for d in existing}
        for doc in documents:
            if doc['filename'] not in existing_filenames:
                existing.append(doc)
        
        # Save
        with open(registry_path, 'w') as f:
            json.dump(existing, f, indent=2)
        
        self.stats['documents'] = existing
        self.stats['total_documents'] = len(existing)
    
    # ========== SEARCH ==========
    
    def search(self, query: str, top_k: int = 10, filter_dict: Dict = None) -> Dict[str, Any]:
        """
        Search for documents matching the query (semantic search)
        
        Args:
            query: Search query string
            top_k: Number of results to return
            filter_dict: Optional filter
            
        Returns:
            Dictionary with search results
        """
        if not self.initialized:
            if not self.initialize():
                return {'success': False, 'error': 'Engine not initialized'}
        
        try:
            logger.info(f"Searching for: '{query}'")
            
            # Generate query embedding
            query_embedding = self.model.encode(query)
            query_vector = query_embedding.reshape(1, -1).astype('float32')
            
            if self.use_faiss:
                # FAISS search (guard: index may be None or empty)
                if self.faiss_index is None:
                    return self._empty_search_result(query, 'semantic_faiss')
                return self._search_faiss(query_vector, query, top_k, filter_dict)
            else:
                # Pinecone search (guard: index may be None if Pinecone failed to init)
                if self.index is None:
                    logger.warning("Pinecone index not available; returning empty results")
                    return self._empty_search_result(query, 'semantic_pinecone')
                return self._search_pinecone(query_vector.tolist()[0], query, top_k, filter_dict)
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _empty_search_result(self, query: str, method: str) -> Dict:
        """Return a valid empty result so callers never crash."""
        return {
            'success': True,
            'query': query,
            'total_results': 0,
            'results': [],
            'method': method
        }

    def _search_faiss(self, query_vector: np.ndarray, query: str, 
                     top_k: int, filter_dict: Dict = None) -> Dict:
        """Search using FAISS index"""
        if self.faiss_index is None or self.faiss_index.ntotal == 0:
            return self._empty_search_result(query, 'semantic_faiss')
        
        search_k = min(top_k * 2, self.faiss_index.ntotal)  # Get more for filtering
        
        # Search
        distances, indices = self.faiss_index.search(query_vector, search_k)
        
        # Format results
        formatted_results = []
        for idx, (distance, chunk_idx) in enumerate(zip(distances[0], indices[0])):
            if chunk_idx < 0 or chunk_idx >= len(self.chunk_metadata):
                continue
            
            metadata = self.chunk_metadata[chunk_idx]
            
            # Apply filter if provided
            if filter_dict and metadata.get('filename'):
                filter_filename = filter_dict.get('filename', {}).get('$eq')
                if filter_filename and metadata['filename'] != filter_filename:
                    continue
            
            # Convert distance to similarity score (1 / (1 + distance))
            score = 1.0 / (1.0 + distance)
            
            formatted_results.append({
                'id': metadata.get('id', str(chunk_idx)),
                'score': float(score),
                'filename': metadata.get('filename', ''),
                'page': metadata.get('page', 0),
                'preview': metadata.get('text_preview', ''),
                'relevance': self._get_relevance_label(score)
            })
            
            if len(formatted_results) >= top_k:
                break
        
        logger.info(f"Found {len(formatted_results)} results")
        
        return {
            'success': True,
            'query': query,
            'total_results': len(formatted_results),
            'results': formatted_results,
            'method': 'semantic_faiss'
        }
    
    def _search_pinecone(self, query_vector: List, query: str, 
                        top_k: int, filter_dict: Dict = None) -> Dict:
        """Search using Pinecone index"""
        if self.index is None:
            return self._empty_search_result(query, 'semantic_pinecone')
        
        results = self.index.query(
            vector=query_vector,
            top_k=min(top_k, self.config.max_top_k),
            include_metadata=True,
            filter=filter_dict
        )
        
        matches = results.to_dict()['matches']
        
        # Format results
        formatted_results = []
        for match in matches:
            formatted_results.append({
                'id': match['id'],
                'score': match['score'],
                'filename': match['metadata']['filename'],
                'page': match['metadata']['page'],
                'preview': match['metadata']['text_preview'],
                'relevance': self._get_relevance_label(match['score'])
            })
        
        logger.info(f"Found {len(formatted_results)} results")
        
        return {
            'success': True,
            'query': query,
            'total_results': len(formatted_results),
            'results': formatted_results,
            'method': 'semantic_pinecone'
        }
    
    def _get_relevance_label(self, score: float) -> str:
        """Get relevance label based on score"""
        if score > 0.8:
            return "High"
        elif score > 0.6:
            return "Medium"
        elif score > 0.4:
            return "Low"
        else:
            return "Very Low"
    
    def get_all_cached_chunks(self) -> List[Dict]:
        """Return all chunks from cache (for keyword index build). Per PDF Section 2–3."""
        chunks = []
        cache_dir = getattr(self.config, 'cache_dir', None)
        if not cache_dir or not os.path.isdir(cache_dir):
            return chunks
        for f in os.listdir(cache_dir):
            if f.endswith('.json') and f != 'documents.json':
                path = os.path.join(cache_dir, f)
                try:
                    with open(path, 'r') as fp:
                        data = json.load(fp)
                        if isinstance(data, list):
                            chunks.extend(data)
                        else:
                            chunks.append(data)
                except Exception as e:
                    logger.warning(f"Could not load cache {f}: {e}")
        return chunks
    
    def get_chunks_for_document(self, filename: str) -> List[Dict]:
        """Get all chunks for a document by filename (for similar-docs and document detail)."""
        all_chunks = self.get_all_cached_chunks()
        return [c for c in all_chunks if c.get('filename') == filename]
    
    def get_similar_documents(self, filename: str, top_k: int = 5) -> Dict[str, Any]:
        """Related works: doc representation = avg of chunk embeddings, then nearest docs. Per PDF Section 3.3."""
        if not self.initialized:
            if not self.initialize():
                return {'success': False, 'error': 'Engine not initialized'}
        chunks = self.get_chunks_for_document(filename)
        if not chunks:
            return {'success': True, 'query': filename, 'total_results': 0, 'results': [], 'method': 'similar_docs'}
        # Use up to first 10 chunks to compute doc vector
        texts = [c['text'] for c in chunks[:10]]
        with torch.no_grad():
            embs = self.model.encode(texts, convert_to_numpy=True)
        doc_vector = np.mean(embs, axis=0).astype('float32').reshape(1, -1)
        # Retrieve more to aggregate by document
        if self.use_faiss:
            if self.faiss_index is None or self.faiss_index.ntotal == 0:
                return {'success': True, 'query': filename, 'total_results': 0, 'results': [], 'method': 'similar_docs'}
            search_k = min(top_k * 5, self.faiss_index.ntotal)
            distances, indices = self.faiss_index.search(doc_vector, search_k)
            by_doc = {}
            for dist, idx in zip(distances[0], indices[0]):
                if idx < 0 or idx >= len(self.chunk_metadata):
                    continue
                meta = self.chunk_metadata[idx]
                fn = meta.get('filename', '')
                if fn == filename:
                    continue
                score = 1.0 / (1.0 + dist)
                if fn not in by_doc or by_doc[fn]['score'] < score:
                    by_doc[fn] = {'filename': fn, 'score': float(score), 'page': meta.get('page', 0), 'preview': meta.get('text_preview', '')}
            results = list(by_doc.values())[:top_k]
        else:
            if self.index is None:
                return {'success': True, 'query': filename, 'total_results': 0, 'results': [], 'method': 'similar_docs'}
            search_k = min(top_k * 5, 100)
            resp = self.index.query(vector=doc_vector.tolist()[0], top_k=search_k, include_metadata=True)
            matches = resp.to_dict().get('matches', []) if hasattr(resp, 'to_dict') else resp.get('matches', [])
            by_doc = {}
            for m in matches:
                fn = m.get('metadata', {}).get('filename', '')
                if fn == filename:
                    continue
                score = m.get('score', 0)
                if fn not in by_doc or by_doc[fn]['score'] < score:
                    by_doc[fn] = {'filename': fn, 'score': score, 'page': m.get('metadata', {}).get('page', 0), 'preview': m.get('metadata', {}).get('text_preview', '')}
            results = list(by_doc.values())[:top_k]
        return {'success': True, 'query': filename, 'total_results': len(results), 'results': results, 'method': 'similar_docs'}
    
    # ========== UTILITY FUNCTIONS ==========
    
    def get_documents(self) -> List[Dict]:
        """Get list of indexed documents"""
        return self.stats.get('documents', [])
    
    def get_stats(self) -> Dict:
        """Get engine statistics"""
        try:
            if self.index:
                stats = self.index.describe_index_stats()
                self.stats['total_chunks'] = stats['total_vector_count']
        except Exception as e:
            logger.warning(f"Failed to get stats: {e}")
        
        return self.stats
    
    def delete_document(self, filename: str) -> bool:
        """Delete a document from the index"""
        try:
            logger.info(f"Deleting document: {filename}")
            if self.use_faiss and self.faiss_index is not None:
                # FAISS: rebuild index from remaining cached chunks
                all_chunks = self.get_all_cached_chunks()
                remaining = [c for c in all_chunks if c.get('filename') != filename]
                cache_file = os.path.join(self.config.cache_dir, f"{filename}.json")
                if os.path.exists(cache_file):
                    os.remove(cache_file)
                if not remaining:
                    self.faiss_index = faiss.IndexFlatL2(self.dimension)
                    self.chunk_metadata = []
                    faiss.write_index(self.faiss_index, os.path.join(self.config.cache_dir, 'faiss.index'))
                    with open(os.path.join(self.config.cache_dir, 'faiss_metadata.pkl'), 'wb') as f:
                        pickle.dump(self.chunk_metadata, f)
                else:
                    vectors = self.generate_embeddings(remaining)
                    self.faiss_index = faiss.IndexFlatL2(self.dimension)
                    self.chunk_metadata = []
                    self._upload_vectors(vectors)
            else:
                if self.index is not None:
                    self.index.delete(filter={"filename": {"$eq": filename}})
            registry_path = os.path.join(self.config.cache_dir, 'documents.json')
            if os.path.exists(registry_path):
                with open(registry_path, 'r') as f:
                    docs = json.load(f)
                docs = [d for d in docs if d['filename'] != filename]
                with open(registry_path, 'w') as f:
                    json.dump(docs, f, indent=2)
                self.stats['documents'] = docs
                self.stats['total_documents'] = len(docs)
            cache_file = os.path.join(self.config.cache_dir, f"{filename}.json")
            if os.path.exists(cache_file):
                os.remove(cache_file)
            if self.use_faiss:
                self._update_stats()
            logger.info(f"Document {filename} deleted")
            return True
        except Exception as e:
            logger.error(f"Error deleting document: {e}")
            return False

    def clear_index(self) -> bool:
        """Clear all vectors from the index"""
        try:
            logger.warning("Clearing entire index")
            if self.use_faiss and self.faiss_index is not None:
                self.faiss_index = faiss.IndexFlatL2(self.dimension)
                self.chunk_metadata = []
                faiss.write_index(self.faiss_index, os.path.join(self.config.cache_dir, 'faiss.index'))
                with open(os.path.join(self.config.cache_dir, 'faiss_metadata.pkl'), 'wb') as f:
                    pickle.dump(self.chunk_metadata, f)
            else:
                if self.index is not None:
                    self.index.delete(delete_all=True, namespace="")
            for f in os.listdir(self.config.cache_dir):
                path = os.path.join(self.config.cache_dir, f)
                if os.path.isfile(path):
                    os.remove(path)
            self.stats['documents'] = []
            self.stats['total_documents'] = 0
            self.stats['total_chunks'] = 0
            logger.info("Index cleared")
            return True
        except Exception as e:
            logger.error(f"Error clearing index: {e}")
            return False