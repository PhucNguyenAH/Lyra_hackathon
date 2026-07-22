#!/usr/bin/env python3
"""
Extract job postings and resumes into embeddings using Qwen3-Embedding-0.6B
(served via vLLM) and store each item as a pickle file.

Jobs are scraped from LinkedIn (or loaded from JSON) and embedded to
./job_embeddings; a resume PDF is embedded to ./resume_embeddings. Both run in
a single invocation, loading the model once.

Usage:
    # Scrape jobs + embed a resume in one run
    python extractor.py --title "AI engineer" --location "Sydney" \
        --pdf resumes/resume.pdf

    # Use already-scraped jobs instead of the browser
    python extractor.py --from-json jobs.json --pdf resumes/resume.pdf
"""
import argparse
import asyncio
import json
import logging
import os
import pickle
import re
from pathlib import Path
from typing import List, Optional

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("extractor")

DEFAULT_MODEL = "Qwen/Qwen3-Embedding-0.6B"
JOB_EMBED_DIR = Path("job_embeddings")
RESUME_EMBED_DIR = Path("resume_embeddings")

# Qwen3-Embedding recommends an instruction on the *query* side of asymmetric
# retrieval. Resumes are the query; jobs are the documents (embedded plain).
RESUME_TASK = (
    "Given a candidate's resume, retrieve job postings that best match the "
    "candidate's skills and experience"
)


# --------------------------------------------------------------------------- #
# Embedding core (one lazily-loaded vLLM model, reused across a run)
# --------------------------------------------------------------------------- #
class Embedder:
    """Wraps a vLLM embedding model. Loads the model on first use."""

    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        gpu_memory_utilization: float = 0.5,
        max_model_len: int = 8192,
        enforce_eager: bool = True,
    ):
        self.model_name = model
        # A 0.6B embedding model needs only a fraction of the GPU; the vLLM
        # default (0.92) can exceed a small/shared card's free memory. Cap it,
        # trim the KV-cache context, and skip CUDA-graph capture (eager) so a
        # one-shot batch loads on a modest GPU.
        self.gpu_memory_utilization = gpu_memory_utilization
        self.max_model_len = max_model_len
        self.enforce_eager = enforce_eager
        self._llm = None

    def _ensure_loaded(self):
        if self._llm is None:
            from vllm import LLM  # imported lazily so the CLI loads fast

            logger.info(
                f"Loading embedding model: {self.model_name} "
                f"(gpu_mem={self.gpu_memory_utilization}, "
                f"max_len={self.max_model_len}) ..."
            )
            common = dict(
                model=self.model_name,
                gpu_memory_utilization=self.gpu_memory_utilization,
                max_model_len=self.max_model_len,
                enforce_eager=self.enforce_eager,
            )
            try:
                # vLLM >= 0.10: task="embed" was split into runner/convert.
                self._llm = LLM(runner="pooling", convert="embed", **common)
            except TypeError:
                # Older vLLM still uses the single task= argument.
                self._llm = LLM(task="embed", **common)

    @staticmethod
    def _with_instruction(task: str, query: str) -> str:
        return f"Instruct: {task}\nQuery: {query}"

    def embed(self, texts: List[str]):
        """Embed a list of documents (no instruction). Returns np.float32 arrays."""
        import numpy as np

        self._ensure_loaded()
        outputs = self._llm.embed(texts)
        return [np.asarray(o.outputs.embedding, dtype=np.float32) for o in outputs]

    def embed_query(self, texts: List[str], task: str):
        """Embed queries with the Qwen3 retrieval instruction prepended."""
        return self.embed([self._with_instruction(task, t) for t in texts])

    def shutdown(self):
        """Release the vLLM engine so its background workers stop."""
        if self._llm is not None:
            del self._llm
            self._llm = None
            import gc

            gc.collect()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _slugify(value: str, fallback: str = "item") -> str:
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", value).strip("-").lower()
    return slug or fallback


def _job_id(job: dict) -> str:
    """Derive a stable file id from a job's LinkedIn URL, else its title."""
    url = job.get("linkedin_url") or ""
    m = re.search(r"/jobs/view/(\d+)", url)
    if m:
        return m.group(1)
    return _slugify(job.get("job_title") or "job")


def _job_embed_text(job: dict) -> str:
    """Concatenate the meaningful job fields into one document string."""
    parts = [
        job.get("job_title"),
        f"Company: {job['company']}" if job.get("company") else None,
        f"Location: {job['location']}" if job.get("location") else None,
        job.get("job_description"),
        f"Benefits: {job['benefits']}" if job.get("benefits") else None,
    ]
    return "\n".join(p for p in parts if p)


def _save_pickle(payload: dict, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("wb") as f:
        pickle.dump(payload, f)
    logger.info(f"  ✓ saved {out_path}  (dim={payload['dim']})")


def _extract_pdf_text(pdf_path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(pages).strip()
    if not text:
        raise ValueError(
            f"No extractable text in {pdf_path}. "
            "Is it a scanned/image-only PDF?"
        )
    return text


# --------------------------------------------------------------------------- #
# Job scraping (mirrors scrape_jobs.py)
# --------------------------------------------------------------------------- #
async def _scrape_jobs(
    title: str,
    location: Optional[str],
    limit: int,
    session_file: str = "linkedin_session.json",
) -> List[dict]:
    from linkedin_scraper.core.browser import BrowserManager
    from linkedin_scraper.scrapers.job import JobScraper
    from linkedin_scraper.scrapers.job_search import JobSearchScraper

    jobs: List[dict] = []
    async with BrowserManager(headless=True) as browser:
        await browser.load_session(session_file)
        logger.info("✓ Session loaded")

        search_scraper = JobSearchScraper(browser.page)
        logger.info(f"🔍 Searching jobs: '{title}' in '{location}' ...")
        job_urls = await search_scraper.search(
            keywords=title, location=location, limit=limit
        )
        logger.info(f"✓ Found {len(job_urls)} job URLs")

        job_scraper = JobScraper(browser.page)
        for url in job_urls:
            try:
                job = await job_scraper.scrape(url)
                jobs.append(job.to_dict())
                logger.info(f"  📄 {job.job_title} @ {job.company}")
            except Exception as e:  # noqa: BLE001 - keep going on a bad listing
                logger.warning(f"  ! skipped {url}: {e}")
    return jobs


def _load_jobs_json(path: Path) -> List[dict]:
    data = json.loads(path.read_text())
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        raise ValueError("--from-json must contain a job object or a list of them")
    return data


# --------------------------------------------------------------------------- #
# Gather phase: all scraping / file IO happens here, BEFORE the model loads.
# Keeping async (Playwright/asyncio) work away from a live vLLM engine avoids
# the hang seen when the two run interleaved.
# --------------------------------------------------------------------------- #
def gather_jobs(args) -> List[dict]:
    """Scrape or load the job postings to embed."""
    if args.from_json:
        jobs = _load_jobs_json(Path(args.from_json))
        logger.info(f"Loaded {len(jobs)} jobs from {args.from_json}")
    else:
        if not args.title:
            raise SystemExit("--title is required unless --from-json is given")
        jobs = asyncio.run(
            _scrape_jobs(args.title, args.location, args.limit, args.session)
        )
    return jobs


def gather_resume_text(args) -> str:
    """Read and extract the resume PDF text."""
    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        raise SystemExit(f"Resume PDF not found: {pdf_path}")
    logger.info(f"Extracting text from {pdf_path} ...")
    return _extract_pdf_text(pdf_path)


# --------------------------------------------------------------------------- #
# Embed phase: model is live; no async/IO happens here beyond writing pickles.
# --------------------------------------------------------------------------- #
def embed_jobs(jobs: List[dict], args, embedder: Embedder) -> int:
    """Embed already-gathered jobs and pickle each. Returns job count."""
    if not jobs:
        logger.info("No jobs to embed.")
        return 0

    out_dir = Path(args.job_out_dir)
    texts = [_job_embed_text(j) for j in jobs]
    logger.info(f"Embedding {len(texts)} jobs ...")
    vectors = embedder.embed(texts)

    for job, text, vec in zip(jobs, texts, vectors):
        payload = {
            "id": _job_id(job),
            "kind": "job",
            "source": job.get("linkedin_url"),
            "metadata": job,
            "text": text,
            "embedding": vec,
            "model": embedder.model_name,
            "dim": int(vec.shape[0]),
        }
        _save_pickle(payload, out_dir / f"{payload['id']}.pkl")

    logger.info(f"✓ {len(jobs)} job embeddings in {out_dir}/")
    return len(jobs)


def embed_resume(text: str, args, embedder: Embedder) -> int:
    """Embed already-extracted resume text (query side) and pickle it."""
    logger.info("Embedding resume (query side, with retrieval instruction) ...")
    vec = embedder.embed_query([text], RESUME_TASK)[0]

    pdf_path = Path(args.pdf)
    out_dir = Path(args.resume_out_dir)
    payload = {
        "id": _slugify(pdf_path.stem, "resume"),
        "kind": "resume",
        "source": str(pdf_path),
        "metadata": {"filename": pdf_path.name},
        "text": text,
        "embedding": vec,
        "model": embedder.model_name,
        "dim": int(vec.shape[0]),
    }
    _save_pickle(payload, out_dir / f"{payload['id']}.pkl")
    logger.info(f"✓ resume embedding in {out_dir}/")
    return 1


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model", default=DEFAULT_MODEL, help="HF model id for vLLM embedding"
    )
    parser.add_argument(
        "--gpu-mem",
        dest="gpu_mem",
        type=float,
        default=0.5,
        help="Fraction of GPU memory vLLM may use (0-1). Lower it if the GPU "
        "is small or shared. Default 0.5.",
    )
    parser.add_argument(
        "--max-model-len",
        dest="max_model_len",
        type=int,
        default=8192,
        help="Max token context for the embedder (caps KV-cache memory).",
    )
    # Jobs
    parser.add_argument("--title", help="Job title / keywords to search")
    parser.add_argument("--location", default="Sydney", help="Job location")
    parser.add_argument("--limit", type=int, default=5, help="Max jobs to scrape")
    parser.add_argument(
        "--from-json", help="Embed jobs from a JSON file instead of scraping"
    )
    parser.add_argument(
        "--session", default="linkedin_session.json", help="LinkedIn session file"
    )
    parser.add_argument(
        "--job-out-dir",
        dest="job_out_dir",
        default=str(JOB_EMBED_DIR),
        help="Job pickle output dir",
    )
    # Resume
    parser.add_argument("--pdf", required=True, help="Path to the resume PDF")
    parser.add_argument(
        "--resume-out-dir",
        dest="resume_out_dir",
        default=str(RESUME_EMBED_DIR),
        help="Resume pickle output dir",
    )
    return parser


def main():
    args = build_parser().parse_args()

    # 1) Gather everything that needs async / file IO first, so no such work
    #    happens while the vLLM engine is live (that interleaving causes hangs).
    jobs = gather_jobs(args)
    resume_text = gather_resume_text(args)

    # 2) Load the model once and embed both back-to-back.
    embedder = Embedder(
        args.model,
        gpu_memory_utilization=args.gpu_mem,
        max_model_len=args.max_model_len,
    )
    embed_jobs(jobs, args, embedder)
    embed_resume(resume_text, args, embedder)
    embedder.shutdown()
    logger.info("✓ Done: jobs + resume")
    # vLLM leaves background worker processes/threads running that keep the
    # interpreter alive. We're done, so flush output and exit immediately.
    import sys

    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)


if __name__ == "__main__":
    main()
