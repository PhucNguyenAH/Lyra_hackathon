"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { DraftsDashboard, CVDraft } from "@/components/drafts-dashboard";
import { JobsDashboard, JobPosting } from "@/components/jobs-dashboard";
import { CVEditorWorkspace } from "@/components/cv-editor/cv-editor-workspace";
import { InterviewWorkspace } from "@/components/interview-practice/interview-workspace";
import { CVData } from "@/components/cv-editor/cv-pdf-preview";

type TabId = "drafts" | "cv-editor" | "jobs" | "interview";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("drafts");
  const [selectedDraftId, setSelectedDraftId] = useState<string>("draft-1");

  // Hoisted Drafts State
  const [drafts, setDrafts] = useState<CVDraft[]>([
    {
      id: "draft-1",
      title: "Kian Nguyen",
      role: "Backend Engineer",
      level: "Junior (0-2 years)",
      source: "PDF import",
      updated: "5/26/2026",
      exported: "5/26/2026",
    },
  ]);

  // Hoisted CV Experience Data State
  const [cvDatabase, setCvDatabase] = useState<{ [draftId: string]: CVData }>({
    "draft-1": initialKianCVData,
  });

  // Hoisted Jobs State
  const [jobs, setJobs] = useState<JobPosting[]>([
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
  ]);

  // Handle Select Draft from Dashboard
  const handleSelectDraft = (id: string) => {
    setSelectedDraftId(id);
    setActiveTab("cv-editor");
  };

  // Handle Delete Draft
  const handleDeleteDraft = (id: string) => {
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
  const handleSaveCVData = (updatedData: CVData) => {
    setCvDatabase((prev) => ({ ...prev, [selectedDraftId]: updatedData }));
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id === selectedDraftId) {
          return {
            ...d,
            title: updatedData.fullName,
            updated: new Date().toLocaleDateString(),
          };
        }
        return d;
      })
    );
  };

  // Handle Tailor CV CTA from Jobs Dashboard
  const handleTailorCV = (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (job) {
      // 1. Setup the active editing draft's targeted role to match the job title
      setDrafts((prev) =>
        prev.map((d) => {
          if (d.id === selectedDraftId) {
            return {
              ...d,
              role: job.title,
            };
          }
          return d;
        })
      );
      // 2. Open CV Editor Workspace
      setActiveTab("cv-editor");
    }
  };

  const currentDraftData = cvDatabase[selectedDraftId] || initialKianCVData;

  return (
    <DashboardLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === "drafts" && (
        <DraftsDashboard
          drafts={drafts}
          onSelectDraft={handleSelectDraft}
          onImportCV={handleImportCV}
          onDeleteDraft={handleDeleteDraft}
        />
      )}

      {activeTab === "cv-editor" && (
        <CVEditorWorkspace
          initialData={currentDraftData}
          onBack={() => setActiveTab("drafts")}
          onSave={handleSaveCVData}
        />
      )}

      {activeTab === "jobs" && (
        <JobsDashboard jobs={jobs} onTailorCV={handleTailorCV} />
      )}

      {activeTab === "interview" && <InterviewWorkspace />}
    </DashboardLayout>
  );
}

// Initial mockup CV Data for Kian Nguyen matching Image 1
const initialKianCVData: CVData = {
  fullName: "Kian Nguyen",
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
