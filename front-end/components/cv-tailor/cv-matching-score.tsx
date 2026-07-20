"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface GapDetail {
  id: string;
  type: "strength" | "gap" | "warning";
  title: string;
  description: string;
  comment: string;
}

interface CVMatchingScoreProps {
  score: number;
  onProceed: () => void;
  onBack: () => void;
}

export function CVMatchingScore({ score, onProceed, onBack }: CVMatchingScoreProps) {
  // SVG gauge constants
  const radius = 60;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Wizard Steps Header */}
      <div className="flex items-center justify-center gap-2 text-xs font-semibold py-2 px-4 rounded-xl bg-zinc-150/40 dark:bg-zinc-900/40 border border-zinc-200/20 max-w-md mx-auto">
        <span className="text-zinc-400 dark:text-zinc-500">1. Job Details</span>
        <ArrowRight className="h-3 w-3 text-zinc-350" />
        <span className="text-indigo-600 dark:text-indigo-400 font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50">2. Match Analysis</span>
        <ArrowRight className="h-3 w-3 text-zinc-350" />
        <span className="text-zinc-450 dark:text-zinc-500">3. Suggested Enhancements</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Colored Gauge Card */}
        <Card className="border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md shadow-sm p-6 flex flex-col items-center justify-center text-center">
          <CardHeader className="pb-2 p-0">
            <CardTitle className="text-sm font-bold text-zinc-500 dark:text-zinc-400">Match Percentage</CardTitle>
          </CardHeader>
          <CardContent className="p-0 mt-4 relative flex items-center justify-center">
            {/* SVG Circular Gauge */}
            <svg className="w-36 h-36 transform -rotate-90">
              <circle
                cx="72"
                cy="72"
                r={radius}
                className="stroke-zinc-100 dark:stroke-zinc-800"
                strokeWidth={strokeWidth}
                fill="transparent"
              />
              <circle
                cx="72"
                cy="72"
                r={radius}
                className="stroke-indigo-600 dark:stroke-indigo-500 transition-all duration-1000 ease-out"
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                {score}%
              </span>
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mt-0.5">
                {score >= 80 ? "Good Fit" : score >= 50 ? "Moderate Gap" : "Critical Gap"}
              </span>
            </div>
          </CardContent>
          <CardFooter className="p-0 mt-6 flex flex-col space-y-2 w-full text-xs text-zinc-500 dark:text-zinc-400">
            <div className="flex justify-between w-full py-1.5 border-b border-zinc-150/40 dark:border-zinc-850/40">
              <span>Syllabus Covered</span>
              <strong className="text-zinc-800 dark:text-zinc-200">3 / 5 topics</strong>
            </div>
            <div className="flex justify-between w-full py-1.5">
              <span>Primary Gaps</span>
              <strong className="text-red-500">2 critical</strong>
            </div>
          </CardFooter>
        </Card>

        {/* Right Column: Gap Analysis & Commentary */}
        <Card className="border-zinc-200/50 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm md:col-span-2 p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                CV Evaluation & Gap Commentary
              </h3>
              <Badge variant="outline" className="border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-400 text-[10px] font-bold">
                Tailoring Advised
              </Badge>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-450 leading-relaxed bg-zinc-100/30 dark:bg-zinc-950/20 p-3 rounded-lg border border-zinc-200/10">
              <strong>Evaluation Summary:</strong> Your Master CV shows strong general experience with React, team management, and client-side builds. However, the target role requires expert-level Next.js (App Router), Tailwind CSS v4, and modern animation specifications which are currently missing or not emphasized.
            </p>

            <div className="space-y-3 pt-2">
              {mockGaps.map((gap) => {
                const Icon = gap.type === "strength" ? CheckCircle2 : gap.type === "gap" ? XCircle : AlertTriangle;
                return (
                  <div
                    key={gap.id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-xl border text-xs leading-normal",
                      gap.type === "strength"
                        ? "bg-green-500/5 border-green-500/10 text-zinc-700 dark:text-zinc-300"
                        : gap.type === "gap"
                        ? "bg-red-500/5 border-red-500/10 text-zinc-700 dark:text-zinc-300"
                        : "bg-amber-500/5 border-amber-500/10 text-zinc-700 dark:text-zinc-300"
                    )}
                  >
                    <Icon className={cn(
                      "h-4.5 w-4.5 flex-shrink-0 mt-0.5",
                      gap.type === "strength" ? "text-green-500" : gap.type === "gap" ? "text-red-500" : "text-amber-500"
                    )} />
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-zinc-800 dark:text-zinc-150">
                        {gap.title}
                      </h4>
                      <p className="text-zinc-400 dark:text-zinc-500 text-[10px]">
                        {gap.description}
                      </p>
                      <p className="text-zinc-500 dark:text-zinc-400 mt-1 pl-2 border-l border-zinc-200 dark:border-zinc-800 text-[11px] leading-relaxed">
                        {gap.comment}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* Navigation CTA controls */}
      <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <Button
          variant="outline"
          onClick={onBack}
          className="h-10 px-4 border-zinc-200 dark:border-zinc-800 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Modify Job Description
        </Button>

        <Button
          onClick={onProceed}
          className="h-10 px-6 rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-500/20 hover:bg-indigo-700 hover:scale-[1.01] transition-all flex items-center gap-1.5"
        >
          View Suggestions for Enhancement
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const mockGaps: GapDetail[] = [
  {
    id: "gap-1",
    type: "gap",
    title: "Next.js App Router (React 19) Missing",
    description: "Required: Next.js (App Router preferred) and React 19 skillsets.",
    comment: "Your master CV references client-side React apps but does not cite Next.js or newer v19 rendering hooks. Recommended: rewrite CloudCorp bullet 1 to show Next.js competency.",
  },
  {
    id: "gap-2",
    type: "gap",
    title: "Tailwind CSS & Component Library Structure Gap",
    description: "Required: Modern styling workflows: Tailwind CSS (v4) and shadcn UI component structures.",
    comment: "Your master CV states 'inline styling' and 'CSS templates'. Recommending restructuring CloudCorp bullet 3 to highlight Tailwind CSS styling paradigms.",
  },
  {
    id: "gap-3",
    type: "strength",
    title: "Performance Optimization Background Match",
    description: "Required: Web Performance Optimization (LCP, INP optimization).",
    comment: "Good match! Your resume outlines a 40% load time reduction. Suggestions will map this to modern Core Web Vitals (LCP/INP) parameters.",
  },
];
