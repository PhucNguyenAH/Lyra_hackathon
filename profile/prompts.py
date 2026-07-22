"""Prompt contracts centralize the profile layer's factuality rules."""


EXTRACT_PROMPT = """You extract a candidate profile from one uploaded CV.

UPLOADED CV (raw text):
{cv_raw}

Produce an ExtractedCV containing identity fields plus a standalone master
profile. Include only facts supported by this CV. Rules:

IDENTITY:
- display_name: copy the candidate's full name only when explicitly shown.
- email: copy an email address only when explicitly shown.
- current_title: copy the candidate's headline or current role only when
  explicitly shown. Do not infer a title from skills, education, or projects.
- current_location: copy a location only when explicitly associated with the
  candidate. Do not use an employer, university, or project location.
- Return an empty string for every missing identity field. Never guess.

EXTRACTION:
- Extract every experience, project, skill, and education item from the
  CV into the master field. Preserve concrete details exactly: numbers, metrics, tech
  names, scale claims ("300,000+ requests"). Never round, never
  embellish, never invent.
- Normalize skill names to lowercase canonical forms ("PostgreSQL",
  "Postgres", "psql" → "postgresql"). Keep the candidate's original
  wording inside bullets untouched.
- Assign item ids in the pattern exp-{{org-slug}} / proj-{{name-slug}}.

TAGGING:
- Tag every experience and project with role_flavors it supports,
  chosen only from: backend, frontend, fullstack, ai, ml, data, devops,
  cloud, quant, mobile, security, platform.
  Judge from content: an API with locking and idempotency → backend,
  quant. A LangGraph agent system → ai. Tag generously (2-3 flavors)
  — tags are a pre-filter, not a verdict.
- skills[].evidence must list the item ids where each skill actually
  appears. A skill with no evidence should not exist.

SUMMARY:
- Copy a summary only when the CV contains an explicit summary, profile,
  or about section. Preserve its factual wording. If the CV has no such
  section, return an empty summary. Never synthesize one during extraction."""


MERGE_PROMPT = """You maintain a candidate's master profile — the deduplicated superset of
everything true about them across all their CV uploads.

CURRENT MASTER PROFILE (may be empty on first upload):
{master_json}

FACTS EXTRACTED FROM THE NEW UPLOAD:
{extracted_json}

Produce the updated master profile. Rules:

MERGING:
- Same role at the same organization = ONE experience. Union the
  bullets. When two bullets describe the same fact, keep the more
  specific/quantified one and drop the other.
- Same project under different names or descriptions = ONE project;
  merge the details.
- NEVER remove a fact that exists in the current master unless it is a
  duplicate of something you are keeping. Merges only add or dedupe.
- Preserve existing item ids exactly. New items retain the ids assigned
  during extraction in the pattern exp-{{org-slug}} / proj-{{name-slug}}.
- Preserve concrete details exactly: numbers, metrics, technology names,
  and scale claims. Never round, embellish, or invent.

EVIDENCE:
- Union role_flavors from duplicate items, using only: backend, frontend,
  fullstack, ai, ml, data, devops, cloud, quant, mobile, security, platform.
- Rebuild skills[].evidence so every entry names an item id where that
  skill actually appears. A skill with no evidence should not exist.

SUMMARY:
- Never synthesize a summary during merging. Preserve the current master's
  explicit summary when it has one; otherwise use the extracted CV's explicit
  summary. If neither input has one, return an empty summary."""


TAILOR_PROMPT = """You are tailoring a CV for a specific job by SELECTING from the
candidate's master profile. You are a curator, not a writer.

MASTER PROFILE:
{master_json}

TARGET JOB DESCRIPTION:
{jd_text}

Produce a CVVariant. Rules:

SELECTION:
- Choose the experiences and projects most relevant to THIS job.
  Max 4 projects. Use role_flavors as a first filter, then judge
  against the JD's actual requirements, not its job title.
- Every item_id and every bullet MUST originate from the master
  profile. You may lightly rephrase a bullet for flow, but you may not
  add facts, numbers, or technologies that are not in the master.
  If a bullet would benefit from a metric the master doesn't have,
  keep it metric-free — do not invent one.

RANKING & EMPHASIS:
- Order items by relevance to the JD, most relevant first.
- Within each item, keep only the bullets this job cares about
  (2-4 per item). A JD emphasizing scale promotes throughput/latency
  bullets; a JD emphasizing correctness promotes testing/locking/
  validation bullets.
- emphasized_skills: order the master's skills by JD relevance; omit
  skills irrelevant to this role rather than listing everything.

HONESTY:
- omitted_notable: list significant master items you deliberately
  excluded, so the user can override your judgment.
- rationale: explain the strategy in plain language ("This JD is
  payments-heavy, so BankFlow leads; CompMace is omitted because...").
- target_summary: rewrite the summary for this role using only facts
  from the master."""
