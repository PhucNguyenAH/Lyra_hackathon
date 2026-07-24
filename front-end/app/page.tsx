"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";
import { DraftsDashboard, CVDraft } from "@/components/drafts-dashboard";
import { type JobPosting } from "@/components/jobs-dashboard";
import { JOB_POSTINGS_SEED, sortAustraliaFirst } from "@/lib/job-postings-seed";
import { CVEditorWorkspace } from "@/components/cv-editor/cv-editor-workspace";
import { InterviewWorkspace } from "@/components/interview-practice/interview-workspace";
import { ApplicationPipeline } from "@/components/application-pipeline";
import { CVData } from "@/components/cv-editor/cv-pdf-preview";
import { CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getProfile, tailorPreview, matchJob } from "@/lib/profile-api";
import { buildTailoredCV } from "@/lib/cv-tailoring";
import { listJobs } from "@/lib/jobs-api";

type TabId = "drafts" | "applications" | "cv-editor" | "interview";

const CONFIGURED_USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "";
const BROWSER_USER_ID_KEY = "lyra-interview-user-id";
const DRAFTS_STORAGE_KEY = "lyra-cv-drafts";
const CV_DATABASE_STORAGE_KEY = "lyra-cv-database";

// Run async work over items with a bounded number in flight — keeps the
// per-job LLM match calls from hammering the backend / hitting rate limits.
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}

function getBuilderUserId(): string {
  if (CONFIGURED_USER_ID) return CONFIGURED_USER_ID;
  const existing = window.localStorage.getItem(BROWSER_USER_ID_KEY);
  if (existing) return existing;
  const generated = window.crypto.randomUUID();
  window.localStorage.setItem(BROWSER_USER_ID_KEY, generated);
  return generated;
}


export default function Home({ interviewSessionId }: { interviewSessionId?: string } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab: TabId = pathname.startsWith("/applications") ? "applications" : pathname.startsWith("/cv-builder") ? "cv-editor" : pathname.startsWith("/interviews") ? "interview" : "drafts";
  const setActiveTab = (tab: TabId) => router.push(tab === "applications" ? "/applications" : tab === "cv-editor" ? "/cv-builder" : tab === "interview" ? "/interviews" : "/");
  const [selectedDraftId, setSelectedDraftId] = useState<string>("");
  const [isExamMode, setIsExamMode] = useState(false);
  const [tailoringState, setTailoringState] = useState<{ job: JobPosting; phase: "analyzing" | "rewriting" | "ready" } | null>(null);

  // Hoisted Drafts State
  const [drafts, setDrafts] = useState<CVDraft[]>([
    {
      id: "draft-1",
      title: "Example CV · Kian Nguyen",
      role: "Backend Engineer",
      level: "Junior (0-2 years)",
      source: "Example template",
      updated: "5/26/2026",
      exported: "5/26/2026",
      matchScore: 78,
      targetCompany: "InnovateTech Solutions",
      matchedSkills: ["Java", "Spring Boot", "PostgreSQL", "Docker", "AWS"],
      missingSkills: ["Kubernetes", "System design"],
      matchSuggestions: [
        { id: "example-summary", title: "Lead with backend fit", detail: "Move Java, Spring Boot, and AWS into the first summary sentence.", scoreBoost: 4, action: "summary" },
        { id: "example-impact", title: "Quantify the internship", detail: "Add request volume, latency, or user impact to the first experience bullet.", scoreBoost: 5, action: "experience" },
        { id: "example-gaps", title: "Review missing keywords", detail: "Only add Kubernetes or system design if you have real experience using them.", scoreBoost: 0, action: "skills" },
      ],
    },
  ]);

  // Hoisted CV Experience Data State
  const [cvDatabase, setCvDatabase] = useState<{ [draftId: string]: CVData }>({
    "draft-1": initialKianCVData,
  });

  // Persist drafts + their CV content across reloads — previously pure in-memory
  // state, so every "Enhance CV" row vanished the moment the page refreshed.
  const hasHydratedDraftsRef = useRef(false);

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        const savedDrafts = window.localStorage.getItem(DRAFTS_STORAGE_KEY);
        const savedDatabase = window.localStorage.getItem(CV_DATABASE_STORAGE_KEY);
        if (savedDrafts) setDrafts(JSON.parse(savedDrafts) as CVDraft[]);
        if (savedDatabase) setCvDatabase(JSON.parse(savedDatabase) as { [draftId: string]: CVData });
      } catch {
        // Corrupt or unavailable storage, keep the default starter draft.
      } finally {
        hasHydratedDraftsRef.current = true;
      }
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  useEffect(() => {
    if (!hasHydratedDraftsRef.current) return;
    window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  }, [drafts]);

  useEffect(() => {
    if (!hasHydratedDraftsRef.current) return;
    window.localStorage.setItem(CV_DATABASE_STORAGE_KEY, JSON.stringify(cvDatabase));
  }, [cvDatabase]);

  // Hoisted Jobs State — real seed pool only, Australia-based roles first, best score first within that.
  const [jobs, setJobs] = useState<JobPosting[]>(() =>
    sortAustraliaFirst(JOB_POSTINGS_SEED).map((posting) => {
      const matchedCount = Math.round(posting.skills.length * (posting.score / 10));
      return {
        id: posting.id,
        title: posting.title,
        company: posting.company,
        location: posting.location,
        matchScore: Math.round(posting.score * 10),
        skillsRequired: posting.skills,
        skillsMatched: posting.skills.slice(0, matchedCount),
        description: posting.description,
        url: posting.url,
      };
    }),
  );

  // Fetch persisted jobs from Supabase (via scraper backend) on mount; keep the
  // seed above as the fallback when the DB has nothing yet. Then score each job's
  // fit against the user's resume with the LLM match endpoint (a few at a time).
  useEffect(() => {
    listJobs()
      .then((rows) => {
        if (!rows.length) return;
        const canMatch = Boolean(CONFIGURED_USER_ID);
        const mapped: JobPosting[] = rows.map((r) => ({
          id: r.id,
          title: r.role,
          company: r.company,
          location: r.location ?? "",
          matchScore: 0,
          skillsRequired: [],
          skillsMatched: [],
          description: r.description ?? undefined,
          url: r.url ?? undefined,
          matchPending: canMatch && Boolean(r.description),
        }));
        setJobs(mapped);

        if (!canMatch) return;
        const toMatch = mapped.filter((job) => job.matchPending && job.description);
        void mapWithConcurrency(toMatch, 4, async (job) => {
          try {
            const result = await matchJob(CONFIGURED_USER_ID, job.description as string);
            setJobs((prev) =>
              prev.map((j) =>
                j.id === job.id
                  ? {
                      ...j,
                      matchScore: result.match_score,
                      skillsRequired: result.required_skills,
                      skillsMatched: result.matched_skills,
                      matchPending: false,
                    }
                  : j,
              ),
            );
          } catch {
            // Leave the score at 0 but stop the spinner on failure.
            setJobs((prev) =>
              prev.map((j) => (j.id === job.id ? { ...j, matchPending: false } : j)),
            );
          }
        });
      })
      .catch(() => {});
  }, []);

  // Handle Select Draft from Dashboard
  const handleSelectDraft = (id: string) => {
    setSelectedDraftId(id);
    setActiveTab("cv-editor");
  };

  // Handle Delete Draft
  const handleDeleteDraft = (id: string) => {
    const sourcePdfUrl = drafts.find((draft) => draft.id === id)?.sourcePdfUrl;
    if (sourcePdfUrl) URL.revokeObjectURL(sourcePdfUrl);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    // Clean up corresponding database entry
    setCvDatabase((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  };

  // Handle Import/Parse PDF to create a new draft
  const handleImportCV = (name: string, role: string, level: string) => {
    const newId = `draft-${Date.now()}`;
    const newDraft: CVDraft = {
      id: newId,
      title: name,
      role: role,
      level: level,
      source: "PDF import",
      updated: new Date().toLocaleDateString(),
      exported: "Never",
      matchScore: undefined,
    };

    const newCVDetails: CVData = {
      fullName: name,
      email: `${name.toLowerCase().replace(/\s+/g, "")}.works@gmail.com`,
      phone: "(415) 555-0123",
      location: "Sydney, NSW",
      github: "https://github.com/imported",
      linkedin: "https://linkedin.com/in/imported",
      summary: `Software engineer experienced in targeting ${role} roles at a ${level} level. Skilled in collaborative coding, unit testing, and design architectures.`,
      skills: [
        {
          id: `cat-imported-1`,
          name: "Core Skills",
          items: ["REST APIs", "SQL", "Git", "Docker"],
        },
      ],
      experience: [
        {
          company: "Previous Tech Employer",
          role: role,
          location: "Sydney, Australia",
          date: "2024 - Present",
          bullets: [
            "Contributed to core development features targeting high scalability systems.",
            "Collaborated with product designers and engineering leads to launch SaaS apps.",
          ],
        },
      ],
    };

    setDrafts((prev) => [newDraft, ...prev]);
    setCvDatabase((prev) => ({ ...prev, [newId]: newCVDetails }));
    setSelectedDraftId(newId);
    setActiveTab("cv-editor");
  };

  // Handle Save CV details from Editor
  const handleSaveCVData = (updatedData: CVData, matchScore: number) => {
    setCvDatabase((prev) => ({ ...prev, [selectedDraftId]: updatedData }));
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id === selectedDraftId) {
          return {
            ...d,
            title: updatedData.fullName,
            updated: new Date().toLocaleDateString(),
            matchScore,
          };
        }
        return d;
      })
    );
  };

  const handleExportCV = () => {
    setDrafts((prev) => prev.map((draft) => draft.id === selectedDraftId ? { ...draft, exported: new Date().toLocaleDateString() } : draft));
  };

  // Handle Tailor CV CTA from Jobs Dashboard
  const handleTailorCV = async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (job) {
      const sourceData = initialKianCVData;
      setTailoringState({ job, phase: "analyzing" });
      let variant: Awaited<ReturnType<typeof tailorPreview>>;
      let profile: Awaited<ReturnType<typeof getProfile>>;
      try {
        const userId = getBuilderUserId();
        const jdText = [
          `${job.title} at ${job.company} (${job.location}).`,
          job.description,
          `Required skills: ${job.skillsRequired.join(", ")}.`,
        ].filter(Boolean).join(" ");
        [profile, variant] = await Promise.all([
          getProfile(userId),
          tailorPreview(userId, jdText),
        ]);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not tailor from your master profile.",
        );
        setTailoringState(null);
        return;
      }
      setTailoringState({ job, phase: "rewriting" });
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      const jobDraftId = `draft-${job.id}-${Date.now()}`;
      const matchSuggestions = [
        { id: `${jobDraftId}-rationale`, title: "Why Athena selected this content", detail: variant.rationale, scoreBoost: 0, action: "summary" as const },
        ...(variant.omitted_notable.length > 0
          ? [{ id: `${jobDraftId}-omitted`, title: "Master-profile content left out", detail: `Less relevant for this job: ${variant.omitted_notable.join(", ")}. You can add it back if needed.`, scoreBoost: 0, action: "experience" as const }]
          : []),
        { id: `${jobDraftId}-skills`, title: "Skills selected for this job", detail: variant.emphasized_skills.length > 0 ? `Selected from your evidence: ${variant.emphasized_skills.join(", ")}.` : "No evidenced master-profile skills matched this job strongly enough.", scoreBoost: 3, action: "skills" as const },
      ];
      const tailoredData = buildTailoredCV(profile, variant, job.title, sourceData);
      setDrafts((prev) => [{
          id: jobDraftId,
          title: `${sourceData.fullName} · ${job.company}`,
          role: job.title,
          level: job.title.toLowerCase().includes("senior") ? "Senior (5+ years)" : "Targeted application",
          source: "AI-selected from master profile",
          updated: new Date().toLocaleDateString(),
          exported: "Never",
          matchScore: job.matchScore,
          targetCompany: job.company,
          matchedSkills: job.skillsMatched,
          missingSkills: job.skillsRequired.filter((skill) => !job.skillsMatched.includes(skill)),
          matchSuggestions,
        }, ...prev]);
      setCvDatabase((prev) => ({
          ...prev,
          [jobDraftId]: tailoredData,
        }));
      setTailoringState({ job, phase: "ready" });
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      setSelectedDraftId(jobDraftId);
      setActiveTab("cv-editor");
      setTailoringState(null);
    }
  };

  const currentDraftData = cvDatabase[selectedDraftId] || initialKianCVData;

  return (
    <>
    {tailoringState && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/35 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-white p-6 text-center shadow-2xl dark:bg-zinc-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            {tailoringState.phase === "ready" ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <LoaderCircle className="h-6 w-6 animate-spin" />}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Athena CV tailor</p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950 dark:text-zinc-50">{tailoringState.phase === "analyzing" ? "Analyzing the job" : tailoringState.phase === "rewriting" ? "Creating your tailored CV" : "Your draft is ready"}</h2>
          <p className="mt-2 text-sm text-zinc-500">{tailoringState.job.title} at {tailoringState.job.company}</p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"><div className={tailoringState.phase === "analyzing" ? "h-full w-1/3 rounded-full bg-indigo-600 transition-all" : tailoringState.phase === "rewriting" ? "h-full w-3/4 rounded-full bg-indigo-600 transition-all" : "h-full w-full rounded-full bg-emerald-600 transition-all"} /></div>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-500"><Sparkles className="h-3.5 w-3.5" />{tailoringState.phase === "analyzing" ? "Comparing skills and requirements" : tailoringState.phase === "rewriting" ? "Prioritizing relevant experience and keywords" : `${tailoringState.job.matchScore}% job match saved to draft`}</div>
        </div>
      </div>
    )}
    <DashboardLayout activeTab={activeTab} setActiveTab={setActiveTab} hideSidebar={isExamMode}>
      {activeTab === "drafts" && (
        <DraftsDashboard
          jobs={jobs}
          onTailorCV={handleTailorCV}
        />
      )}

      {activeTab === "cv-editor" && (
        <CVEditorWorkspace
          key={selectedDraftId}
          drafts={drafts}
          selectedDraftId={selectedDraftId}
          onSelectDraft={handleSelectDraft}
          onImportCV={handleImportCV}
          onDeleteDraft={handleDeleteDraft}
          initialData={currentDraftData}
          onBack={() => setActiveTab("drafts")}
          onSave={handleSaveCVData}
          onExport={handleExportCV}
        />
      )}

      {activeTab === "applications" && <ApplicationPipeline jobs={jobs} />}

      {activeTab === "interview" && (
        <InterviewWorkspace
          drafts={drafts}
          cvDatabase={cvDatabase}
          jobs={jobs}
          initialSessionId={interviewSessionId}
          onSessionIdChange={(sessionId) => router.push(sessionId ? `/interviews/${sessionId}` : "/interviews")}
          onExamModeChange={(active) => setIsExamMode(active)}
        />
      )}
    </DashboardLayout>
    </>
  );
}

// Initial mockup CV Data for Kian Nguyen matching Image 1
const initialKianCVData: CVData = {
  fullName: "Kian Nguyen",
  headline: "AI / Machine Learning Engineer | Sydney, NSW",
  sectionOrder: ["education", "experience", "projects", "skills", "summary", "achievements", "awards"],
  email: "kiannguyen.works@gmail.com",
  phone: "(415) 555-0123",
  location: "Sydney, NSW",
  github: "https://github.com/khnguyenn",
  linkedin: "https://www.linkedin.com/in/khngtran2301",
  summary:
    "Software Engineering and AI student with hands-on experience building and deploying production-scale backend systems, AI agent pipelines, and full-stack web applications. Skilled in Java Spring Boot, Python, LLM integration, REST API design, Docker, CI/CD, and AWS. Passionate about building reliable, well-tested, and intelligent software at scale.",
  skills: [
    {
      id: "cat-prog",
      name: "Programming Languages",
      items: ["Java", "Python", "JavaScript", "TypeScript", "C++", "SQL"],
    },
    {
      id: "cat-frame",
      name: "Frameworks & Tools",
      items: [
        "Spring Boot",
        "Spring Security",
        "React.js",
        "Next.js",
        "FastAPI",
        "LangChain",
        "LangGraph",
        "Prisma",
        "Supabase",
        "PostgreSQL",
        "ChromaDB",
        "MongoDB",
        "PyTorch",
        "TailwindCSS",
        "Docker",
        "Git",
        "Postman",
        "GitHub Actions",
      ],
    },
    {
      id: "cat-cloud",
      name: "Cloud & DevOps",
      items: ["AWS (EC2, RDS, Amplify, S3, IAM)", "Docker", "CI/CD", "GitHub Actions"],
    },
  ],
  experience: [
    {
      company: "Macquarie University",
      role: "Software Developer Intern",
      location: "NSW, Australia",
      date: "Dec 2025 - Mar 2026",
      bullets: [
        "Supported 1,000+ student workflows by developing a scalable learning platform using Next.js, TypeScript, and Supabase, handling 300,000+ requests in a single week.",
        "Built an LLM-powered question generation pipeline using LangChain and Claude API - chunked student lectures, generating contextual interactive questions, and serving 1,000+ LLM requests.",
      ],
    },
  ],
};
