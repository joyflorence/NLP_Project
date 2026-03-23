"""
Configuration settings for the Semantic Search Engine
"""

import os
from dataclasses import dataclass
import torch
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

@dataclass
class Config:
    """Configuration settings for the search engine"""
    
    # Paths
    base_dir: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    local_data_dir: str = os.path.join(base_dir, 'data')
    upload_dir: str = os.path.join(base_dir, 'uploads')
    cache_dir: str = os.path.join(base_dir, 'cache')
    logs_dir: str = os.path.join(base_dir, 'logs')
    # Artifacts (pipeline outputs) — single root for indexes, chunks, logs, etc.
    artifacts_dir: str = os.path.join(base_dir, 'artifacts')
    artifacts_indexes_dir: str = None  # set in __post_init__
    artifacts_logs_dir: str = None
    artifacts_chunks_dir: str = None
    artifacts_extracted_text_dir: str = None
    artifacts_cleaned_text_dir: str = None
    artifacts_reports_dir: str = None
    
    # Model settings
    embedding_model: str = 'all-MiniLM-L6-v2'  # 384-dim embeddings
    device: str = 'cuda' if torch.cuda.is_available() else 'cpu'
    batch_size: int = 32
    
    # Chunking settings (per Section 2.1 - 250-400 words, 40-80 overlap)
    chunk_size: int = 300  # words per chunk
    chunk_overlap: int = 50  # overlap between chunks
    
    # FAISS local index settings (Section 2.2, 3.1)
    use_faiss: bool = os.getenv('USE_FAISS', '0') == '1'
    faiss_index_type: str = 'IVF_FLAT'  # or 'Flat', 'HNSW'
    faiss_nlist: int = 100  # number of clusters for IVF
    faiss_nprobe: int = 10  # number of clusters to search
    
    # Pinecone settings (optional, for cloud vector storage)
    use_pinecone: bool = os.getenv('USE_PINECONE', '1') == '1'
    index_name: str = 'semantic-search-prod'
    pinecone_cloud: str = 'aws'
    pinecone_region: str = 'us-east-1'
    pinecone_metric: str = 'cosine'
    
    # Keyword baseline settings (Section 3.2 - required for evaluation)
    keyword_method: str = 'bm25'  # 'tfidf' or 'bm25'
    bm25_k1: float = 1.5  # BM25 term frequency saturation
    bm25_b: float = 0.75  # BM25 document length normalization
    
    # Search settings
    default_top_k: int = 10
    max_top_k: int = 50
    similarity_threshold: float = 0.3
    
    # Evaluation settings (Section 5.2)
    eval_top_k_values: list = None  # [5, 10] for P@K
    
    # App settings
    debug: bool = os.getenv('FLASK_DEBUG', '1') == '1'
    host: str = os.getenv('HOST', '0.0.0.0')
    port: int = int(os.getenv('PORT', 5000))
    secret_key: str = os.getenv('FLASK_SECRET_KEY', 'dev-secret-key-change-in-production')
    
    # File upload
    allowed_extensions: set = frozenset({'pdf'})
    max_content_length: int = int(os.getenv('MAX_CONTENT_LENGTH', 50 * 1024 * 1024))  # 50MB
    
    # Database
    db_path: str = os.path.join(base_dir, 'cache', 'semantic_search.db')
    
    # Create directories on init (Section 2.3 + artifacts layout)
    def __post_init__(self):
        # Set eval defaults
        if self.eval_top_k_values is None:
            self.eval_top_k_values = [5, 10]
        # Artifacts subdirs
        self.artifacts_indexes_dir = os.path.join(self.artifacts_dir, 'indexes')
        self.artifacts_logs_dir = os.path.join(self.artifacts_dir, 'logs')
        self.artifacts_chunks_dir = os.path.join(self.artifacts_dir, 'chunks')
        self.artifacts_extracted_text_dir = os.path.join(self.artifacts_dir, 'extracted_text')
        self.artifacts_cleaned_text_dir = os.path.join(self.artifacts_dir, 'cleaned_text')
        self.artifacts_reports_dir = os.path.join(self.artifacts_dir, 'reports')
        raw_pdfs = os.path.join(self.local_data_dir, 'raw_pdfs')
        extracted_text = os.path.join(self.local_data_dir, 'extracted_text')
        index_dir = os.path.join(self.local_data_dir, 'index')
        all_dirs = [
            self.local_data_dir, self.upload_dir, self.cache_dir, self.logs_dir,
            raw_pdfs, extracted_text, index_dir,
            self.artifacts_dir, self.artifacts_indexes_dir, self.artifacts_logs_dir,
            self.artifacts_chunks_dir, self.artifacts_extracted_text_dir,
            self.artifacts_cleaned_text_dir, self.artifacts_reports_dir,
        ]
        for directory in all_dirs:
            os.makedirs(directory, exist_ok=True)


# Global config instance
config = Config()
