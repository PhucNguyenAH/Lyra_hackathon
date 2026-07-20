#!/usr/bin/env python3
"""
Rank scraped jobs against a resume using the pickled embeddings produced by
extractor.py. Pure numpy — no GPU, no vLLM, no browser.

Usage:
    python extractor.py --title "AI engineer" --location "Sydney" \
        --pdf resumes/resume.pdf
    python matcher.py --top 5

    # Filter/re-rank with structured expectations (see expectations.py)
    python matcher.py --expectations expectations.json

    # Custom dirs / output
    python matcher.py --job-dir job_embeddings --resume-dir resume_embeddings \
        --out matches.json
"""
import argparse
import json
import pickle
import re
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

# Soft-scoring weights: cosine similarity stays the dominant term.
W_SKILLS = 0.15      # full weight when every must-have skill is mentioned
W_LOCATION = 0.05    # any acceptable location mentioned
W_WORK_MODE = 0.05   # desired work mode mentioned


def load_pickles(directory: Path) -> List[dict]:
    """Load every embedding pickle in a directory (see extractor.py schema)."""
    return [pickle.loads(p.read_bytes()) for p in sorted(directory.glob("*.pkl"))]


# --------------------------------------------------------------------------- #
# Expectations evaluation (keyword-level, against the job's embedded text)
# --------------------------------------------------------------------------- #
def _find_salaries(text: str) -> List[int]:
    """Pull annual salary figures like '$120,000', '$120k' or '120k' from text."""
    vals = []
    for m in re.finditer(r"\$\s*(\d{1,3}(?:,\d{3})+|\d{5,6})", text):
        vals.append(int(m.group(1).replace(",", "")))
    for m in re.finditer(r"\b(\d{2,3})\s*k\b", text, re.IGNORECASE):
        vals.append(int(m.group(1)) * 1000)
    return [v for v in vals if v >= 20_000]  # ignore small non-salary figures


def evaluate_job(haystack: str, exp: dict) -> dict:
    """Check one job's text against the expectations.

    Returns {"excluded_by": str | None, "boost": float,
             "matched_must_haves": [...], "missing_must_haves": [...],
             "matched": [...], "flags": [...]}.

    "matched" holds positive signals (criteria the posting satisfies) and
    "flags" the warnings, so the output reports both sides symmetrically.
    """
    hay = haystack.lower()
    result = {
        "excluded_by": None,
        "boost": 0.0,
        "matched_must_haves": [],
        "missing_must_haves": [],
        "matched": [],
        "flags": [],
    }

    for phrase in exp.get("deal_breakers") or []:
        if phrase.lower() in hay:
            result["excluded_by"] = phrase
            return result

    must = exp.get("must_have_skills") or []
    if must:
        result["matched_must_haves"] = [s for s in must if s.lower() in hay]
        result["missing_must_haves"] = [s for s in must if s.lower() not in hay]
        result["boost"] += W_SKILLS * len(result["matched_must_haves"]) / len(must)
        if result["matched_must_haves"]:
            result["matched"].append(
                "skills: " + ", ".join(result["matched_must_haves"])
            )
        if result["missing_must_haves"]:
            result["flags"].append(
                "missing skills: " + ", ".join(result["missing_must_haves"])
            )

    locations = exp.get("locations") or []
    if locations:
        hits = [loc for loc in locations if loc.lower() in hay]
        if hits:
            result["boost"] += W_LOCATION
            result["matched"].append("location: " + ", ".join(hits))
        else:
            result["flags"].append(
                "location not mentioned: " + ", ".join(locations)
            )

    work_mode = exp.get("work_mode") or "any"
    if work_mode != "any":
        # Soft signal only — postings often omit the mode, so warn, don't drop.
        if work_mode in hay:
            result["boost"] += W_WORK_MODE
            result["matched"].append(f"work mode: {work_mode}")
        else:
            result["flags"].append(f"work mode '{work_mode}' not mentioned")

    seniority = exp.get("seniority") or []
    if seniority:
        hits = [s for s in seniority if s.lower() in hay]
        if hits:
            result["matched"].append("seniority: " + ", ".join(hits))
        else:
            result["flags"].append(
                "seniority not mentioned: " + ", ".join(seniority)
            )

    salary_min = exp.get("salary_min")
    if salary_min:
        found = _find_salaries(haystack)
        if not found:
            result["flags"].append("salary: unknown")
        elif max(found) < salary_min:
            result["flags"].append(
                f"salary below minimum (posting mentions {max(found):,}, "
                f"want {salary_min:,})"
            )
        else:
            lo, hi = min(found), max(found)
            mentioned = f"{lo:,}–{hi:,}" if lo != hi else f"{lo:,}"
            result["matched"].append(
                f"salary: posting mentions {mentioned} (meets {salary_min:,} min)"
            )

    return result


# --------------------------------------------------------------------------- #
# Ranking
# --------------------------------------------------------------------------- #
def rank(
    resume: dict, jobs: List[dict], expectations: Optional[dict] = None
) -> Tuple[List[dict], List[dict]]:
    """Score each job against the resume by cosine similarity, best first.

    With expectations, deal-breaker hits go to the second (excluded) list and
    the rest are re-ranked by cosine + keyword boosts.
    """
    job_matrix = np.stack([j["embedding"] for j in jobs]).astype(np.float32)
    resume_vec = np.asarray(resume["embedding"], dtype=np.float32)

    # Normalize both sides; cheap even if the vectors are already unit-norm.
    job_matrix /= np.linalg.norm(job_matrix, axis=1, keepdims=True)
    resume_vec = resume_vec / np.linalg.norm(resume_vec)
    scores = job_matrix @ resume_vec

    matches, excluded = [], []
    for idx in np.argsort(scores)[::-1]:
        job = jobs[idx]
        entry = {
            "score": float(scores[idx]),
            "job_id": job.get("id"),
            "job_title": job["metadata"].get("job_title"),
            "company": job["metadata"].get("company"),
            "location": job["metadata"].get("location"),
            "url": job.get("source"),
        }
        if expectations:
            verdict = evaluate_job(job.get("text") or "", expectations)
            if verdict["excluded_by"]:
                entry["excluded_by"] = verdict["excluded_by"]
                excluded.append(entry)
                continue
            entry["adjusted_score"] = entry["score"] + verdict["boost"]
            entry["matched_must_haves"] = verdict["matched_must_haves"]
            entry["missing_must_haves"] = verdict["missing_must_haves"]
            entry["matched"] = verdict["matched"]
            entry["flags"] = verdict["flags"]
        matches.append(entry)

    if expectations:
        matches.sort(key=lambda e: e["adjusted_score"], reverse=True)
    for i, entry in enumerate(matches):
        entry["rank"] = i + 1

    return matches, excluded


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
    parser.add_argument(
        "--expectations",
        default=None,
        help="Expectations JSON from expectations.py; enables deal-breaker "
        "filtering and keyword-boosted re-ranking",
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

    expectations = None
    if args.expectations:
        exp_path = Path(args.expectations)
        if not exp_path.exists():
            raise SystemExit(
                f"Expectations file not found: {exp_path} — run expectations.py first."
            )
        expectations = json.loads(exp_path.read_text())

    resume = resumes[0]
    if len(resumes) > 1:
        print(f"Note: {len(resumes)} resumes found, using '{resume['id']}'")

    matches, excluded = rank(resume, jobs, expectations)
    if args.top:
        matches = matches[: args.top]

    print(f"\nResume: {resume['id']}  vs  {len(jobs)} jobs\n")
    for r in matches:
        shown = r.get("adjusted_score", r["score"])
        print(f"{r['rank']:>2}. [{shown:.3f}] {r['job_title']} @ {r['company']}")
        print(f"       {r['url']}")
        if expectations:
            for hit in r["matched"]:
                print(f"       + {hit}")
            for flag in r["flags"]:
                print(f"       ! {flag}")

    if excluded:
        print(f"\nExcluded by deal-breakers ({len(excluded)}):")
        for r in excluded:
            print(
                f"  - {r['job_title']} @ {r['company']}  "
                f"(matched: '{r['excluded_by']}')"
            )

    payload = {"matches": matches, "excluded": excluded} if expectations else matches
    Path(args.out).write_text(json.dumps(payload, indent=2))
    print(f"\n✓ saved {args.out}")


if __name__ == "__main__":
    main()
