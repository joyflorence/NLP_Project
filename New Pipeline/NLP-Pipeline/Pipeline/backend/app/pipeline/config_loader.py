"""Configuration loader for the pipeline."""
import yaml
import os
from pathlib import Path
from typing import Dict, Any


def load_config(config_path: str = "config/pipeline_config.yaml") -> Dict[str, Any]:
    """Load configuration from YAML file."""
    config_file = Path(config_path)
    if not config_file.exists():
        # Use default config if not found
        return get_default_config()
    
    with open(config_file, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)
    
    # Resolve relative paths
    base_dir = Path.cwd()
    for key in ['raw_pdfs', 'metadata', 'extracted_text', 'cleaned_text', 
                'chunks', 'embeddings', 'indexes', 'reports']:
        if key in config.get('paths', {}):
            path = config['paths'][key]
            if not os.path.isabs(path):
                config['paths'][key] = str(base_dir / path)
    
    return config


def get_default_config() -> Dict[str, Any]:
    """Return default configuration."""
    base_dir = Path.cwd()
    return {
        'paths': {
            'raw_pdfs': str(base_dir / 'data/raw_pdfs'),
            'metadata': str(base_dir / 'data/metadata.csv'),
            'extracted_text': str(base_dir / 'artifacts/extracted_text'),
            'cleaned_text': str(base_dir / 'artifacts/cleaned_text'),
            'chunks': str(base_dir / 'artifacts/chunks'),
            'embeddings': str(base_dir / 'artifacts/embeddings'),
            'indexes': str(base_dir / 'artifacts/indexes'),
            'reports': str(base_dir / 'artifacts/reports'),
        },
        'extraction': {
            'min_word_count': 50,
            'primary_extractor': 'pymupdf',
            'fallback_extractor': 'pdfplumber',
        },
        'cleaning': {
            'remove_references': True,
            'remove_bibliography': True,
            'abstract_detection': True,
            'normalize_unicode': True,
            'remove_hyphenation': True,
            'remove_page_numbers': True,
        },
        'chunking': {
            'target_words': 350,
            'min_words': 250,
            'max_words': 450,
            'overlap_words': 60,
            'paragraph_aware': True,
            'sentence_aware': True,
        },
        'embeddings': {
            'model_name': 'sentence-transformers/all-MiniLM-L6-v2',
            'batch_size': 32,
            'normalize': True,
            'device': 'cpu',
        },
        'duplicates': {
            'exact_hash': True,
            'near_duplicate_threshold': 0.95,
            'use_tfidf': True,
        },
        'faiss': {
            'index_type': 'IndexFlatIP',
            'metric': 'cosine',
        },
        'logging': {
            'level': 'INFO',
            'log_file': str(base_dir / 'artifacts/logs/pipeline.log'),
        },
    }
