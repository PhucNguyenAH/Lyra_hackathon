"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Star, ShieldAlert, Award, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScoreBreakdown {
  overall: number;
  situation: number; // STAR structure
  task: number;
  action: number;
  result: number;
  relevance: number;
  specificity: number;
  metricsPresent: boolean;
  proseFeedback: string;
}

interface InterviewScorecardProps {
  score: ScoreBreakdown;
  questionText: string;
  answerText: string;
}

export function InterviewScorecard({ score, questionText, answerText }: InterviewScorecardProps) {
  const starMetrics = [
    { label: "Situation", value: score.situation, desc: "Context described" },
    { label: "Task", value: score.task, desc: "Goal/Problem identified" },
    { label: "Action", value: score.action, desc: "Detailed execution items" },
    { label: "Result", value: score.result, desc: "Outcomes achieved" },
  ];

  const qualityMetrics = [
    { label: "Relevance to Question", value: score.relevance },
    { label: "Technical Specificity", value: score.specificity },
  ];

  return (
    <div className="space-y-6">
      {/* Overview Block */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex flex-col items-center justify-center p-6 text-center">
          <div className="relative flex items-center justify-center h-24 w-24 rounded-full border-4 border-indigo-500/20 bg-indigo-500/5">
            <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
              {score.overall}
            </span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 absolute bottom-2">
              / 100
            </span>
          </div>
          <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mt-4">
            Response Score
          </h4>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            Calculated via rubrics guidelines
          </p>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 md:col-span-2 p-6 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
              <Award className="h-4 w-4" />
              Structural STAR Scoring Breakdown
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Your response is graded on the STAR behavioral format. Complete narratives include situation, action, and results.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {starMetrics.map((m) => (
              <div key={m.label} className="flex flex-col p-2.5 rounded-lg bg-zinc-100/40 dark:bg-zinc-800/20 border border-zinc-200/20">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  {m.label}
                </span>
                <span className="text-lg font-bold text-zinc-700 dark:text-zinc-200 mt-1">
                  {m.value}%
                </span>
                <span className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                  {m.desc}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Quality Ratings & Quantifiability */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quality Metrics */}
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-6 space-y-4">
          <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
            <Star className="h-4 w-4 text-indigo-500" />
            Quality Parameters
          </h4>
          <div className="space-y-4">
            {qualityMetrics.map((qm) => (
              <div key={qm.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-zinc-500">{qm.label}</span>
                  <span className="text-zinc-800 dark:text-zinc-200">{qm.value}%</span>
                </div>
                <Progress value={qm.value} className="h-1.5 bg-zinc-100 dark:bg-zinc-800 border-none" />
              </div>
            ))}
          </div>
        </Card>

        {/* Quantifiability Invariant Alert */}
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-6 flex flex-col justify-between">
          <div className="flex items-start gap-3">
            <div className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0",
              score.metricsPresent
                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            )}>
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                Quantified Metrics Presence
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-normal">
                {score.metricsPresent
                  ? "Outstanding! You included specific numbers (e.g. percentages, team sizes, load time savings) which makes your impact verifiable."
                  : "Caution: No quantifiable metrics were detected. Enhance your response by adding numeric outcomes (e.g. 'reduced load time by 40%', 'managed team of 4')."}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Narrative & Review Feedback */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-6 space-y-3">
        <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-indigo-500" />
          Detailed Feedback Review
        </h4>
        <div className="p-4 rounded-lg bg-zinc-100/50 dark:bg-zinc-800/30 border border-zinc-200/10 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
          {score.proseFeedback}
        </div>
      </Card>
    </div>
  );
}
