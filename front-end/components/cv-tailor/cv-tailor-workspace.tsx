"use client";

import React, { useState } from "react";
import { CVInputForm } from "./cv-input-form";
import { CVRequirementList, Requirement } from "./cv-requirement-list";
import { CVTailoredPreview, MasterBullet, TailoredBullet } from "./cv-tailored-preview";
import { CVChangeSummary } from "./cv-change-summary";
import { CVMatchingScore } from "./cv-matching-score";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowLeft, RefreshCw, FileCheck, ArrowRight } from "lucide-react";

type StepId = "STEP_1_JOB" | "STEP_2_SCORE" | "STEP_3_ENHANCE";

export function CVTailorWorkspace() {
  const [viewState, setViewState] = useState<StepId>("STEP_1_JOB");
  const [isLoading, setIsLoading] = useState(false);

  // Hover trace state linking requirements, master bullets, and tailored bullets
  const [activeHoverId, setActiveHoverId] = useState<string | null>(null);
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(null);

  const handleTailorSubmit = (masterCV: string, jobPosting: string) => {
    setIsLoading(true);
    // Simulate API processing delay
    setTimeout(() => {
      setIsLoading(false);
      setViewState("STEP_2_SCORE");
    }, 1800);
  };

  const handleHoverTailored = (
    tailoredId: string | null,
    sourceRef: string | null,
    reqIds: string[] | null
  ) => {
    setActiveHoverId(tailoredId);
    // If a tailored bullet is hovered, automatically highlight its first associated requirement
    if (reqIds && reqIds.length > 0) {
      setActiveRequirementId(reqIds[0]);
    } else {
      setActiveRequirementId(null);
    }
  };

  const handleHoverRequirement = (reqId: string | null) => {
    setActiveRequirementId(reqId);
  };

  return (
    <div className="flex-1 flex flex-col space-y-6">
      {viewState === "STEP_1_JOB" && (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-indigo-500 fill-indigo-500/20" />
              Tailor and Enhance CV Experience
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Optimize and restructure your CV bullets to fit a specific job posting. Matches original experiences to requirements with 100% trace accountability.
            </p>
          </div>
          <CVInputForm onSubmit={handleTailorSubmit} isLoading={isLoading} />
        </div>
      )}

      {viewState === "STEP_2_SCORE" && (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-indigo-500 fill-indigo-500/20" />
              CV Matching Score & Analysis
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Review how well your current resume maps to target requirements and inspect critical experience gaps.
            </p>
          </div>
          <CVMatchingScore
            score={62}
            onProceed={() => setViewState("STEP_3_ENHANCE")}
            onBack={() => setViewState("STEP_1_JOB")}
          />
        </div>
      )}

      {viewState === "STEP_3_ENHANCE" && (
        <div className="flex flex-col flex-1 min-h-0 space-y-6 animate-in fade-in-50 duration-300">
          {/* Top Wizard Steps Header */}
          <div className="flex items-center justify-center gap-2 text-xs font-semibold py-2 px-4 rounded-xl bg-zinc-150/40 dark:bg-zinc-900/40 border border-zinc-200/20 max-w-md mx-auto">
            <span className="text-zinc-400 dark:text-zinc-500">1. Job Details</span>
            <ArrowRight className="h-3 w-3 text-zinc-350" />
            <span className="text-zinc-400 dark:text-zinc-500">2. Match Analysis</span>
            <ArrowRight className="h-3 w-3 text-zinc-350" />
            <span className="text-indigo-600 dark:text-indigo-400 font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50">3. Suggested Enhancements</span>
          </div>

          {/* Results Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewState("STEP_2_SCORE")}
                className="h-9 px-3 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Analysis
              </Button>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-green-500" />
                  Optimized Experience Framework
                </h1>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Analyze matching results. Hover over tailored bullets to view their corresponding source bullet trace.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsLoading(true);
                setViewState("STEP_1_JOB");
              }}
              className="h-9 px-3 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Re-optimize
            </Button>
          </div>

          {/* Change Stats Summary */}
          <CVChangeSummary stats={mockStats} />

          {/* Main workspace panels */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1 min-h-[450px]">
            {/* Requirements list left panel */}
            <div className="xl:col-span-1 h-full min-h-0">
              <CVRequirementList
                requirements={mockRequirements}
                activeRequirementId={activeRequirementId}
                onHoverRequirement={handleHoverRequirement}
              />
            </div>

            {/* Side-by-side CV previews right panel */}
            <div className="xl:col-span-3 h-full min-h-0">
              <CVTailoredPreview
                masterBullets={mockMasterBullets}
                tailoredBullets={mockTailoredBullets}
                activeHoverId={activeHoverId}
                activeRequirementId={activeRequirementId}
                onHoverTailored={handleHoverTailored}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Mock Dataset

const mockRequirements: Requirement[] = [
  {
    id: "req-1",
    text: "Expert-level Next.js (App Router preferred) and React 19 skillsets.",
    category: "Frameworks",
    status: "matched",
    score: 95,
  },
  {
    id: "req-2",
    text: "Strong knowledge of modern styling workflows: Tailwind CSS (v4) and shadcn UI component structures.",
    category: "Styling",
    status: "matched",
    score: 90,
  },
  {
    id: "req-3",
    text: "Practical experience with Web Performance Optimization (LCP, INP optimization, fetch priority).",
    category: "Performance",
    status: "matched",
    score: 85,
  },
  {
    id: "req-4",
    text: "UI Polish expertise: Popovers, custom overlays, animations (View Transitions API / scroll-driven animations).",
    category: "Design System",
    status: "partial",
    score: 60,
  },
  {
    id: "req-5",
    text: "Strong collaborative mindset: Coordinate contracts with backend, design clean reusable systems.",
    category: "Collaboration",
    status: "matched",
    score: 90,
  },
];

const mockMasterBullets: MasterBullet[] = [
  {
    id: "master-1",
    text: "Managed team of 4 engineers building modern client-side React applications.",
    section: "CloudCorp Experience",
  },
  {
    id: "master-2",
    text: "Reduced page load times by 40% using manual image compression and Webpack chunking.",
    section: "CloudCorp Experience",
  },
  {
    id: "master-3",
    text: "Implemented custom modal overlays, search menus, and tab interfaces using inline styling.",
    section: "CloudCorp Experience",
  },
  {
    id: "master-4",
    text: "Maintained core CSS templates and set up ESLint/Jest test suites for CI/CD pipelines.",
    section: "CloudCorp Experience",
  },
  {
    id: "master-5",
    text: "Developed full-stack SaaS apps with React, Node.js, Express, and PostgreSQL databases.",
    section: "DevShop Experience",
  },
  {
    id: "master-6",
    text: "Created interactive data visualization charts and tables with custom CSS.",
    section: "DevShop Experience",
  },
];

const mockTailoredBullets: TailoredBullet[] = [
  {
    id: "tailored-1",
    text: "Led a team of 4 engineers building performance-tuned Next.js App Router applications, establishing scalable React 19 design patterns.",
    source_ref: "master-1",
    requirement_ids: ["req-1", "req-5"],
    change_type: "REWORDED",
    reasoning: "Updated from 'modern client-side React' to explicitly highlight Next.js (App Router) and React 19 to align with Senior Architect expectations.",
  },
  {
    id: "tailored-2",
    text: "Optimized Core Web Vitals, reducing LCP and improving page speeds by 40% using lazy-loading, image formats, and Webpack splitChunks configurations.",
    source_ref: "master-2",
    requirement_ids: ["req-3"],
    change_type: "EMPHASIZED",
    reasoning: "Mapped Webpack chunking and image compression to modern terms (LCP, Core Web Vitals) to appeal to performance optimization requirements.",
  },
  {
    id: "tailored-3",
    text: "Developed custom modal overlays, popovers, and interactive search and tab systems utilizing Tailwind CSS utility classes and modern styling approaches.",
    source_ref: "master-3",
    requirement_ids: ["req-2", "req-4"],
    change_type: "REWORDED",
    reasoning: "Replaced 'inline styling' with modern styling workflows (Tailwind CSS, popovers) which maps closer to modern CSS layouts.",
  },
  {
    id: "tailored-4",
    text: "Designed reusable UI components and coordinated frontend integration contracts with backend teams, ensuring consistency across development pipelines.",
    source_ref: "master-4",
    requirement_ids: ["req-5"],
    change_type: "EMPHASIZED",
    reasoning: "Reframed pipeline maintenance and core CSS duties as reusable component design and team contract coordination.",
  },
];

const mockStats = {
  reworded: 2,
  emphasized: 2,
  reordered: 0,
  unchanged: 0,
  total: 4,
};
