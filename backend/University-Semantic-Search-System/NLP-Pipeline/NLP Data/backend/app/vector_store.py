"""
Vector store abstraction layer for semantic search.
FAISS is the default; Pinecone is optional. Switching store does not change pipeline or API.
"""

import os
import logging
import pickle
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

# Optional imports
try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False
    faiss = None

try:
    from pinecone import Pinecone, ServerlessSpec
    PINECONE_AVAILABLE = True
except (ImportError, Exception):
    PINECONE_AVAILABLE = False
    Pinecone = ServerlessSpec = None


class IVectorStore(ABC):
    """
    Abstract interface for vector storage.
    Implementations: FaissVectorStore (default), PineconeVectorStore.
    """

    @abstractmethod
    def upsert(self, vectors: List[Tuple[str, List[float], Dict[str, Any]]]) -> None:
        """Insert or update vectors. Each item: (id, embedding, metadata)."""

    @abstractmethod
    def search(
        self,
        query_vector: List[float],
        top_k: int,
        filter_dict: Optional[Dict] = None,
    ) -> List[Dict[str, Any]]:
        """Return list of { id, score, metadata } sorted by similarity (desc)."""

    @abstractmethod
    def delete_by_metadata(self, filter_dict: Dict) -> int:
        """Delete vectors matching filter (e.g. {"filename": {"$eq": "x.pdf"}}). Return count deleted."""

    @abstractmethod
    def count(self) -> int:
        """Total number of vectors in the store."""

    @abstractmethod
    def load(self) -> bool:
        """Load existing index from disk or cloud. Return True if loaded."""

    @abstractmethod
    def save(self) -> bool:
        """Persist index (for FAISS). No-op for Pinecone. Return True on success."""


class FaissVectorStore(IVectorStore):
    """
    FAISS-backed vector store. Index and metadata saved under index_dir.
    Uses L2 distance; scores returned as 1 / (1 + distance).
    """

    def __init__(
        self,
        dimension: int,
        index_dir: str,
        index_type: str = "Flat",
        nlist: int = 100,
    ):
        self.dimension = dimension
        self.index_dir = index_dir
        self.index_type = index_type
        self.nlist = nlist
        self._index = None
        self._metadata: List[Dict] = []
        self._index_path = os.path.join(index_dir, "faiss.index")
        self._metadata_path = os.path.join(index_dir, "faiss_metadata.pkl")
        os.makedirs(index_dir, exist_ok=True)

    def _create_new_index(self):
        if not FAISS_AVAILABLE:
            raise RuntimeError("FAISS not installed. pip install faiss-cpu or faiss-gpu")
        if self.index_type == "IVF_FLAT" and self.nlist > 0:
            quantizer = faiss.IndexFlatL2(self.dimension)
            self._index = faiss.IndexIVFFlat(quantizer, self.dimension, self.nlist)
        else:
            self._index = faiss.IndexFlatL2(self.dimension)

    def load(self) -> bool:
        if not os.path.exists(self._index_path) or not os.path.exists(self._metadata_path):
            self._index = None
            self._metadata = []
            return False
        try:
            self._index = faiss.read_index(self._index_path)
            with open(self._metadata_path, "rb") as f:
                self._metadata = pickle.load(f)
            logger.info("Loaded FAISS index: %d vectors", self._index.ntotal)
            return True
        except Exception as e:
            logger.warning("Failed to load FAISS index: %s", e)
            self._index = None
            self._metadata = []
            return False

    def save(self) -> bool:
        if self._index is None:
            return True
        try:
            os.makedirs(self.index_dir, exist_ok=True)
            faiss.write_index(self._index, self._index_path)
            with open(self._metadata_path, "wb") as f:
                pickle.dump(self._metadata, f)
            logger.info("Saved FAISS index: %d vectors", self._index.ntotal)
            return True
        except Exception as e:
            logger.error("Failed to save FAISS index: %s", e)
            return False

    def upsert(self, vectors: List[Tuple[str, List[float], Dict[str, Any]]]) -> None:
        if not vectors:
            return
        import numpy as np
        if self._index is None:
            self._create_new_index()
        emb = np.array([v[1] for v in vectors], dtype="float32")
        self._index.add(emb)
        for vid, _, meta in vectors:
            self._metadata.append({
                "id": vid,
                "filename": meta.get("filename", ""),
                "page": meta.get("page", 0),
                "chunk_index": meta.get("chunk_index", 0),
                "text_preview": meta.get("text_preview", ""),
                "timestamp": meta.get("timestamp", ""),
            })
        logger.info("Upserted %d vectors; total %d", len(vectors), self._index.ntotal)

    def search(
        self,
        query_vector: List[float],
        top_k: int,
        filter_dict: Optional[Dict] = None,
    ) -> List[Dict[str, Any]]:
        if self._index is None:
            return []
        import numpy as np
        q = np.array([query_vector], dtype="float32")
        k = min(top_k * 2, self._index.ntotal) if self._index.ntotal else 0
        if k == 0:
            return []
        distances, indices = self._index.search(q, k)
        results = []
        filter_fn = filter_dict.get("filename", {}).get("$eq") if filter_dict else None
        for dist, idx in zip(distances[0], indices[0]):
            if idx < 0 or idx >= len(self._metadata):
                continue
            meta = self._metadata[idx]
            if filter_fn and meta.get("filename") != filter_fn:
                continue
            score = 1.0 / (1.0 + float(dist))
            results.append({"id": meta.get("id"), "score": score, "metadata": meta})
            if len(results) >= top_k:
                break
        return results

    def delete_by_metadata(self, filter_dict: Dict) -> int:
        if not filter_dict or self._index is None:
            return 0
        filter_fn = filter_dict.get("filename", {}).get("$eq")
        if not filter_fn:
            return 0
        to_keep = [(i, m) for i, m in enumerate(self._metadata) if m.get("filename") != filter_fn]
        deleted = len(self._metadata) - len(to_keep)
        if deleted == 0:
            return 0
        import numpy as np
        if not to_keep:
            self._index.reset()
            self._metadata = []
            self.save()
            return deleted
        indices, new_meta = [i for i, _ in to_keep], [m for _, m in to_keep]
        vectors = np.vstack([self._index.reconstruct_n(i, 1) for i in indices])
        self._index.reset()
        self._index.add(vectors)
        self._metadata = new_meta
        self.save()
        return deleted

    def count(self) -> int:
        return self._index.ntotal if self._index is not None else 0


class PineconeVectorStore(IVectorStore):
    """
    Pinecone-backed vector store. Same interface; load/save are no-ops for persistence.
    """

    def __init__(
        self,
        api_key: str,
        index_name: str,
        dimension: int,
        cloud: str = "aws",
        region: str = "us-east-1",
        metric: str = "cosine",
    ):
        if not PINECONE_AVAILABLE:
            raise RuntimeError("Pinecone not available. Install: pip install pinecone")
        self.api_key = api_key
        self.index_name = index_name
        self.dimension = dimension
        self.cloud = cloud
        self.region = region
        self.metric = metric
        self._pc = None
        self._index = None

    def _ensure_index(self):
        if self._index is not None:
            return
        self._pc = Pinecone(api_key=self.api_key)
        if self.index_name not in self._pc.list_indexes().names():
            self._pc.create_index(
                name=self.index_name,
                dimension=self.dimension,
                metric=self.metric,
                spec=ServerlessSpec(cloud=self.cloud, region=self.region),
            )
        self._index = self._pc.Index(self.index_name)

    def load(self) -> bool:
        try:
            self._ensure_index()
            return True
        except Exception as e:
            logger.warning("Pinecone load failed: %s", e)
            return False

    def save(self) -> bool:
        return True

    def upsert(self, vectors: List[Tuple[str, List[float], Dict[str, Any]]]) -> None:
        if not vectors:
            return
        self._ensure_index()
        batch = [{"id": vid, "values": vec, "metadata": meta} for vid, vec, meta in vectors]
        for i in range(0, len(batch), 100):
            self._index.upsert(vectors=batch[i : i + 100])
        logger.info("Upserted %d vectors to Pinecone", len(vectors))

    def search(
        self,
        query_vector: List[float],
        top_k: int,
        filter_dict: Optional[Dict] = None,
    ) -> List[Dict[str, Any]]:
        self._ensure_index()
        resp = self._index.query(
            vector=query_vector,
            top_k=top_k,
            include_metadata=True,
            filter=filter_dict,
        )
        matches = resp.to_dict().get("matches", []) if hasattr(resp, "to_dict") else resp.get("matches", [])
        return [
            {"id": m["id"], "score": m.get("score", 0.0), "metadata": m.get("metadata", {})}
            for m in matches
        ]

    def delete_by_metadata(self, filter_dict: Dict) -> int:
        if not filter_dict:
            return 0
        self._ensure_index()
        self._index.delete(filter=filter_dict)
        logger.info("Deleted vectors by filter: %s", filter_dict)
        return -1

    def count(self) -> int:
        self._ensure_index()
        try:
            return self._index.describe_index_stats().get("total_vector_count", 0)
        except Exception:
            return 0


def create_vector_store(config=None) -> IVectorStore:
    """
    Factory: returns FaissVectorStore by default, or PineconeVectorStore when
    PINECONE_API_KEY is set and Pinecone is available. Uses config for paths and dimensions.
    """
    from app.config import config as config_module
    cfg = config_module.config if config is None else config
    dimension = 384
    try:
        from sentence_transformers import SentenceTransformer
        m = SentenceTransformer(cfg.embedding_model)
        dimension = m.get_sentence_embedding_dimension()
    except Exception:
        pass
    use_faiss = getattr(cfg, "use_faiss", None)
    api_key = os.environ.get("PINECONE_API_KEY") or getattr(cfg, "pinecone_api_key", None)
    if use_faiss is None:
        use_faiss = not (api_key and PINECONE_AVAILABLE)
    index_dir = getattr(cfg, "artifacts_indexes_dir", None) or os.path.join(cfg.cache_dir, "indexes")
    os.makedirs(index_dir, exist_ok=True)
    if use_faiss or not (api_key and PINECONE_AVAILABLE):
        return FaissVectorStore(
            dimension=dimension,
            index_dir=index_dir,
            index_type=getattr(cfg, "faiss_index_type", "Flat"),
            nlist=getattr(cfg, "faiss_nlist", 100),
        )
    return PineconeVectorStore(
        api_key=api_key,
        index_name=cfg.index_name,
        dimension=dimension,
        cloud=cfg.pinecone_cloud,
        region=cfg.pinecone_region,
        metric=cfg.pinecone_metric,
    )
