"""
Information-retrieval metrics for semantic search evaluation.

All functions operate on ranked lists of document identifiers (e.g. PDF filenames).
Relevance is binary unless graded relevance is supplied for nDCG.
"""

from __future__ import annotations

import math
from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Set


def _top_k_slice(ranked: Sequence[str], k: int) -> List[str]:
    """First k items of the ranked list (may be shorter if fewer results)."""
    if k <= 0:
        return []
    return list(ranked[:k])


def precision_at_k(ranked: Sequence[str], relevant: Set[str], k: int) -> float:
    """
    Precision@K: fraction of the top-K retrieved documents that are relevant.

    Measures: retrieval accuracy in the short ranked list shown to users.
    Suitable for semantic search because users scan only a few results; it
    penalizes irrelevant items in the top ranks.

    Useful when: you care about the quality of the first K positions (UI lists,
    “top 5” snippets), not full corpus coverage.
    """
    top = _top_k_slice(ranked, k)
    hits = sum(1 for doc in top if doc in relevant)
    # Standard IR definition: divide by K (unfilled ranks count as non-relevant).
    return hits / k if k else 0.0


def hit_rate_at_k(ranked: Sequence[str], relevant: Set[str], k: int) -> float:
    """
    Hit Rate@K (Success@K): 1 if any relevant document appears in the top K, else 0.

    Complements Precision@K when each query has a **single** primary relevant document:
    strict P@K uses denominator K, so a perfect rank-1 hit yields P@K = 1/K. Hit@K is
    often easier to read for “did the user see a correct answer within K positions?”
    """
    if not relevant or k <= 0:
        return 0.0
    top = set(_top_k_slice(ranked, k))
    return 1.0 if relevant & top else 0.0


def recall_at_k(ranked: Sequence[str], relevant: Set[str], k: int) -> float:
    """
    Recall@K: fraction of all relevant documents that appear in the top-K results.

    Measures: whether the system surfaces enough of the true answers within K.
    Suitable for semantic search when multiple documents may answer a query and
    missing one matters (e.g. related theses).

    Useful when: ground truth lists several relevant docs and you want to see
    if they are retrieved within the cutoff K (note: recall is capped by K if
    there are more relevant docs than K).
    """
    if not relevant:
        return 0.0
    top = _top_k_slice(ranked, k)
    retrieved_relevant = sum(1 for doc in top if doc in relevant)
    return retrieved_relevant / len(relevant)


def f1_at_k(ranked: Sequence[str], relevant: Set[str], k: int) -> float:
    """
    F1@K: harmonic mean of Precision@K and Recall@K.

    Measures: a single balance between “precision in the top K” and
    “coverage of relevant docs in the top K”.
    Suitable for semantic search when both false positives in the short list
    and missed relevant documents matter.

    Useful when: you want one scalar that reflects both ranking purity and
    recall within K (common in ad-hoc IR reporting).
    """
    p = precision_at_k(ranked, relevant, k)
    r = recall_at_k(ranked, relevant, k)
    if p + r == 0.0:
        return 0.0
    return 2.0 * p * r / (p + r)


def reciprocal_rank(ranked: Sequence[str], relevant: Set[str]) -> float:
    """
    Reciprocal rank: 1 / rank of the first relevant document (1-based), or 0.

    Single-query component of MRR.
    """
    if not relevant:
        return 0.0
    for i, doc in enumerate(ranked, start=1):
        if doc in relevant:
            return 1.0 / i
    return 0.0


def mean_reciprocal_rank(
    ranked_lists: Iterable[Sequence[str]],
    relevant_sets: Iterable[Set[str]],
) -> float:
    """
    MRR: mean over queries of reciprocal rank of the first relevant hit.

    Measures: how quickly the first correct answer appears in the ranking.
    Suitable for semantic search and QA-style tasks where one best document
    often suffices.

    Useful when: the user wants the first scroll/page to contain a good answer;
    strongly rewards moving any relevant item to rank 1.
    """
    rrs: List[float] = []
    for ranked, rel in zip(ranked_lists, relevant_sets):
        if not rel:
            continue
        rrs.append(reciprocal_rank(ranked, rel))
    if not rrs:
        return 0.0
    return sum(rrs) / len(rrs)


def _gain(doc: str, relevant: Set[str], grades: Optional[Mapping[str, float]]) -> float:
    if grades is not None and doc in grades:
        return float(grades[doc])
    return 1.0 if doc in relevant else 0.0


def dcg_at_k(
    ranked: Sequence[str],
    relevant: Set[str],
    k: int,
    relevance_grades: Optional[Mapping[str, float]] = None,
) -> float:
    """Discounted cumulative gain at K (uses log2(i+1) discount, i = 1..K)."""
    top = _top_k_slice(ranked, k)
    total = 0.0
    for i, doc in enumerate(top, start=1):
        g = _gain(doc, relevant, relevance_grades)
        total += g / math.log2(i + 1)
    return total


def ndcg_at_k(
    ranked: Sequence[str],
    relevant: Set[str],
    k: int,
    relevance_grades: Optional[Mapping[str, float]] = None,
) -> float:
    """
    nDCG@K: DCG@K normalized by the ideal DCG@K for this query.

    Measures: ranking quality with graded or binary relevance, rewarding
    placing highly relevant documents higher (discount for lower ranks).
    Suitable for semantic search when some answers are better than others or
    when you model graded relevance.

    Useful when: order inside the top K matters beyond yes/no relevance
    (e.g. highly related vs. marginally related theses).
    """
    if k <= 0:
        return 0.0

    # Ideal gains: sort all possible gains descending and take top k
    corpus_gains: List[float] = []
    if relevance_grades:
        corpus_gains = sorted(relevance_grades.values(), reverse=True)
    else:
        corpus_gains = [1.0] * len(relevant)

    ideal_top: List[float] = []
    for g in corpus_gains:
        if len(ideal_top) >= k:
            break
        ideal_top.append(g)
    while len(ideal_top) < k:
        ideal_top.append(0.0)

    idcg = sum(g / math.log2(i + 1) for i, g in enumerate(ideal_top, start=1))
    if idcg == 0.0:
        return 0.0
    dcg = dcg_at_k(ranked, relevant, k, relevance_grades)
    return dcg / idcg


def aggregate_mean(values: Sequence[float]) -> float:
    """Arithmetic mean; empty sequence -> 0.0."""
    if not values:
        return 0.0
    return sum(values) / len(values)
