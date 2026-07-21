# Lyra Hackathon

### Create your branch

```
git switch -c <your-name>
```

### Push new commit

```
git add .
git commit -m "..."
git push -u origin <your-branch>
```

## Job scraper
### Install environment

```
conda create -n hack python=3.11 
conda activate hack
pip install -e .
pip install -r requirements.txt
playwright install chromium
```
### Create session
```
python create_session.py
```
### Run job scraper

```
python scrape_jobs.py
```

## Embedding extractor

`extractor.py` turns job postings and resumes into dense embeddings with
[`Qwen/Qwen3-Embedding-0.6B`](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)
served via vLLM, and stores each item as a pickle file for resume↔job matching.

> Requires a GPU environment with `vllm` installed (see `requirements.txt`). The
> first run downloads the ~1.2GB model from Hugging Face.

A single run embeds both the jobs and the resume, loading the model only once.
Jobs are scraped from LinkedIn (title + location via args), embedded as
*documents*, and written one pickle per job to `./job_embeddings/`. The resume
PDF is embedded as a *query* (with Qwen3's retrieval instruction, the
recommended asymmetric-search setup) to `./resume_embeddings/`.

```
python extractor.py --title "AI engineer" --location "Sydney" --pdf resumes/resume.pdf
```

To re-embed without launching the browser, pass already-scraped jobs (Job
schema, single object or list) as JSON instead of `--title`/`--location`:

```
python extractor.py --from-json jobs.json --pdf resumes/resume.pdf
```

Other flags: `--limit` (max jobs to scrape), `--session` (LinkedIn session
file), `--job-out-dir` / `--resume-out-dir` (output dirs), `--model` (override
the embedding model).

### Pickle format
Each `.pkl` holds one dict:

```python
{
  "id": str,
  "kind": "job" | "resume",
  "source": str,              # linkedin_url or pdf path
  "metadata": dict,           # job fields, or {"filename": ...}
  "text": str,                # raw text that was embedded
  "embedding": np.ndarray,    # float32
  "model": "Qwen/Qwen3-Embedding-0.6B",
  "dim": int,
}
```

