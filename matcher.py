#!/usr/bin/env python3
"""
Rank scraped jobs against a resume using the pickled embeddings produced by
extractor.py. Pure numpy — no GPU, no vLLM, no browser.

Usage:
    python extractor.py --title "AI engineer" --location "Sydney" \
        --pdf resumes/resume.pdf
    python matcher.py --top 5

    # Custom dirs / output
    python matcher.py --job-dir job_embeddings --resume-dir resume_embeddings \
        --out matches.json
"""
import argparse
import json
import pickle
from pathlib import Path
from typing import List

import numpy as np


def load_pickles(directory: Path) -> List[dict]:
    """Load every embedding pickle in a directory (see extractor.py schema)."""
    return [pickle.loads(p.read_bytes()) for p in sorted(directory.glob("*.pkl"))]


def rank(resume: dict, jobs: List[dict]) -> List[dict]:
    """Score each job against the resume by cosine similarity, best first."""
    job_matrix = np.stack([j["embedding"] for j in jobs]).astype(np.float32)
    resume_vec = np.asarray(resume["embedding"], dtype=np.float32)

    # Normalize both sides; cheap even if the vectors are already unit-norm.
    job_matrix /= np.linalg.norm(job_matrix, axis=1, keepdims=True)
    resume_vec = resume_vec / np.linalg.norm(resume_vec)
    scores = job_matrix @ resume_vec

    order = np.argsort(scores)[::-1]
    return [
        {
            "rank": i + 1,
            "score": float(scores[idx]),
            "job_id": jobs[idx].get("id"),
            "job_title": jobs[idx]["metadata"].get("job_title"),
            "company": jobs[idx]["metadata"].get("company"),
            "location": jobs[idx]["metadata"].get("location"),
            "url": jobs[idx].get("source"),
        }
        for i, idx in enumerate(order)
    ]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--job-dir", default="job_embeddings", help="Directory of job pickles"
    )
    parser.add_argument(
        "--resume-dir",
        default="resume_embeddings",
        help="Directory of resume pickles (first one is used)",
    )
    parser.add_argument(
        "--out", default="matches.json", help="Where to write the ranked results"
    )
    parser.add_argument(
        "--top", type=int, default=None, help="Only keep the top N matches"
    )
    return parser


def main():
    args = build_parser().parse_args()

    jobs = load_pickles(Path(args.job_dir))
    resumes = load_pickles(Path(args.resume_dir))
    if not jobs:
        raise SystemExit(f"No job embeddings in {args.job_dir}/ — run extractor.py first.")
    if not resumes:
        raise SystemExit(
            f"No resume embeddings in {args.resume_dir}/ — run extractor.py first."
        )

    resume = resumes[0]
    if len(resumes) > 1:
        print(f"Note: {len(resumes)} resumes found, using '{resume['id']}'")

    results = rank(resume, jobs)
    if args.top:
        results = results[: args.top]

    print(f"\nResume: {resume['id']}  vs  {len(jobs)} jobs\n")
    for r in results:
        print(f"{r['rank']:>2}. [{r['score']:.3f}] {r['job_title']} @ {r['company']}")
        print(f"       {r['url']}")

    Path(args.out).write_text(json.dumps(results, indent=2))
    print(f"\n✓ saved {args.out}")


if __name__ == "__main__":
    main()
