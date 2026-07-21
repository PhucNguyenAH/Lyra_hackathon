# Embedding Extractor Design

Date: 2026-07-20

## Purpose

`extractor.py` turns job postings and resumes into dense embeddings using
`Qwen/Qwen3-Embedding-0.6B` served via vLLM (offline `LLM(task="embed")`), and
stores each item as a pickle file for later resume↔job matching.

## CLI

```
python extractor.py jobs   --title "AI engineer" --location "Sydney" [--limit 5]
python extractor.py jobs   --from-json path/to/jobs.json          # skip browser
python extractor.py resume --pdf resumes/resume.pdf
```

Subcommands via `argparse`. Shared `--model` and `--out-dir` flags with sensible
defaults.

## Embedding core

- One lazily-loaded vLLM model, reused across items in a run.
- `LLM(model="Qwen/Qwen3-Embedding-0.6B", task="embed")`, `model.embed(texts)`.
- Qwen3-Embedding uses last-token pooling (applied automatically by vLLM).
- **Jobs = documents**: embedded plain (no instruction).
- **Resume = query**: embedded with Qwen3 retrieval instruction
  `Instruct: <task>\nQuery: <text>` (recommended asymmetric-search setup).

## `jobs` flow (mirrors scrape_jobs.py)

1. `BrowserManager(headless=True)` → `load_session("linkedin_session.json")`.
2. `JobSearchScraper.search(keywords=title, location=location, limit=limit)`.
3. `JobScraper.scrape(url)` → `Job` per URL.
4. Build embed text = title + company + location + description + benefits.
5. Embed (documents) → pickle each to `./job_embeddings/<jobid>.pkl`.

`--from-json` bypasses steps 1–3, loading a list of job dicts (Job schema) from
disk instead — for testing / re-embedding without LinkedIn.

## `resume` flow

1. Extract text from the PDF with `pypdf`.
2. Embed with the retrieval instruction (query side).
3. Pickle to `./resume_embeddings/<pdf_stem>.pkl`.

## Pickle payload (one dict per file, consistent both sides)

```python
{
  "id": str,
  "kind": "job" | "resume",
  "source": str,              # linkedin_url or pdf path
  "metadata": {...},          # job fields, or {"filename": ...}
  "text": str,                # raw text that was embedded
  "embedding": np.ndarray,    # float32
  "model": "Qwen/Qwen3-Embedding-0.6B",
  "dim": int,
}
```

## Dependencies

- `vllm` (already in requirements.txt)
- `pypdf` (added)

## Out of scope

Matching / ranking between resume and job embeddings — this file only produces
the embeddings.
