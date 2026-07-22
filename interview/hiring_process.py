"""Evidence-backed hiring-process research using Tavily and Groq."""

import json
import os
from typing import cast

import requests

from interview.llm import MAX_RETRIES, MODEL_NAME, MODEL_TEMPERATURE, StructuredClient, create_structured_client
from interview.schemas import HiringProcessResearch, HiringStageCategory


TAVILY_SEARCH_URL = "https://api.tavily.com/search"

RESEARCH_PROMPT = """
Convert web research into a sourced hiring process for one company and role.
Use only the supplied sources. Do not invent stages. If sources conflict, lower confidence
and say the process is typical rather than confirmed. Evidence URLs must come from the supplied
sources. Mark practice_supported=true only for phone_screen and experience_technical stages.
Coding assessments, online assessments, take-homes, and live coding are not supported.
Return stages in likely chronological order.
""".strip()


def research_hiring_process(
    company: str,
    job_title: str,
    job_url: str | None = None,
    *,
    http: object = requests,
    llm_client: StructuredClient | None = None,
) -> HiringProcessResearch:
    api_key = os.getenv("TAVILY_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("TAVILY_API_KEY is required to research hiring processes")
    query = f'"{company}" "{job_title}" interview process phone screen technical interview'
    response = http.post(
        TAVILY_SEARCH_URL,
        json={
            "api_key": api_key,
            "query": query,
            "search_depth": "advanced",
            "max_results": 8,
            "include_answer": "advanced",
            "include_raw_content": False,
        },
        timeout=25,
    )
    response.raise_for_status()
    payload = response.json()
    results = [
        {"title": item.get("title"), "url": item.get("url"), "content": item.get("content")}
        for item in payload.get("results", [])
        if item.get("url") and item.get("content")
    ]
    if not results:
        raise ValueError("No reliable hiring-process sources were found for this job")
    evidence = {
        "company": company,
        "job_title": job_title,
        "job_url": job_url,
        "tavily_answer": payload.get("answer"),
        "sources": results,
    }
    llm = llm_client or create_structured_client()
    result = llm.chat.completions.create(
        model=MODEL_NAME,
        response_model=HiringProcessResearch,
        messages=[
            {"role": "system", "content": RESEARCH_PROMPT},
            {"role": "user", "content": json.dumps(evidence, ensure_ascii=False)},
        ],
        temperature=MODEL_TEMPERATURE,
        max_retries=MAX_RETRIES,
    )
    research = cast(HiringProcessResearch, result)
    normalized_stages = []
    coding_markers = ("coding", "leetcode", "algorithm", "dsa", "data structure", "karat", "hackerrank")
    for stage in research.stages:
        stage_text = f"{stage.name} {stage.description}".casefold()
        is_coding_round = any(marker in stage_text for marker in coding_markers)
        category = HiringStageCategory.CODING_ASSESSMENT if is_coding_round else stage.category
        normalized_stages.append(
            stage.model_copy(
                update={
                    "category": category,
                    "practice_supported": category
                    in {HiringStageCategory.PHONE_SCREEN, HiringStageCategory.EXPERIENCE_TECHNICAL},
                }
            )
        )
    research.stages = normalized_stages
    return research
