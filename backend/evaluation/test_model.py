#!/usr/bin/env python3
"""
Run semantic search evaluation against the live SemanticSearchEngine.

Usage (from the backend directory that contains `app/` and `evaluation/`):

    python evaluation/test_model.py

This reuses ``SemanticSearchEngine.search`` (embeddings + FAISS/Pinecone) and
does not duplicate core retrieval logic.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

# Ensure imports resolve: backend root is parent of `evaluation/`
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.semantic_engine import SemanticSearchEngine  # noqa: E402

from evaluation.metrics import (  # noqa: E402
    aggregate_mean,
    f1_at_k,
    hit_rate_at_k,
    mean_reciprocal_rank,
    ndcg_at_k,
    precision_at_k,
    recall_at_k,
    reciprocal_rank,
)


EVAL_DIR = Path(__file__).resolve().parent
DATASET_PATH = EVAL_DIR / "dataset.json"
RESULTS_DIR = EVAL_DIR / "results"
REPORT_PATH = RESULTS_DIR / "evaluation_report.md"


def load_dataset(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def ranked_filenames_from_search_results(results: List[Dict[str, Any]]) -> List[str]:
    """
    Collapse chunk-level hits to a document-level ranking: first occurrence wins
    (preserves order of the semantic ranker).
    """
    seen: Set[str] = set()
    out: List[str] = []
    for row in results:
        fn = (row.get("filename") or "").strip()
        if not fn or fn in seen:
            continue
        seen.add(fn)
        out.append(fn)
    return out


def run_evaluation(
    top_k_retrieve: int = 30,
    k_values: Tuple[int, ...] = (5, 10),
) -> Dict[str, Any]:
    dataset = load_dataset(DATASET_PATH)
    queries = dataset["queries"]

    # Reuse the same backend selection as the app (FAISS when no Pinecone key, etc.)
    engine = SemanticSearchEngine()
    if not engine.initialize():
        raise RuntimeError("SemanticSearchEngine failed to initialize (model or index).")

    per_query: List[Dict[str, Any]] = []
    all_ranked: List[List[str]] = []
    all_relevant: List[Set[str]] = []

    for item in queries:
        qid = item["id"]
        qtext = item["query"]
        relevant = set(item.get("relevant_filenames") or [])

        raw = engine.search(qtext, top_k=top_k_retrieve)
        success = raw.get("success") is True
        rows = raw.get("results") or []
        ranked = ranked_filenames_from_search_results(rows) if success else []

        row_metrics: Dict[str, Any] = {
            "id": qid,
            "query": qtext,
            "success": success,
            "method": raw.get("method"),
            "error": raw.get("error"),
            "num_chunk_hits": len(rows),
            "ranked_documents": ranked,
            "relevant_filenames": sorted(relevant),
        }

        if relevant:
            row_metrics["mrr_contribution"] = reciprocal_rank(ranked, relevant)
            row_metrics["ndcg@10"] = ndcg_at_k(ranked, relevant, min(10, top_k_retrieve))
            for k in k_values:
                kk = min(k, top_k_retrieve)
                row_metrics[f"precision@{k}"] = precision_at_k(ranked, relevant, kk)
                row_metrics[f"recall@{k}"] = recall_at_k(ranked, relevant, kk)
                row_metrics[f"f1@{k}"] = f1_at_k(ranked, relevant, kk)
                row_metrics[f"hit@{k}"] = hit_rate_at_k(ranked, relevant, kk)
        else:
            row_metrics["note"] = "skipped relevance metrics (empty relevant set)"

        per_query.append(row_metrics)
        all_ranked.append(ranked)
        all_relevant.append(relevant)

    # Macro averages over queries that have non-empty relevance
    summary: Dict[str, Any] = {
        "num_queries": len(queries),
        "top_k_retrieve": top_k_retrieve,
        "k_values": list(k_values),
        "engine_use_faiss": engine.use_faiss,
        "total_chunks_indexed": engine.stats.get("total_chunks", 0),
        "mrr": mean_reciprocal_rank(all_ranked, all_relevant),
    }
    for k in k_values:
        kk = min(k, top_k_retrieve)
        ps = [
            precision_at_k(r, rel, kk)
            for r, rel in zip(all_ranked, all_relevant)
            if rel
        ]
        rs = [recall_at_k(r, rel, kk) for r, rel in zip(all_ranked, all_relevant) if rel]
        fs = [f1_at_k(r, rel, kk) for r, rel in zip(all_ranked, all_relevant) if rel]
        hs = [hit_rate_at_k(r, rel, kk) for r, rel in zip(all_ranked, all_relevant) if rel]
        summary[f"mean_precision@{k}"] = aggregate_mean(ps)
        summary[f"mean_recall@{k}"] = aggregate_mean(rs)
        summary[f"mean_f1@{k}"] = aggregate_mean(fs)
        summary[f"mean_hit_rate@{k}"] = aggregate_mean(hs)

    ndcgs = [
        ndcg_at_k(r, rel, min(10, top_k_retrieve))
        for r, rel in zip(all_ranked, all_relevant)
        if rel
    ]
    summary["mean_ndcg@10"] = aggregate_mean(ndcgs)

    return {
        "summary": summary,
        "per_query": per_query,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _fmt_float(x: float) -> str:
    return f"{x:.4f}"


def write_report(payload: Dict[str, Any]) -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    s = payload["summary"]
    lines: List[str] = [
        "# Semantic Search Model Evaluation Report",
        "",
        f"**Generated (UTC):** {payload['generated_at']}",
        "",
        "## 1. Overview",
        "",
        "This report evaluates the **University Semantic Search System** retrieval quality by running",
        "natural-language queries through `SemanticSearchEngine.search` and comparing ranked **documents**",
        "(PDF filenames) to hand-labeled relevant files in `evaluation/dataset.json`.",
        "",
        "Chunk-level hits are collapsed to **document-level** rankings: the first time a filename appears",
        "in the result list defines its rank. This matches how users perceive “which thesis was found.”",
        "",
        "## 2. Dataset",
        "",
        "- **Source:** `evaluation/dataset.json`",
        "- **Unit of relevance:** PDF `filename` (same field as in `cache/documents.json`).",
        "- **Queries:** short, realistic academic search phrases aligned with titles/topics in the cached corpus.",
        "",
        "## 3. Metrics (what, why, when)",
        "",
        "| Metric | What it measures | Why it fits semantic search | When it is most useful |",
        "|--------|------------------|----------------------------|-------------------------|",
        "| **Precision@K** | (# relevant in top *K*) / *K* (TREC-style) | Penalizes irrelevant items in fixed *K* slots; with **one** labeled relevant doc at rank 1, P@K = 1/*K* | Fixed cutoff *K* and pooled evaluation |",
        "| **Hit Rate@K** | 1 if any relevant appears in top *K*, else 0 (then averaged) | Simple “success within *K*” for single-target queries | When each query has one must-find document |",
        "| **Recall@K** | Share of all labeled relevant docs found in top-*K* | Shows whether multiple correct theses appear within *K* | Multi-document ground truth, discovery tasks |",
        "| **F1@K** | Harmonic mean of Precision@K and Recall@K | One score balancing accuracy vs. coverage in the top *K* | When both precision and recall in top-*K* matter |",
        "| **MRR** | Average \\(1/\\text{rank}\\) of the **first** relevant hit | Rewards putting any correct answer near the top | “Find one good document” behavior |",
        "| **nDCG@10** | Discounted gain with ideal normalization | Rewards **ordering**: better docs higher; uses rank discount | When rank within the first positions matters |",
        "",
        "## 4. Run configuration",
        "",
        f"- **Retrieval depth (chunks):** {s['top_k_retrieve']}",
        f"- **K for P/R/F1:** {', '.join(str(k) for k in s['k_values'])}",
        f"- **Vector backend:** {'FAISS (local)' if s['engine_use_faiss'] else 'Pinecone / other'}",
        f"- **Indexed chunks (engine stats):** {s['total_chunks_indexed']}",
        f"- **Queries evaluated:** {s['num_queries']}",
        "",
        "## 5. Aggregate results",
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| MRR | {_fmt_float(s['mrr'])} |",
        f"| Mean nDCG@10 | {_fmt_float(s['mean_ndcg@10'])} |",
    ]
    for k in s["k_values"]:
        lines.append(f"| Mean Precision@{k} | {_fmt_float(s[f'mean_precision@{k}'])} |")
        lines.append(f"| Mean Recall@{k} | {_fmt_float(s[f'mean_recall@{k}'])} |")
        lines.append(f"| Mean F1@{k} | {_fmt_float(s[f'mean_f1@{k}'])} |")
        lines.append(f"| Mean Hit Rate@{k} | {_fmt_float(s[f'mean_hit_rate@{k}'])} |")

    lines.extend(
        [
            "",
            "## 6. Per-query summary",
            "",
            "| ID | P@5 | R@5 | F1@5 | Hit@5 | P@10 | R@10 | F1@10 | Hit@10 | MRR | nDCG@10 |",
            "|----|-----|-----|------|-------|------|------|-------|--------|-----|---------|",
        ]
    )
    k5, k10 = 5, 10
    for row in payload["per_query"]:
        rel = set(row.get("relevant_filenames") or [])
        if not rel:
            lines.append(
                f"| {row['id']} | — | — | — | — | — | — | — | — | — | — |"
            )
            continue
        ranked = row["ranked_documents"]
        p5 = _fmt_float(precision_at_k(ranked, rel, min(k5, s["top_k_retrieve"])))
        r5 = _fmt_float(recall_at_k(ranked, rel, min(k5, s["top_k_retrieve"])))
        f5 = _fmt_float(f1_at_k(ranked, rel, min(k5, s["top_k_retrieve"])))
        h5 = _fmt_float(hit_rate_at_k(ranked, rel, min(k5, s["top_k_retrieve"])))
        p10 = _fmt_float(precision_at_k(ranked, rel, min(k10, s["top_k_retrieve"])))
        r10 = _fmt_float(recall_at_k(ranked, rel, min(k10, s["top_k_retrieve"])))
        f10 = _fmt_float(f1_at_k(ranked, rel, min(k10, s["top_k_retrieve"])))
        h10 = _fmt_float(hit_rate_at_k(ranked, rel, min(k10, s["top_k_retrieve"])))
        mrr_c = _fmt_float(row.get("mrr_contribution", 0.0))
        nd = _fmt_float(row.get("ndcg@10", 0.0))
        lines.append(
            f"| {row['id']} | {p5} | {r5} | {f5} | {h5} | {p10} | {r10} | {f10} | {h10} | {mrr_c} | {nd} |"
        )

    lines.extend(
        [
            "",
            "## 7. Interpretation",
            "",
            "- **High MRR / high P@K:** the embedding model and index place the correct thesis (filename)",
            "  near the top for topic-aligned queries.",
            "- **Low recall@10 with single relevant doc:** the right document is often missing from the",
            "  first 10 *chunks* after deduplication—check indexing, chunking, or query wording.",
        "- **Low nDCG@10 with good MRR:** relevant doc appears but below less relevant neighbors;",
        "  ranking order may need re-ranking or a different embedding model.",
        "- **Low mean Precision@K but Hit Rate@K = 1:** common when each query has a single relevant",
        "  label: TREC-style P@K divides by *K*, so a lone correct hit at rank 1 yields P@K = 1/*K*.",
            "- **Zero metrics:** engine not initialized, empty index, or filenames in the dataset do not",
            "  match `documents.json` / cache (typo check).",
            "",
            "## 8. Raw ranked document lists",
            "",
        ]
    )
    for row in payload["per_query"]:
        lines.append(f"### {row['id']}: {row['query'][:80]}{'…' if len(row['query']) > 80 else ''}")
        lines.append("")
        lines.append(f"- **Success:** {row.get('success')}  **Method:** {row.get('method')}")
        if row.get("error"):
            lines.append(f"- **Error:** {row['error']}")
        lines.append(f"- **Ranked filenames:** `{row['ranked_documents']}`")
        lines.append(f"- **Relevant (ground truth):** `{row.get('relevant_filenames', [])}`")
        lines.append("")

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    payload = run_evaluation()
    write_report(payload)
    # Compact stdout for CI / quick checks
    s = payload["summary"]
    print("Evaluation complete.")
    print(f"  MRR={s['mrr']:.4f}  mean nDCG@10={s['mean_ndcg@10']:.4f}")
    for k in s["k_values"]:
        print(
            f"  P@{k}={s[f'mean_precision@{k}']:.4f}  "
            f"R@{k}={s[f'mean_recall@{k}']:.4f}  "
            f"F1@{k}={s[f'mean_f1@{k}']:.4f}  "
            f"Hit@{k}={s[f'mean_hit_rate@{k}']:.4f}"
        )
    print(f"  Report written to: {REPORT_PATH}")


if __name__ == "__main__":
    main()
