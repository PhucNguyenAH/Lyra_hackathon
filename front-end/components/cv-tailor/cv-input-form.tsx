"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, FileUp, RefreshCw } from "lucide-react";

interface CVInputFormProps {
  onSubmit: (masterCV: string, jobPosting: string) => void;
  isLoading: boolean;
}

export function CVInputForm({ onSubmit, isLoading }: CVInputFormProps) {
  const [masterCV, setMasterCV] = useState(defaultMasterCV);
  const [jobPosting, setJobPosting] = useState(defaultJobPosting);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (masterCV.trim() && jobPosting.trim()) {
      onSubmit(masterCV, jobPosting);
    }
  };

  const loadExample = () => {
    setMasterCV(defaultMasterCV);
    setJobPosting(defaultJobPosting);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Master CV Input */}
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Master CV Content</CardTitle>
                <CardDescription className="text-xs text-zinc-400 dark:text-zinc-500">
                  Paste your full, unmodified CV experience bullets here.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadExample}
                className="text-xs h-8 flex items-center gap-1 border-zinc-200 dark:border-zinc-850 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <RefreshCw className="h-3 w-3" />
                Reset Example
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Paste your CV here (e.g. - Managed team of 4 engineers building Next.js apps...)"
              value={masterCV}
              onChange={(e) => setMasterCV(e.target.value)}
              className="min-h-[350px] font-mono text-xs leading-relaxed resize-none bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500"
            />
          </CardContent>
        </Card>

        {/* Job Posting Input */}
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm">
          <CardHeader className="pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Job Description / Posting</CardTitle>
              <CardDescription className="text-xs text-zinc-400 dark:text-zinc-500">
                Paste the specific job description or target requirements list.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Paste job posting details here (e.g. Required: Experience with Tailwind, TypeScript, Next.js page transitions...)"
              value={jobPosting}
              onChange={(e) => setJobPosting(e.target.value)}
              className="min-h-[350px] font-mono text-xs leading-relaxed resize-none bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500"
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center pt-2">
        <Button
          type="submit"
          disabled={isLoading || !masterCV.trim() || !jobPosting.trim()}
          className="relative h-12 px-8 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-500 dark:to-violet-500 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/35 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Tailoring & Analyzing CV Invariants...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-300 fill-amber-300" />
              Enhance & Tailor CV
            </span>
          )}
        </Button>
      </div>
    </form>
  );
}

const defaultMasterCV = `• Lead Frontend Engineer at CloudCorp (2023 - Present)
  - Managed team of 4 engineers building modern client-side React applications.
  - Reduced page load times by 40% using manual image compression and Webpack chunking.
  - Implemented custom modal overlays, search menus, and tab interfaces using inline styling.
  - Maintained core CSS templates and set up ESLint/Jest test suites for CI/CD pipelines.

• Software Engineer at DevShop (2020 - 2023)
  - Developed full-stack SaaS apps with React, Node.js, Express, and PostgreSQL databases.
  - Created interactive data visualization charts and tables with custom CSS.
  - Wrote SQL scripts to optimize database queries, improving dashboard load times.
  - Documented REST APIs and coordinated with product designers for mockups.`;

const defaultJobPosting = `Position: Senior Frontend Architect
Key Requirements:
- Expert-level Next.js (App Router preferred) and React 19 skillsets.
- Strong knowledge of modern styling workflows: Tailwind CSS (v4) and shadcn UI component structures.
- Practical experience with Web Performance Optimization (LCP, INP optimization, fetch priority).
- UI Polish expertise: Popovers, custom overlays, animations (View Transitions API / scroll-driven animations).
- Strong collaborative mindset: Coordinate contracts with backend, design clean reusable systems.`;
