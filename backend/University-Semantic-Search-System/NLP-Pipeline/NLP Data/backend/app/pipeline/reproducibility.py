"""Reproducibility utilities for fixing random seeds and logging versions."""
import random
import numpy as np
import logging
from typing import Dict, Optional
import sys
import platform

logger = logging.getLogger(__name__)


def fix_random_seeds(seed: int = 42, fix_all: bool = True) -> None:
    """
    Fix random seeds for reproducibility.
    
    Args:
        seed: Random seed value
        fix_all: Whether to fix all random seeds (numpy, random, torch, etc.)
    """
    logger.info(f"Setting random seed to {seed} for reproducibility")
    
    # Python random
    random.seed(seed)
    
    # NumPy
    np.random.seed(seed)
    
    if fix_all:
        # Try to fix PyTorch if available
        try:
            import torch
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed(seed)
                torch.cuda.manual_seed_all(seed)
            torch.backends.cudnn.deterministic = True
            torch.backends.cudnn.benchmark = False
            logger.info("PyTorch random seeds fixed")
        except ImportError:
            pass
        
        # Try to fix TensorFlow if available
        try:
            import tensorflow as tf
            tf.random.set_seed(seed)
            logger.info("TensorFlow random seed fixed")
        except ImportError:
            pass


def get_system_versions() -> Dict[str, str]:
    """
    Get versions of key libraries and system information.
    
    Returns:
        Dictionary with version information
    """
    versions = {
        'python_version': sys.version.split()[0],
        'platform': platform.platform(),
    }
    
    # Try to get library versions
    libraries = [
        'numpy', 'pandas', 'torch', 'tensorflow', 'sklearn',
        'sentence_transformers', 'faiss', 'transformers'
    ]
    
    for lib in libraries:
        try:
            if lib == 'sklearn':
                import sklearn
                versions['scikit-learn'] = sklearn.__version__
            elif lib == 'sentence_transformers':
                import sentence_transformers
                versions['sentence-transformers'] = sentence_transformers.__version__
            else:
                module = __import__(lib)
                versions[lib] = getattr(module, '__version__', 'unknown')
        except ImportError:
            versions[lib] = 'not installed'
        except Exception as e:
            versions[lib] = f'error: {e}'
    
    return versions


def log_system_versions() -> Dict[str, str]:
    """
    Log system and library versions.
    
    Returns:
        Dictionary with version information
    """
    versions = get_system_versions()
    
    logger.info("System and Library Versions:")
    for key, value in versions.items():
        logger.info(f"  - {key}: {value}")
    
    return versions
