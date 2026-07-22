"""CV-anchored topic generation with cross-session weakness callbacks."""

import json
from typing import cast

from interview.llm import MAX_RETRIES, MODEL_NAME, MODEL_TEMPERATURE, StructuredClient, create_structured_client
from interview.schemas import Topic, WeakTopic


QUESTION_PROMPT_TEMPLATE = """
You are preparing interview topics for a mock interview.

CANDIDATE CV:
{cv_text}

TARGET SENIORITY: {role_level}

{job_section}
{weakness_section}

Generate 6-8 interview topics as JSON. Rules:
- Every topic must be anchored in a SPECIFIC item from the CV. Never ask a generic
  "challenging project" question; name the candidate's real project, employer, or skill.
- If previous weaknesses are provided, topics 1-2 MUST target them and include a callback
  field with a one-sentence opener such as "Last session you had trouble quantifying impact —
  let's work on that first."
- Mix 2-3 behavioral topics anchored in CV projects and 3-4 technical topics anchored in
  CV skills/stack. If a target role is provided, include 2 company-domain topics derived
  from its actual requirements while still anchoring them in the CV.
- Each topic has: id, type, title, opening_question, what_good_looks_like, and optional callback.
- what_good_looks_like contains 2-3 concise criteria covering specifics, numbers, or trade-offs.
- Match question and probing depth to TARGET SENIORITY. For interns, graduates, and junior
  candidates, invite them to explain what they personally did and learned. Do not challenge
  them as if they owned senior-level architecture, capacity planning, or company-wide outcomes.
- A large metric in the CV is evidence to discuss, not proof that a junior candidate personally
  designed the entire system behind it. Ask about their contribution and observations.
- Use unique, stable kebab-case ids. Do not invent candidate experience.
""".strip()


def build_question_prompt(
    cv_text: str,
    job_description: str | None,
    weak_topics: list[WeakTopic],
    role_level: str | None = None,
) -> str:
    job_section = (
        "TARGET ROLE (company domain questions must come from this JD):\n" + job_description
        if job_description
        else ""
    )
    weakness_section = (
        "WEAKNESSES FROM THE CANDIDATE'S LAST SESSION:\n"
        + json.dumps([topic.model_dump() for topic in weak_topics], ensure_ascii=False)
        if weak_topics
        else ""
    )
    return QUESTION_PROMPT_TEMPLATE.format(
        cv_text=cv_text,
        role_level=role_level or "Not specified; infer conservatively from the CV",
        job_section=job_section,
        weakness_section=weakness_section,
    )


def generate_topics(
    cv_text: str,
    job_description: str | None = None,
    weak_topics: list[WeakTopic] | None = None,
    role_level: str | None = None,
    client: StructuredClient | None = None,
) -> list[Topic]:
    """Generate schema-validated topics grounded in persisted candidate evidence."""
    if not cv_text.strip():
        raise ValueError("A non-empty CV is required to generate interview topics")
    llm = client or create_structured_client()
    prompt = build_question_prompt(cv_text, job_description, weak_topics or [], role_level)
    result = llm.chat.completions.create(
        model=MODEL_NAME,
        response_model=list[Topic],
        messages=[{"role": "system", "content": prompt}],
        temperature=MODEL_TEMPERATURE,
        max_retries=MAX_RETRIES,
    )
    return cast(list[Topic], result)
