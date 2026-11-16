"""INTELLEX: evidence retrieval over internal documents (TF-IDF, cited passages)."""

from __future__ import annotations

import re
from functools import lru_cache

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def _title(text: str, fallback: str) -> str:
    m = re.search(r"^#\s+(.+)$", text, flags=re.M)
    return m.group(1).strip() if m else fallback


def _chunks(name: str, text: str) -> list[dict]:
    title = _title(text, name)
    parts = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip() and not p.strip().startswith("# ")]
    out = []
    for p in parts:
        lines = [ln for ln in p.splitlines() if not re.match(r"^\|[-| ]+\|$", ln)]
        # Markdown tables -> "header: value" lines (skip the header row itself)
        if lines and lines[0].startswith("|"):
            header = [c.strip() for c in lines[0].strip("|").split("|")]
            rows = [[c.strip() for c in ln.strip("|").split("|")] for ln in lines[1:]]
            lines = ["; ".join(f"{h}: {v}" if i else v for i, (h, v) in enumerate(zip(header, r))) for r in rows]
        text = "\n".join(lines).replace("**", "")
        out.append({"doc": name, "title": title, "text": text})
    return out


class DocIndex:
    def __init__(self, documents: dict[str, str]):
        self.chunks = [c for name, text in documents.items() for c in _chunks(name, text)]
        self.vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
        self.matrix = self.vec.fit_transform([f"{c['title']} {c['text']}" for c in self.chunks])

    def search(self, query: str, k: int = 3, min_score: float = 0.05) -> list[dict]:
        q = self.vec.transform([query])
        scores = cosine_similarity(q, self.matrix).ravel()
        order = np.argsort(-scores)[:k]
        return [
            {**self.chunks[i], "score": round(float(scores[i]), 3)}
            for i in order
            if scores[i] >= min_score
        ]


@lru_cache(maxsize=1)
def _index_for(key: tuple) -> DocIndex:
    return DocIndex(dict(key))


def index(documents: dict[str, str]) -> DocIndex:
    return _index_for(tuple(sorted(documents.items())))
