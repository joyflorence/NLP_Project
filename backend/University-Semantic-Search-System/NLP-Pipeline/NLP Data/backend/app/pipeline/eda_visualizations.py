"""Exploratory Data Analysis (EDA) visualization module."""
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from pathlib import Path
import logging
from typing import Dict, Optional
import json

logger = logging.getLogger(__name__)


def plot_document_length_distribution(
    cleaning_report: pd.DataFrame,
    output_file: Path
) -> None:
    """
    Generate histogram of document word counts after cleaning.
    
    Args:
        cleaning_report: DataFrame with cleaning statistics
        output_file: Path to save the plot
    """
    if len(cleaning_report) == 0 or 'cleaned_word_count' not in cleaning_report.columns:
        logger.warning("Cannot generate document length distribution: missing data")
        return
    
    word_counts = cleaning_report['cleaned_word_count'].values
    word_counts = word_counts[word_counts > 0]  # Filter out zeros
    
    if len(word_counts) == 0:
        logger.warning("No valid word counts for document length distribution")
        return
    
    fig, ax = plt.subplots(figsize=(12, 6))
    
    # Histogram
    ax.hist(word_counts, bins=50, color='steelblue', edgecolor='black', alpha=0.7)
    ax.axvline(np.mean(word_counts), color='red', linestyle='--', linewidth=2,
               label=f'Mean: {np.mean(word_counts):.0f} words')
    ax.axvline(np.median(word_counts), color='green', linestyle='--', linewidth=2,
               label=f'Median: {np.median(word_counts):.0f} words')
    
    ax.set_xlabel('Word Count per Document', fontsize=12)
    ax.set_ylabel('Frequency', fontsize=12)
    ax.set_title('Document Length Distribution (After Cleaning)', fontsize=14, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    output_file.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    plt.close()
    
    logger.info(f"Saved document length distribution to {output_file}")


def plot_chunk_size_distribution(
    chunking_report: pd.DataFrame,
    all_chunks_file: Optional[Path],
    output_file: Path
) -> None:
    """
    Generate histogram of chunk sizes.
    
    Args:
        chunking_report: DataFrame with chunking statistics
        all_chunks_file: Optional path to all_chunks.jsonl for detailed analysis
        output_file: Path to save the plot
    """
    chunk_sizes = []
    
    # Try to load from all_chunks.jsonl for more detailed analysis
    if all_chunks_file and all_chunks_file.exists():
        try:
            with open(all_chunks_file, 'r', encoding='utf-8') as f:
                for line in f:
                    chunk = json.loads(line.strip())
                    if 'word_count' in chunk:
                        chunk_sizes.append(chunk['word_count'])
        except Exception as e:
            logger.warning(f"Could not load chunks from {all_chunks_file}: {e}")
    
    # Fallback to chunking report
    if not chunk_sizes and len(chunking_report) > 0:
        if 'avg_chunk_size' in chunking_report.columns:
            # Use average chunk sizes as approximation
            chunk_sizes = chunking_report['avg_chunk_size'].values.tolist()
    
    if not chunk_sizes:
        logger.warning("Cannot generate chunk size distribution: missing data")
        return
    
    chunk_sizes = np.array(chunk_sizes)
    chunk_sizes = chunk_sizes[chunk_sizes > 0]
    
    if len(chunk_sizes) == 0:
        logger.warning("No valid chunk sizes for distribution")
        return
    
    fig, ax = plt.subplots(figsize=(12, 6))
    
    # Histogram
    ax.hist(chunk_sizes, bins=50, color='coral', edgecolor='black', alpha=0.7)
    ax.axvline(np.mean(chunk_sizes), color='red', linestyle='--', linewidth=2,
               label=f'Mean: {np.mean(chunk_sizes):.1f} words')
    ax.axvline(np.median(chunk_sizes), color='green', linestyle='--', linewidth=2,
               label=f'Median: {np.median(chunk_sizes):.1f} words')
    
    ax.set_xlabel('Chunk Size (words)', fontsize=12)
    ax.set_ylabel('Frequency', fontsize=12)
    ax.set_title('Chunk Size Distribution', fontsize=14, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    output_file.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    plt.close()
    
    logger.info(f"Saved chunk size distribution to {output_file}")


def plot_chunks_per_document(
    chunking_report: pd.DataFrame,
    output_file: Path
) -> None:
    """
    Generate plot of chunks per document.
    
    Args:
        chunking_report: DataFrame with chunking statistics
        output_file: Path to save the plot
    """
    if len(chunking_report) == 0 or 'chunk_count' not in chunking_report.columns:
        logger.warning("Cannot generate chunks per document plot: missing data")
        return
    
    chunk_counts = chunking_report['chunk_count'].values
    chunk_counts = chunk_counts[chunk_counts > 0]
    
    if len(chunk_counts) == 0:
        logger.warning("No valid chunk counts for plot")
        return
    
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    
    # Histogram
    axes[0].hist(chunk_counts, bins=30, color='steelblue', edgecolor='black', alpha=0.7)
    axes[0].axvline(np.mean(chunk_counts), color='red', linestyle='--', linewidth=2,
                    label=f'Mean: {np.mean(chunk_counts):.1f}')
    axes[0].axvline(np.median(chunk_counts), color='green', linestyle='--', linewidth=2,
                    label=f'Median: {np.median(chunk_counts):.1f}')
    axes[0].set_xlabel('Number of Chunks per Document', fontsize=12)
    axes[0].set_ylabel('Frequency', fontsize=12)
    axes[0].set_title('Chunk Count Distribution per Document', fontsize=14, fontweight='bold')
    axes[0].legend()
    axes[0].grid(True, alpha=0.3)
    
    # Box plot
    bp = axes[1].boxplot([chunk_counts], vert=True, patch_artist=True, 
                         labels=['All Documents'], widths=0.6)
    bp['boxes'][0].set_facecolor('lightblue')
    axes[1].set_ylabel('Number of Chunks', fontsize=12)
    axes[1].set_title('Chunk Count Distribution (Box Plot)', fontsize=14, fontweight='bold')
    axes[1].grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    output_file.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    plt.close()
    
    logger.info(f"Saved chunks per document plot to {output_file}")


def plot_document_type_distribution(
    metadata_df: pd.DataFrame,
    output_file: Path
) -> None:
    """
    Generate bar chart of document types.
    
    Args:
        metadata_df: DataFrame with metadata
        output_file: Path to save the plot
    """
    if len(metadata_df) == 0 or 'document_type' not in metadata_df.columns:
        logger.warning("Cannot generate document type distribution: missing data")
        return
    
    doc_types = metadata_df['document_type'].value_counts()
    
    if len(doc_types) == 0:
        logger.warning("No document types found")
        return
    
    fig, axes = plt.subplots(1, 2, figsize=(16, 6))
    
    # Bar chart
    axes[0].bar(range(len(doc_types)), doc_types.values, color='steelblue', edgecolor='black')
    axes[0].set_xticks(range(len(doc_types)))
    axes[0].set_xticklabels(doc_types.index, rotation=45, ha='right')
    axes[0].set_ylabel('Count', fontsize=12)
    axes[0].set_title('Document Type Distribution (Bar Chart)', fontsize=14, fontweight='bold')
    axes[0].grid(True, alpha=0.3, axis='y')
    
    # Pie chart
    axes[1].pie(doc_types.values, labels=doc_types.index, autopct='%1.1f%%', startangle=90)
    axes[1].set_title('Document Type Distribution (Pie Chart)', fontsize=14, fontweight='bold')
    
    plt.tight_layout()
    output_file.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    plt.close()
    
    logger.info(f"Saved document type distribution to {output_file}")


def plot_year_distribution(
    metadata_df: pd.DataFrame,
    output_file: Path
) -> None:
    """
    Generate bar chart of documents by year.
    
    Args:
        metadata_df: DataFrame with metadata
        output_file: Path to save the plot
    """
    if len(metadata_df) == 0 or 'year' not in metadata_df.columns:
        logger.warning("Cannot generate year distribution: missing data")
        return
    
    # Filter valid years
    years = metadata_df['year'].dropna()
    years = years[years > 1900]  # Reasonable year range
    years = years[years < 2100]
    
    if len(years) == 0:
        logger.warning("No valid years found")
        return
    
    year_counts = years.value_counts().sort_index()
    
    fig, ax = plt.subplots(figsize=(14, 6))
    
    ax.bar(range(len(year_counts)), year_counts.values, color='steelblue', edgecolor='black')
    ax.set_xticks(range(len(year_counts)))
    ax.set_xticklabels(year_counts.index, rotation=45, ha='right')
    ax.set_xlabel('Year', fontsize=12)
    ax.set_ylabel('Number of Documents', fontsize=12)
    ax.set_title('Document Distribution by Year', fontsize=14, fontweight='bold')
    ax.grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    output_file.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    plt.close()
    
    logger.info(f"Saved year distribution to {output_file}")


def plot_embedding_space_visualization(
    embeddings_file: Path,
    chunk_map_file: Path,
    metadata_df: pd.DataFrame,
    output_file: Path,
    max_samples: int = 5000,
    method: str = 'pca'
) -> None:
    """
    Generate PCA or t-SNE visualization of embedding space.
    
    Args:
        embeddings_file: Path to chunk_embeddings.npy
        chunk_map_file: Path to chunk_map.json
        metadata_df: DataFrame with metadata
        output_file: Path to save the plot
        max_samples: Maximum number of embeddings to visualize
        method: 'pca' or 'tsne'
    """
    try:
        from sklearn.decomposition import PCA
        from sklearn.manifold import TSNE
    except ImportError:
        logger.error("scikit-learn not available for embedding visualization")
        return
    
    if not embeddings_file.exists():
        logger.warning(f"Embeddings file not found: {embeddings_file}")
        return
    
    # Load embeddings
    embeddings = np.load(embeddings_file)
    
    # Sample if too many
    if len(embeddings) > max_samples:
        logger.info(f"Sampling {max_samples} embeddings from {len(embeddings)} for visualization")
        indices = np.random.choice(len(embeddings), max_samples, replace=False)
        embeddings = embeddings[indices]
        sampled = True
    else:
        indices = np.arange(len(embeddings))
        sampled = False
    
    # Load chunk map to get doc_ids
    doc_ids = []
    if chunk_map_file.exists():
        with open(chunk_map_file, 'r', encoding='utf-8') as f:
            chunk_map = json.load(f)
        if sampled:
            doc_ids = [chunk_map[i]['doc_id'] for i in indices]
        else:
            doc_ids = [chunk['doc_id'] for chunk in chunk_map]
    else:
        doc_ids = [None] * len(embeddings)
    
    # Get document types and departments from metadata
    doc_types = []
    departments = []
    for doc_id in doc_ids:
        if doc_id and doc_id in metadata_df['doc_id'].values:
            row = metadata_df[metadata_df['doc_id'] == doc_id].iloc[0]
            doc_types.append(row.get('document_type', 'unknown'))
            departments.append(row.get('department', 'unknown'))
        else:
            doc_types.append('unknown')
            departments.append('unknown')
    
    # Reduce dimensionality
    if method == 'pca':
        reducer = PCA(n_components=2, random_state=42)
        embeddings_2d = reducer.fit_transform(embeddings)
        explained_var = reducer.explained_variance_ratio_.sum()
        logger.info(f"PCA: First 2 components explain {explained_var*100:.1f}% of variance")
    elif method == 'tsne':
        # Use PCA first for speed
        pca = PCA(n_components=50, random_state=42)
        embeddings_pca = pca.fit_transform(embeddings)
        reducer = TSNE(n_components=2, random_state=42, perplexity=30, max_iter=1000)
        embeddings_2d = reducer.fit_transform(embeddings_pca)
        logger.info("t-SNE visualization complete")
    else:
        logger.error(f"Unknown method: {method}")
        return
    
    # Create visualization
    fig, axes = plt.subplots(1, 2, figsize=(20, 8))
    
    # Color by document type
    unique_types = list(set(doc_types))
    colors = plt.cm.Set3(np.linspace(0, 1, len(unique_types)))
    type_color_map = {dtype: colors[i] for i, dtype in enumerate(unique_types)}
    
    for dtype in unique_types:
        mask = [dt == dtype for dt in doc_types]
        axes[0].scatter(embeddings_2d[mask, 0], embeddings_2d[mask, 1], 
                       c=[type_color_map[dtype]], label=dtype, alpha=0.6, s=10)
    
    axes[0].set_xlabel(f'{method.upper()} Component 1', fontsize=12)
    axes[0].set_ylabel(f'{method.upper()} Component 2', fontsize=12)
    axes[0].set_title(f'Embedding Space Visualization (colored by document_type)', 
                     fontsize=14, fontweight='bold')
    axes[0].legend(bbox_to_anchor=(1.05, 1), loc='upper left')
    axes[0].grid(True, alpha=0.3)
    
    # Color by department (if available)
    unique_depts = list(set(departments))
    if len(unique_depts) > 1 and 'unknown' not in unique_depts:
        colors_dept = plt.cm.tab20(np.linspace(0, 1, len(unique_depts)))
        dept_color_map = {dept: colors_dept[i] for i, dept in enumerate(unique_depts)}
        
        for dept in unique_depts:
            mask = [d == dept for d in departments]
            axes[1].scatter(embeddings_2d[mask, 0], embeddings_2d[mask, 1], 
                           c=[dept_color_map[dept]], label=dept, alpha=0.6, s=10)
        
        axes[1].set_xlabel(f'{method.upper()} Component 1', fontsize=12)
        axes[1].set_ylabel(f'{method.upper()} Component 2', fontsize=12)
        axes[1].set_title(f'Embedding Space Visualization (colored by department)', 
                         fontsize=14, fontweight='bold')
        axes[1].legend(bbox_to_anchor=(1.05, 1), loc='upper left', fontsize=8)
        axes[1].grid(True, alpha=0.3)
    else:
        # Fallback: density plot
        axes[1].hexbin(embeddings_2d[:, 0], embeddings_2d[:, 1], gridsize=30, cmap='Blues')
        axes[1].set_xlabel(f'{method.upper()} Component 1', fontsize=12)
        axes[1].set_ylabel(f'{method.upper()} Component 2', fontsize=12)
        axes[1].set_title(f'Embedding Space Density Plot', fontsize=14, fontweight='bold')
        axes[1].grid(True, alpha=0.3)
    
    plt.tight_layout()
    output_file.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    plt.close()
    
    logger.info(f"Saved embedding space visualization to {output_file}")


def generate_all_eda_plots(
    config: Dict,
    metadata_df: pd.DataFrame,
    cleaning_report: pd.DataFrame,
    chunking_report: pd.DataFrame,
    embeddings_file: Optional[Path] = None,
    chunk_map_file: Optional[Path] = None,
    all_chunks_file: Optional[Path] = None
) -> None:
    """
    Generate all EDA visualization plots.
    
    Args:
        config: Pipeline configuration
        metadata_df: Metadata DataFrame
        cleaning_report: Cleaning report DataFrame
        chunking_report: Chunking report DataFrame
        embeddings_file: Optional path to chunk_embeddings.npy
        chunk_map_file: Optional path to chunk_map.json
        all_chunks_file: Optional path to all_chunks.jsonl
    """
    reports_dir = Path(config['paths']['reports'])
    reports_dir.mkdir(parents=True, exist_ok=True)
    
    logger.info("Generating EDA visualizations...")
    
    # Document length distribution
    plot_document_length_distribution(
        cleaning_report,
        reports_dir / "document_length_distribution.png"
    )
    
    # Chunk size distribution
    plot_chunk_size_distribution(
        chunking_report,
        all_chunks_file,
        reports_dir / "chunk_size_distribution.png"
    )
    
    # Chunks per document
    plot_chunks_per_document(
        chunking_report,
        reports_dir / "chunks_per_document.png"
    )
    
    # Document type distribution
    plot_document_type_distribution(
        metadata_df,
        reports_dir / "document_type_distribution.png"
    )
    
    # Year distribution
    plot_year_distribution(
        metadata_df,
        reports_dir / "year_distribution.png"
    )
    
    # Embedding space visualization
    if embeddings_file and embeddings_file.exists():
        plot_embedding_space_visualization(
            embeddings_file,
            chunk_map_file,
            metadata_df,
            reports_dir / "embedding_projection.png",
            method='pca'  # Use PCA by default (faster)
        )
    
    logger.info("EDA visualizations completed")
