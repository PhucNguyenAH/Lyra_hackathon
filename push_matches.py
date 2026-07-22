#!/usr/bin/env python3
"""
Bridge the matcher pipeline into the Supabase job pipeline.

Reads matches.json (from matcher.py) and upserts each match into the
Supabase `jobs` table (keyed by the job URL, see
supabase/2026-07-22_jobs_url_unique.sql), creating an `applications`
row (status 'scored') per job. Full posting text is pulled from the
job_embeddings/ pickles when available and stored as the job description.

The inbox watcher (email_services/) only matches applications in
applied/interview/offer, so after actually applying, promote the row:

Usage:
    # Push ranked matches (idempotent; re-running updates in place)
    python push_matches.py sync
    python push_matches.py sync --top 5 --matches matches.json

    # Preview without touching Supabase
    python push_matches.py sync --dry-run

    # Mark a job as applied (enters the watcher's field of view);
    # takes the LinkedIn job id or the full URL
    python push_matches.py applied 4441156786
    python push_matches.py applied https://www.linkedin.com/jobs/view/4441156786/

    # Show the pipeline as Supabase sees it
    python push_matches.py list

Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment or .env
(same variables as the email_services watcher). --dry-run needs neither.
"""
import argparse
import json
import os
import pickle
from datetime import UTC, datetime
from pathlib import Path
from typing import List, Optional

DEFAULT_MATCHES = "matches.json"
DEFAULT_JOB_DIR = "job_embeddings"

# jobs.score is numeric(4,2) constrained to 0..10; matcher scores are
# cosine-ish values in roughly 0..1, so scale x10 and clamp.
SCORE_SCALE = 10.0


def _client():
    """Build a service-role Supabase client (same env vars as the watcher)."""
    from dotenv import load_dotenv
    from supabase import create_client

    load_dotenv()
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        raise SystemExit(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the "
            "environment or .env (see email_services/ARCHITECTURE.md)."
        )
    return create_client(url, key)


# --------------------------------------------------------------------------- #
# matches.json -> job rows
# --------------------------------------------------------------------------- #
def load_matches(path: Path) -> List[dict]:
    """Read matcher.py output, handling both payload shapes.

    Plain runs write a bare list; --expectations runs write
    {"matches": [...], "excluded": [...]}. Excluded jobs are skipped —
    they hit a deal-breaker and should never become applications.
    """
    if not path.exists():
        raise SystemExit(f"Matches file not found: {path} — run matcher.py first.")
    payload = json.loads(path.read_text())
    if isinstance(payload, dict):
        return payload.get("matches") or []
    return payload


def load_description(job_dir: Path, job_id: str) -> Optional[str]:
    """Pull the full posting text from the extractor pickle, if still around."""
    pkl = job_dir / f"{job_id}.pkl"
    if not pkl.exists():
        return None
    data = pickle.loads(pkl.read_bytes())
    return data.get("text") or None


def to_job_row(match: dict, job_dir: Path) -> Optional[dict]:
    """Map one matcher entry onto the Supabase jobs schema.

    Returns None when the match has no URL — the URL is the upsert key,
    so rows without one cannot be synced idempotently.
    """
    url = (match.get("url") or "").strip()
    if not url:
        return None

    raw = match.get("adjusted_score", match.get("score")) or 0.0
    score = round(min(max(raw * SCORE_SCALE, 0.0), 10.0), 2)

    reasons = []
    for hit in match.get("matched") or []:
        reasons.append(f"+ {hit}")
    for flag in match.get("flags") or []:
        reasons.append(f"! {flag}")
    if match.get("rank"):
        reasons.insert(0, f"matcher rank #{match['rank']} (raw {raw:.3f})")

    return {
        "company": match.get("company") or "Unknown company",
        "role": match.get("job_title") or "Unknown role",
        "url": url,
        "location": match.get("location"),
        "description": load_description(job_dir, str(match["job_id"])),
        "score": score,
        "score_reasoning": " | ".join(reasons) or None,
    }


# --------------------------------------------------------------------------- #
# Subcommands
# --------------------------------------------------------------------------- #
def cmd_sync(args) -> None:
    matches = load_matches(Path(args.matches))
    if args.top:
        matches = matches[: args.top]  # matcher.py writes matches already rank-ordered
    if not matches:
        raise SystemExit("No matches to push.")

    job_dir = Path(args.job_dir)
    rows = []
    for m in matches:
        row = to_job_row(m, job_dir)
        if row is None:
            print(f"  ! skipping {m.get('job_title')} @ {m.get('company')}: no URL (upsert key)")
            continue
        rows.append(row)
    if not rows:
        raise SystemExit("No matches with URLs to push.")

    if args.dry_run:
        print(f"[dry-run] would upsert {len(rows)} job(s):\n")
        for row in rows:
            desc = row["description"]
            print(f"  [{row['score']:>5.2f}]  {row['role']} @ {row['company']}")
            print(f"      url:         {row['url']}")
            print(f"      description: {len(desc):,} chars" if desc else "      description: (no pickle found)")
            print(f"      reasoning:   {row['score_reasoning']}")
        print("\n[dry-run] plus one applications row (status 'scored') per job.")
        return

    db = _client()
    upserted = db.table("jobs").upsert(rows, on_conflict="url").execute()
    job_rows = upserted.data or []

    app_rows = [{"job_id": j["id"]} for j in job_rows]
    if app_rows:
        # ignore_duplicates keeps existing applications (and their status) intact
        db.table("applications").upsert(
            app_rows, on_conflict="job_id", ignore_duplicates=True
        ).execute()

    print(f"✓ upserted {len(job_rows)} job(s), ensured application rows exist")
    for j in job_rows:
        print(f"  {j['role']} @ {j['company']}  ({j.get('url')})")
    print("\nNext: python push_matches.py applied <job id or URL>  (after you apply)")


def _find_application(db, job_ref: str) -> dict:
    """Resolve a LinkedIn job id or full URL -> job -> application.

    Full URLs are matched exactly against jobs.url; bare ids are matched
    with a substring search so tracking-param variants still resolve.
    """
    query = db.table("jobs").select("id,company,role,url")
    if job_ref.startswith("http"):
        query = query.eq("url", job_ref.strip())
    else:
        query = query.like("url", f"%/jobs/view/{job_ref.strip('/')}%")
    jobs = (query.limit(2).execute()).data or []
    if not jobs:
        raise SystemExit(f"No job matching '{job_ref}' — run 'sync' first.")
    if len(jobs) > 1:
        raise SystemExit(
            f"'{job_ref}' matches more than one job — pass the exact URL instead."
        )
    job = jobs[0]

    apps = (
        db.table("applications").select("id,status").eq("job_id", job["id"]).limit(1).execute()
    ).data or []
    if not apps:
        raise SystemExit(
            f"{job['role']} @ {job['company']} has no application row — run 'sync' first."
        )
    return {"job": job, "application": apps[0]}


def cmd_applied(args) -> None:
    db = _client()
    found = _find_application(db, args.job_ref)
    app, job = found["application"], found["job"]

    if app["status"] != "scored":
        raise SystemExit(
            f"Application for {job['role']} @ {job['company']} is already "
            f"'{app['status']}' — nothing to do."
        )

    # scored -> applied is a manual transition, outside apply_watcher_transition's
    # legal table, so update directly but keep the status_history audit trail.
    db.table("applications").update(
        {"status": "applied", "applied_at": datetime.now(UTC).isoformat()}
    ).eq("id", app["id"]).execute()
    db.table("status_history").insert(
        {
            "application_id": app["id"],
            "from_status": "scored",
            "to_status": "applied",
            "source": "manual",
        }
    ).execute()

    print(f"✓ {job['role']} @ {job['company']} marked applied — the inbox watcher is now tracking it")


def cmd_list(args) -> None:
    db = _client()
    rows = (
        db.table("application_overview")
        .select("company,role,status,score,applied_at,last_activity_at,open_flags")
        .order("last_activity_at", desc=True)
        .execute()
    ).data or []
    if not rows:
        print("No applications in Supabase yet — run 'sync' first.")
        return

    print(f"{'status':<12} {'score':>5}  {'company / role':<60} flags")
    for r in rows:
        score = f"{r['score']:.2f}" if r.get("score") is not None else "  —"
        flags = f"⚠ {r['open_flags']}" if r.get("open_flags") else ""
        print(f"{r['status']:<12} {score:>5}  {r['company']} — {r['role']:<40.40} {flags}")


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_sync = sub.add_parser("sync", help="Upsert matches.json into Supabase")
    p_sync.add_argument("--matches", default=DEFAULT_MATCHES, help="matcher.py output JSON")
    p_sync.add_argument("--job-dir", default=DEFAULT_JOB_DIR, help="Directory of job pickles")
    p_sync.add_argument("--top", type=int, default=None, help="Only push the top N matches")
    p_sync.add_argument("--dry-run", action="store_true", help="Print rows without pushing")
    p_sync.set_defaults(func=cmd_sync)

    p_applied = sub.add_parser("applied", help="Mark a synced job as applied")
    p_applied.add_argument(
        "job_ref", help="LinkedIn job id (e.g. 4441156786) or the full job URL"
    )
    p_applied.set_defaults(func=cmd_applied)

    p_list = sub.add_parser("list", help="Show the application pipeline from Supabase")
    p_list.set_defaults(func=cmd_list)

    return parser


def main():
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
