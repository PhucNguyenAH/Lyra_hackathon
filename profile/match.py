"""LLM skill-match between a candidate's master profile and a job description.

Uses the same Groq/instructor structured client as the interview + CV flows.
Traceability (see front-end/CLAUDE.md §2.3): matched_skills must be skills the
candidate genuinely has — the prompt forbids inventing coverage and a post-filter
drops any matched skill that isn't among the JD's required skills.
"""

from typing import cast

from pydantic import BaseModel, Field

from interview.llm import (
    MAX_RETRIES,
    MODEL_NAME,
    MODEL_TEMPERATURE,
    create_structured_client,
)
from profile.schemas import MasterProfile

MAX_JD_CHARS = 6000

MATCH_PROMPT = """You compare a candidate's resume against a job description and score the fit.

CANDIDATE SKILLS (from their resume):
{skills}

CANDIDATE EXPERIENCE:
{experience}

JOB DESCRIPTION:
{jd}

Return, as structured data:
- required_skills: the key skills / technologies the JOB asks for. Concise canonical
  names (e.g. "Python", "Kubernetes", "React"), deduplicated, at most 12.
- matched_skills: the subset of required_skills that the candidate CLEARLY demonstrates
  in their skills or experience above. Only include a skill if it is genuinely evidenced
  by the candidate — never invent or assume coverage.
- match_score: an integer 0-100 for overall fit. Base it primarily on the fraction of
  required_skills the candidate matches, adjusted for how relevant their experience is to
  the role. 100 = excellent fit, 0 = no overlap.
"""


class JobMatch(BaseModel):
    """LLM verdict on how well a candidate fits one job."""

    match_score: int = Field(ge=0, le=100)
    required_skills: list[str] = Field(default_factory=list)
    matched_skills: list[str] = Field(default_factory=list)


def match_profile_to_jd(master: MasterProfile, jd_text: str) -> JobMatch:
    """Score the candidate's fit for one job description via a single LLM call."""
    skill_names = [s.name for s in master.skills]
    experience_tech = [t for e in master.experiences for t in e.tech]
    skills = ", ".join(dict.fromkeys(skill_names + experience_tech)) or "(none listed)"
    experience = (
        "; ".join(f"{e.role} at {e.org}" for e in master.experiences) or "(none listed)"
    )

    client = create_structured_client()
    result = cast(
        JobMatch,
        client.chat.completions.create(
            model=MODEL_NAME,
            response_model=JobMatch,
            messages=[
                {
                    "role": "system",
                    "content": MATCH_PROMPT.format(
                        skills=skills,
                        experience=experience,
                        jd=jd_text[:MAX_JD_CHARS],
                    ),
                }
            ],
            temperature=MODEL_TEMPERATURE,
            max_retries=MAX_RETRIES,
        ),
    )

    # Traceability guard: a matched skill must be one the JD actually requires.
    required_lower = {r.lower() for r in result.required_skills}
    result.matched_skills = [
        m for m in result.matched_skills if m.lower() in required_lower
    ]
    result.match_score = max(0, min(100, result.match_score))
    return result
