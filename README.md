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

Create and activate the conda env **before** installing or running anything.
If you skip activation, `python`/`python3` may point at pyenv/system Python
and packages won't be found.

If `conda: command not found`, initialize conda for your shell first:

```
source /opt/anaconda3/etc/profile.d/conda.sh
conda activate hack
```

Then install (first time only):

```
conda create -n hack python=3.11   # skip if env already exists
conda activate hack
pip install -e .
pip install -r requirements.txt
python -m playwright install chromium
```

Verify you're in the right env:

```
which python    # should show .../envs/hack/bin/python
python -c "import playwright; print('ok')"
```

**Shortcut without conda activate** (works even if conda isn't in PATH):

```
/opt/anaconda3/envs/hack/bin/python create_session.py
```

### Create session

With the `hack` env active (or use the full python path above):

```
python create_session.py
```
### Run job scraper
Copy `.env.example` to `.env` and add you LinkeIn account

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

## Job matcher

`matcher.py` ranks the embedded jobs against the embedded resume by cosine
similarity. It only needs numpy (no GPU/vLLM/browser), so run it any time
after `extractor.py`:

```
python matcher.py
```

It prints the ranking and writes it to `matches.json`. Flags: `--job-dir` /
`--resume-dir` (embedding dirs), `--out` (output JSON), `--top` (keep only the
top N matches).

> Note: raw cosine scores from the same search tend to cluster in a narrow
> band — treat them as a ranking, not a "match %".

