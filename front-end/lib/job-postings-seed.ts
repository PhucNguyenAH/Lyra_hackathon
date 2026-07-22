// Real Sydney SWE intern/grad postings, curated 2026-07-22.
// Single source of truth — the jobs dashboard and interview practice's
// target-job picker both read from this instead of separate mock arrays.

export type JobPostingSeed = {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  skills: string[];
  score: number;
  url: string;
};

// The only job/application row actually seeded in Supabase's `jobs`/`applications`
// tables so far (those tables are the job-scraping teammate's slice — the 18
// postings above only live in this frontend seed, not the real DB yet).
// Real tailoring calls need a real application_id, so this is what backs them
// until more postings are seeded server-side.
export const DEMO_SEEDED_APPLICATION_ID = "69107f20-662a-4e53-9795-fb5d39396845";
export const DEMO_SEEDED_JOB = {
  title: "Backend Engineer",
  company: "InnovateTech Solutions",
  location: "Sydney, NSW",
  description: "Backend engineering with Java, Spring Boot, PostgreSQL, and AWS.",
};

export const JOB_POSTINGS_SEED: JobPostingSeed[] = [
  { id: "11111111-0000-4000-8000-000000000001", title: "Software Engineer Intern, 2026 Summer Australia", company: "Atlassian", location: "Sydney, NSW (Team Anywhere)", description: "Paid summer internship across backend/frontend/fullstack; Australia's #1 ranked large graduate program, pipeline into grad roles.", skills: ["Backend", "Frontend", "Full-Stack", "LLM Products"], score: 9.5, url: "https://www.atlassian.com/company/careers/details/23861" },
  { id: "11111111-0000-4000-8000-000000000002", title: "Backend Software Engineer", company: "Atlassian", location: "Sydney, NSW / Remote", description: "Backend services at enterprise scale (Kubernetes platform, Transactional Data Platform teams); heavy AI investment via Rovo.", skills: ["Kubernetes", "Database Systems", "AI Platforms (Rovo)"], score: 8.0, url: "https://www.atlassian.com/company/careers/all-jobs" },
  { id: "11111111-0000-4000-8000-000000000003", title: "Backend Engineer Intern, TikTok LIVE Growth - 2026 Start", company: "TikTok", location: "Sydney, NSW", description: "Backend intern on LIVE Growth; also hiring Data Trust & Safety backend interns for 2026 start.", skills: ["Python", "Go", "Backend at Scale"], score: 9.0, url: "https://careers.tiktok.com/position?location=Sydney" },
  { id: "11111111-0000-4000-8000-000000000004", title: "Graduate Backend Software Engineer, TikTok LIVE - 2026 Start", company: "TikTok", location: "Sydney, NSW", description: "Grad backend roles across LIVE Foundation, Multimedia Platform, and streaming infrastructure teams.", skills: ["Streaming Infrastructure", "Multimedia Platform", "Backend"], score: 7.5, url: "https://careers.tiktok.com/position?location=Sydney" },
  { id: "11111111-0000-4000-8000-000000000005", title: "Backend Software Engineer - Product & Features (Java)", company: "Canva", location: "Sydney, NSW (remote ANZ)", description: "Backend product engineering; Canva leads consumer-scale generative AI in Australia, strong mentorship culture.", skills: ["Java", "Backend", "Generative AI"], score: 8.0, url: "https://www.lifeatcanva.com/en/jobs/" },
  { id: "11111111-0000-4000-8000-000000000006", title: "Software Engineer, Early Career / STEP Intern", company: "Google", location: "Sydney, NSW (Pyrmont)", description: "Early-career SWE and STEP internships; Google has 62% more eng roles listed YoY with AI engineering prioritised.", skills: ["Software Engineering Fundamentals", "AI Engineering"], score: 7.5, url: "https://www.google.com/about/careers/applications/jobs/results/?location=Sydney" },
  { id: "11111111-0000-4000-8000-000000000007", title: "SDE Intern / SDE I - AI/ML Services", company: "Amazon (AWS)", location: "Sydney, NSW", description: "Backend services for AWS platform teams; Amazon is top-3 globally by open engineering positions.", skills: ["AWS", "Backend Services", "AI/ML"], score: 8.0, url: "https://www.amazon.jobs/en/search?base_query=software+engineer&loc_query=Sydney" },
  { id: "11111111-0000-4000-8000-000000000008", title: "Software Engineer - Azure AI / Copilot", company: "Microsoft", location: "Sydney, NSW", description: "Azure AI platform and Copilot engineering; one of three AI platform anchors in Sydney with Google and AWS.", skills: ["Azure", "AI Platform Engineering", "Copilot"], score: 7.0, url: "https://jobs.careers.microsoft.com/global/en/search?lc=Sydney%2C%20New%20South%20Wales%2C%20Australia" },
  { id: "11111111-0000-4000-8000-000000000009", title: "Senior/Staff Backend Engineer - Search", company: "SafetyCulture", location: "Sydney, NSW (Surry Hills)", description: "Search infrastructure over 5PB of inspection data and 4B images; building AI/ML on the world's largest workplace inspection dataset.", skills: ["Search Infrastructure", "AI/ML", "Retrieval Systems"], score: 8.0, url: "https://jobs.lever.co/safetyculture-2" },
  { id: "11111111-0000-4000-8000-000000000010", title: "Machine Learning Engineer / Backend Engineer", company: "Rokt", location: "Sydney, NSW", description: "Real-time ranking/relevance ML at ecommerce transaction scale; Sydney-founded unicorn with strong grad hiring history.", skills: ["Machine Learning", "Real-Time Ranking", "Eval Systems"], score: 8.5, url: "https://www.rokt.com/careers/" },
  { id: "11111111-0000-4000-8000-000000000011", title: "AI Engineer / Backend Engineer", company: "Harrison.ai / Annalise.ai", location: "Sydney, NSW", description: "Healthcare AI (radiology/pathology); Python-heavy ML engineering with regulatory validation and human-in-the-loop review.", skills: ["Python", "Machine Learning", "Regulatory/HITL Pipelines"], score: 8.0, url: "https://harrison.ai/careers/" },
  { id: "11111111-0000-4000-8000-000000000012", title: "Backend Engineer - Risk/Fraud ML Platform", company: "Zip Co", location: "Sydney, NSW", description: "BNPL fintech; ML platforms for fraud detection, credit risk, personalization. Fintech is among Sydney's most aggressive AI hirers.", skills: ["TypeScript", "Python", "Fraud Detection ML"], score: 7.5, url: "https://zip.co/careers" },
  { id: "11111111-0000-4000-8000-000000000013", title: "Software Engineer (TypeScript, Full-Stack/Backend)", company: "Eucalyptus", location: "Sydney, NSW", description: "Digital healthcare group (Juniper, Pilot, Kin); TS/Node monorepo, ships AI-assisted care tooling, known junior pipeline.", skills: ["TypeScript", "Node.js", "AI-assisted Tooling"], score: 8.5, url: "https://www.eucalyptus.health/careers" },
  { id: "11111111-0000-4000-8000-000000000014", title: "Backend Engineer - Payments Platform", company: "Airwallex", location: "Sydney, NSW", description: "Cross-border payments unicorn (AU$5.5B); ML-driven FX and transaction systems, hires backend across Java/Kotlin/Python.", skills: ["Java", "Kotlin", "Python", "Payments Systems"], score: 7.5, url: "https://careers.airwallex.com/" },
  { id: "11111111-0000-4000-8000-000000000015", title: "Backend Engineer (Go/TypeScript)", company: "Immutable", location: "Sydney, NSW", description: "Web3 gaming unicorn (AU$2.5B); high-throughput trading/minting infrastructure, TS and Go backend.", skills: ["Go", "TypeScript", "High-Throughput Systems"], score: 7.0, url: "https://www.immutable.com/careers" },
  { id: "11111111-0000-4000-8000-000000000016", title: "Software Engineer - AI/Platform", company: "Deputy", location: "Sydney, NSW", description: "Workforce management unicorn; shipping AI scheduling/forecasting features, PHP/Go/Python backend.", skills: ["PHP", "Go", "Python", "AI Features"], score: 7.0, url: "https://www.deputy.com/careers" },
  { id: "11111111-0000-4000-8000-000000000017", title: "Software Engineer (TypeScript)", company: "Dovetail", location: "Sydney, NSW (Surry Hills)", description: "Customer insights platform going all-in on LLM-powered analysis; full TS stack (React, Node, AWS CDK).", skills: ["TypeScript", "React", "Node.js", "AWS CDK", "LLM-powered Analysis"], score: 8.5, url: "https://dovetail.com/careers/" },
  { id: "11111111-0000-4000-8000-000000000018", title: "Graduate/Associate Software Engineer", company: "WiseTech Global", location: "Sydney, NSW (Alexandria)", description: "Logistics software giant (CargoWise) — literally customs and freight logistics at global scale; runs a large structured grad program.", skills: ["Logistics Systems", "CargoWise", "Backend"], score: 9.0, url: "https://www.wisetechglobal.com/careers/" },
];

const AUSTRALIA_MARKERS = ["sydney", "australia", "nsw", "anz"];

export function isAustraliaBased(location: string): boolean {
  const lower = location.toLowerCase();
  return AUSTRALIA_MARKERS.some((marker) => lower.includes(marker));
}

/** Australia-based postings first, best score first within each group. */
export function sortAustraliaFirst(jobs: JobPostingSeed[]): JobPostingSeed[] {
  return [...jobs].sort((a, b) => {
    const auDiff = Number(isAustraliaBased(b.location)) - Number(isAustraliaBased(a.location));
    if (auDiff !== 0) return auDiff;
    return b.score - a.score;
  });
}

/** Deterministic within one hour, reshuffles on the next — stable mid-demo, fresh next session. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rotateJobPool(hourBucket: number, poolSize: number): JobPostingSeed[] {
  const random = mulberry32(hourBucket);
  const shuffled = [...JOB_POSTINGS_SEED];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, poolSize);
}
