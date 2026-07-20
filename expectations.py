#!/usr/bin/env python3
"""
Turn free-text job-search expectations into a validated expectations JSON
using an LLM with structured output. The resulting file feeds matcher.py
(--expectations) for filtering/re-ranking.

Backends (--backend, default "auto"):
  openai  OpenAI API. Needs OPENAI_API_KEY in the environment or .env.
  gemini  Google Gemini API. Needs GEMINI_API_KEY (or GOOGLE_API_KEY) in the
          environment or .env. Has a free tier — see https://aistudio.google.com/apikey
  vllm    Local instruct model via vLLM, same GPU environment as extractor.py.
  auto    openai if OPENAI_API_KEY is set, else gemini if a Gemini key is
          set, else vllm.
All cloud/local backends run through the same Expectations schema.

Usage:
    python expectations.py --text "Senior AI roles, remote only, min 160k AUD, \
        must have Python and LLM experience, no crypto companies"
    python expectations.py --file expectations.txt --out expectations.json
    python expectations.py --backend gemini --text "..."
    python expectations.py --backend vllm --text "..."
"""
import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("expectations")

DEFAULT_VLLM_MODEL = "Qwen/Qwen3-4B-Instruct-2507"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"
DEFAULT_OUT = "expectations.json"


# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #
class Expectations(BaseModel):
    """Structured job-search expectations extracted from free text."""

    salary_min: Optional[int] = Field(
        None, description="Minimum annual salary as a plain integer (120k -> 120000)"
    )
    salary_currency: Optional[str] = Field(
        None, description="ISO-ish currency code if stated, e.g. AUD, USD"
    )
    work_mode: Literal["remote", "hybrid", "onsite", "any"] = Field(
        "any", description="Preferred work mode; 'any' when not stated"
    )
    seniority: List[str] = Field(
        default_factory=list,
        description="Acceptable levels, normalized to: junior, mid, senior, staff, lead",
    )
    must_have_skills: List[str] = Field(
        default_factory=list, description="Skills the job must involve"
    )
    nice_to_have_skills: List[str] = Field(
        default_factory=list, description="Skills that are a bonus but not required"
    )
    deal_breakers: List[str] = Field(
        default_factory=list,
        description="Short lowercase keywords/phrases that disqualify a job "
        "if they appear in the posting, e.g. 'crypto', 'on-site 5 days'",
    )
    locations: List[str] = Field(
        default_factory=list, description="Acceptable cities/regions"
    )
    notes: Optional[str] = Field(
        None, description="Anything stated that does not fit the fields above"
    )


SYSTEM_PROMPT = """\
You extract structured job-search expectations from a candidate's free-text \
description. Follow these rules strictly:
- Do NOT invent values. If something is not stated, use null (or an empty list).
- salary_min is an annual figure as a plain integer: "120k" -> 120000.
- work_mode is one of remote/hybrid/onsite/any; use "any" when not stated.
- Normalize seniority terms to: junior, mid, senior, staff, lead.
- deal_breakers must be short lowercase keywords or phrases likely to appear \
verbatim in a job posting (e.g. "crypto", "hybrid", "on-site").
- Skills should be short canonical names (e.g. "Python", "LLM", "Kubernetes").
- Put anything that does not fit the schema into notes.
Respond with JSON only."""


# --------------------------------------------------------------------------- #
# Cloud: OpenAI extraction
# --------------------------------------------------------------------------- #
def extract_openai(text: str, model: str = DEFAULT_OPENAI_MODEL) -> Expectations:
    """Extract via the OpenAI API with schema-enforced structured output.

    Reads OPENAI_API_KEY (and optional OPENAI_BASE_URL) from the environment
    or the repo's .env file.
    """
    from dotenv import load_dotenv
    from openai import OpenAI

    load_dotenv()
    client = OpenAI()
    logger.info(f"Extracting expectations via OpenAI ({model}) ...")
    completion = client.chat.completions.parse(
        model=model,
        temperature=0,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        response_format=Expectations,
    )
    parsed = completion.choices[0].message.parsed
    if parsed is None:  # e.g. refusal / content filter
        raise SystemExit("OpenAI returned no parsed output; try rephrasing.")
    return parsed


# --------------------------------------------------------------------------- #
# Cloud: Gemini extraction
# --------------------------------------------------------------------------- #
def extract_gemini(text: str, model: str = DEFAULT_GEMINI_MODEL) -> Expectations:
    """Extract via the Gemini API with schema-enforced structured output.

    Reads GEMINI_API_KEY or GOOGLE_API_KEY from the environment or .env.
    Gemini has a free tier: https://aistudio.google.com/apikey
    """
    from dotenv import load_dotenv
    from google import genai
    from google.genai import types

    load_dotenv()
    client = genai.Client()
    logger.info(f"Extracting expectations via Gemini ({model}) ...")
    response = client.models.generate_content(
        model=model,
        contents=text,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=Expectations,
        ),
    )
    if not response.text:
        raise SystemExit("Gemini returned no output; try rephrasing.")
    return Expectations.model_validate_json(response.text)


# --------------------------------------------------------------------------- #
# vLLM structured-output extraction
# --------------------------------------------------------------------------- #
def _structured_sampling_params(schema_json: str):
    """Build SamplingParams that constrain output to the JSON schema.

    Supports both the new (structured_outputs) and old (guided_decoding)
    vLLM APIs, mirroring the version handling in extractor.py.
    """
    from vllm import SamplingParams

    common = dict(temperature=0.0, max_tokens=1024)
    try:
        from vllm.sampling_params import StructuredOutputsParams

        return SamplingParams(
            structured_outputs=StructuredOutputsParams(json=schema_json), **common
        )
    except (ImportError, TypeError):
        from vllm.sampling_params import GuidedDecodingParams

        return SamplingParams(
            guided_decoding=GuidedDecodingParams(json=schema_json), **common
        )


def extract_vllm(
    text: str,
    model: str = DEFAULT_VLLM_MODEL,
    gpu_memory_utilization: float = 0.5,
    max_model_len: int = 8192,
) -> Expectations:
    """Run the instruct model with schema-constrained decoding and validate."""
    from vllm import LLM

    logger.info(
        f"Loading instruct model: {model} "
        f"(gpu_mem={gpu_memory_utilization}, max_len={max_model_len}) ..."
    )
    llm = LLM(
        model=model,
        gpu_memory_utilization=gpu_memory_utilization,
        max_model_len=max_model_len,
        enforce_eager=True,
    )

    schema_json = json.dumps(Expectations.model_json_schema())
    sampling = _structured_sampling_params(schema_json)
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": text},
    ]

    logger.info("Extracting expectations ...")
    outputs = llm.chat(messages, sampling)
    raw = outputs[0].outputs[0].text
    return Expectations.model_validate_json(raw)


# --------------------------------------------------------------------------- #
# Output
# --------------------------------------------------------------------------- #
def print_card(exp: Expectations):
    """Print the extracted fields so the user can eyeball and correct them."""
    salary = "—"
    if exp.salary_min is not None:
        salary = f"{exp.salary_min:,}" + (f" {exp.salary_currency}" if exp.salary_currency else "")

    def fmt(items: List[str]) -> str:
        return ", ".join(items) if items else "—"

    print("\nExtracted expectations:")
    print(f"  salary_min          : {salary}")
    print(f"  work_mode           : {exp.work_mode}")
    print(f"  seniority           : {fmt(exp.seniority)}")
    print(f"  must_have_skills    : {fmt(exp.must_have_skills)}")
    print(f"  nice_to_have_skills : {fmt(exp.nice_to_have_skills)}")
    print(f"  deal_breakers       : {fmt(exp.deal_breakers)}")
    print(f"  locations           : {fmt(exp.locations)}")
    print(f"  notes               : {exp.notes or '—'}")


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--text", help="Free-text expectations, inline")
    source.add_argument("--file", help="Path to a text file with the expectations")
    parser.add_argument(
        "--out", default=DEFAULT_OUT, help="Where to write the expectations JSON"
    )
    parser.add_argument(
        "--backend",
        choices=["auto", "openai", "gemini", "vllm"],
        default="auto",
        help="'openai' = OpenAI API (needs OPENAI_API_KEY), 'gemini' = Google "
        "Gemini API (needs GEMINI_API_KEY/GOOGLE_API_KEY, has a free tier), "
        "'vllm' = local GPU model. 'auto' picks openai, else gemini, else "
        "vllm, based on which key is set.",
    )
    parser.add_argument(
        "--model",
        default=None,
        help=f"Model id; defaults to {DEFAULT_OPENAI_MODEL} (openai), "
        f"{DEFAULT_GEMINI_MODEL} (gemini) or {DEFAULT_VLLM_MODEL} (vllm)",
    )
    parser.add_argument(
        "--gpu-mem",
        dest="gpu_mem",
        type=float,
        default=0.5,
        help="Fraction of GPU memory vLLM may use (0-1). Default 0.5.",
    )
    parser.add_argument(
        "--max-model-len",
        dest="max_model_len",
        type=int,
        default=8192,
        help="Max token context for the model (caps KV-cache memory).",
    )
    return parser


def main():
    args = build_parser().parse_args()

    if args.file:
        path = Path(args.file)
        if not path.exists():
            raise SystemExit(f"Expectations file not found: {path}")
        text = path.read_text().strip()
    else:
        text = args.text.strip()
    if not text:
        raise SystemExit("Expectations text is empty.")

    backend = args.backend
    if backend == "auto":
        from dotenv import load_dotenv

        load_dotenv()
        if os.getenv("OPENAI_API_KEY"):
            backend = "openai"
        elif os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
            backend = "gemini"
        else:
            backend = "vllm"
        logger.info(f"Backend: {backend} (auto-selected)")

    if backend == "openai":
        exp = extract_openai(text, model=args.model or DEFAULT_OPENAI_MODEL)
    elif backend == "gemini":
        exp = extract_gemini(text, model=args.model or DEFAULT_GEMINI_MODEL)
    else:
        exp = extract_vllm(
            text,
            model=args.model or DEFAULT_VLLM_MODEL,
            gpu_memory_utilization=args.gpu_mem,
            max_model_len=args.max_model_len,
        )

    print_card(exp)
    Path(args.out).write_text(exp.model_dump_json(indent=2))
    print(f"\n✓ saved {args.out}")

    if backend == "vllm":
        # Same exit pattern as extractor.py: vLLM leaves background workers
        # that keep the interpreter alive, so flush and exit immediately.
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(0)


if __name__ == "__main__":
    main()
