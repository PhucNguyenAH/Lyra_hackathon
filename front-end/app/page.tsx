"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { DraftsDashboard, CVDraft } from "@/components/drafts-dashboard";
import { type JobPosting } from "@/components/jobs-dashboard";
import { CVEditorWorkspace } from "@/components/cv-editor/cv-editor-workspace";
import { InterviewWorkspace } from "@/components/interview-practice/interview-workspace";
import { ApplicationPipeline } from "@/components/application-pipeline";
import { CVData } from "@/components/cv-editor/cv-pdf-preview";
import { CheckCircle2, LoaderCircle, Sparkles } from "lucide-react";

type TabId = "drafts" | "applications" | "cv-editor" | "interview";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("drafts");
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

  // Hoisted Jobs State
  const [jobs] = useState<JobPosting[]>([
    {
      id: "job-1",
      title: "Backend Engineer (Java / Spring Boot)",
      company: "InnovateTech Solutions",
      location: "Sydney, NSW (Hybrid)",
      matchScore: 92,
      skillsRequired: ["Java", "Spring Boot", "Spring Security", "PostgreSQL", "Docker", "AWS", "CI/CD"],
      skillsMatched: ["Java", "Spring Boot", "Spring Security", "PostgreSQL", "Docker", "AWS", "CI/CD"],
    },
    {
      id: "job-2",
      title: "Senior Frontend Architect",
      company: "Vercel Partner Studio",
      location: "Sydney, NSW (Remote)",
      matchScore: 62,
      skillsRequired: ["Next.js", "React.js", "TypeScript", "TailwindCSS", "Prisma", "AWS", "Performance Optimization"],
      skillsMatched: ["React.js", "TypeScript", "TailwindCSS", "Prisma", "AWS"],
    },
    {
      id: "job-3",
      title: "AI Engineer & Full Stack developer",
      company: "CognitiveAgents Corp",
      location: "Sydney, NSW (On-site)",
      matchScore: 84,
      skillsRequired: ["Python", "FastAPI", "LangChain", "ChromaDB", "React.js", "Next.js", "Docker"],
      skillsMatched: ["Python", "FastAPI", "LangChain", "ChromaDB", "React.js", "Next.js", "Docker"],
    },
    { id: "job-4", title: "Graduate Software Engineer", company: "Atlassian", location: "Sydney, NSW (Hybrid)", matchScore: 89, skillsRequired: ["Java", "TypeScript", "React.js", "SQL", "Git"], skillsMatched: ["Java", "TypeScript", "React.js", "SQL", "Git"] },
    { id: "job-5", title: "Platform Engineer", company: "Northstar Cloud", location: "Sydney, NSW", matchScore: 81, skillsRequired: ["AWS", "Docker", "Kubernetes", "PostgreSQL", "CI/CD"], skillsMatched: ["AWS", "Docker", "PostgreSQL", "CI/CD"] },
    { id: "job-6", title: "Junior Full Stack Developer", company: "Canva", location: "Sydney, NSW (Hybrid)", matchScore: 87, skillsRequired: ["React.js", "TypeScript", "Node.js", "PostgreSQL", "AWS"], skillsMatched: ["React.js", "TypeScript", "PostgreSQL", "AWS"] },
    { id: "job-7", title: "Machine Learning Engineer", company: "DataMuse AI", location: "Remote · Australia", matchScore: 76, skillsRequired: ["Python", "PyTorch", "FastAPI", "Docker", "MLOps"], skillsMatched: ["Python", "PyTorch", "FastAPI", "Docker"] },
    { id: "job-8", title: "Backend Developer", company: "Commonwealth FinTech", location: "Sydney, NSW", matchScore: 85, skillsRequired: ["Java", "Spring Boot", "PostgreSQL", "REST APIs", "AWS"], skillsMatched: ["Java", "Spring Boot", "PostgreSQL", "AWS"] },
    { id: "job-9", title: "Software Engineer, Cloud", company: "SafetyCulture", location: "Sydney, NSW (Hybrid)", matchScore: 79, skillsRequired: ["Go", "AWS", "Docker", "React.js", "CI/CD"], skillsMatched: ["AWS", "Docker", "React.js", "CI/CD"] },
    { id: "job-10", title: "AI Product Engineer", company: "Aurora Labs", location: "Remote · Australia", matchScore: 83, skillsRequired: ["Python", "LangChain", "Next.js", "Supabase", "LLM evaluation"], skillsMatched: ["Python", "LangChain", "Next.js", "Supabase"] },
  ]);

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
  const handleTailorCV = async (jobId: string, source: { draftId?: string; file?: File }) => {
    const job = jobs.find((j) => j.id === jobId);
    if (job) {
      const sourceData = source.draftId ? (cvDatabase[source.draftId] || initialKianCVData) : initialKianCVData;
      if (source.file) {
        const sourceDraftId = `source-${job.id}-${Date.now()}`;
        const sourcePdfUrl = URL.createObjectURL(source.file);
        setDrafts((prev) => [{
          id: sourceDraftId,
          title: `${source.file!.name.replace(/\.pdf$/i, "")} · ${job.company}`,
          role: job.title,
          level: "Enhancement workspace",
          source: `Uploaded PDF · ${source.file!.name}`,
          updated: new Date().toLocaleDateString(),
          exported: "Never",
          matchScore: job.matchScore,
          targetCompany: job.company,
          matchedSkills: job.skillsMatched,
          missingSkills: job.skillsRequired.filter((skill) => !job.skillsMatched.includes(skill)),
          matchSuggestions: [
            { id: `${job.id}-summary`, title: "Align the profile with this role", detail: `Prioritize ${job.skillsMatched.slice(0, 3).join(", ")} near the top of the suggested CV.`, scoreBoost: 4, action: "summary" },
            { id: `${job.id}-impact`, title: "Strengthen measurable impact", detail: "Keep the original facts, but move quantified outcomes to the start of each bullet.", scoreBoost: 5, action: "experience" },
            { id: `${job.id}-skills`, title: "Review missing requirements", detail: `Do not add ${job.skillsRequired.filter((skill) => !job.skillsMatched.includes(skill)).join(", ") || "new skills"} unless the source PDF supports them.`, scoreBoost: 0, action: "skills" },
          ],
          sourcePdfUrl,
          isEnhancementSource: true,
        }, ...prev]);
        setCvDatabase((prev) => ({ ...prev, [sourceDraftId]: { ...sourceData, headline: job.title, sectionOrder: ["education", "experience", "projects", "skills", "summary", "achievements", "awards"] } }));
        setSelectedDraftId(sourceDraftId);
        setActiveTab("cv-editor");
        return;
      }
      setTailoringState({ job, phase: "analyzing" });
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      setTailoringState({ job, phase: "rewriting" });
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      const jobDraftId = `draft-${job.id}-${Date.now()}`;
      setDrafts((prev) => [{
          id: jobDraftId,
          title: `${sourceData.fullName} · ${job.company}`,
          role: job.title,
          level: job.title.toLowerCase().includes("senior") ? "Senior (5+ years)" : "Targeted application",
          source: "Tailored from workspace CV",
          updated: new Date().toLocaleDateString(),
          exported: "Never",
          matchScore: job.matchScore,
          targetCompany: job.company,
          matchedSkills: job.skillsMatched,
          missingSkills: job.skillsRequired.filter((skill) => !job.skillsMatched.includes(skill)),
          matchSuggestions: [
            { id: `${job.id}-summary`, title: "Align the opening summary", detail: `Lead with ${job.skillsMatched.slice(0, 3).join(", ")} to make the role fit obvious.`, scoreBoost: 4, action: "summary" },
            { id: `${job.id}-impact`, title: "Strengthen experience evidence", detail: "Add one measurable outcome to the most relevant experience bullet.", scoreBoost: 5, action: "experience" },
            { id: `${job.id}-skills`, title: "Review skill gaps honestly", detail: `Check ${job.skillsRequired.filter((skill) => !job.skillsMatched.includes(skill)).join(", ") || "the remaining job requirements"}; only add skills you can support.`, scoreBoost: 0, action: "skills" },
          ],
        }, ...prev]);
      setCvDatabase((prev) => ({
          ...prev,
          [jobDraftId]: {
            ...sourceData,
            headline: job.title,
            sectionOrder: ["education", "experience", "projects", "skills", "summary", "achievements", "awards"],
            skills: sourceData.skills.map((category) => ({ ...category, items: [...category.items] })),
            experience: sourceData.experience.map((item) => ({ ...item, bullets: [...item.bullets] })),
          },
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
          drafts={drafts}
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
