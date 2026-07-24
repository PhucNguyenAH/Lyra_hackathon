export type JobResult = {
  job_url: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  applicants: string;
  description: string;
};

export type DbJob = {
  id: string;
  role: string;
  company: string;
  url: string | null;
  location: string | null;
  description: string | null;
  job_status?: string;
  created_at?: string;
};

const JOBS_API_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL
  ?? process.env.NEXT_PUBLIC_API_URL
  ?? ""
).replace(/\/$/, "");

function jobsUrl(path: string): string {
  if (!JOBS_API_URL) {
    throw new Error(
      "Job scraper backend is not configured. Set NEXT_PUBLIC_BACKEND_URL and restart the frontend.",
    );
  }
  return `${JOBS_API_URL}${path}`;
}

export async function scrapeJobs(title: string, location: string, count = 10): Promise<string> {
  const res = await fetch(jobsUrl("/jobs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, location, count }),
  });
  if (!res.ok) {
    throw new Error(res.status === 409 ? "Connect LinkedIn first" : `Scrape failed (${res.status})`);
  }
  const data = await res.json();
  return data.job_id as string;
}

export async function pollJob(
  jobId: string,
): Promise<{ status: string; results: JobResult[] | null; error: string | null }> {
  const res = await fetch(jobsUrl(`/jobs/${jobId}`));
  if (!res.ok) throw new Error(`Poll failed (${res.status})`);
  return res.json();
}

export async function listJobs(): Promise<DbJob[]> {
  const res = await fetch(jobsUrl("/jobs"));
  if (!res.ok) throw new Error(`Could not load scraped jobs (${res.status})`);
  return res.json();
}
