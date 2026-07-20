"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TopicCoverage {
  id: string;
  name: string;
  status: "completed" | "active" | "pending";
  score: number | null;
}

interface InterviewCoverageProps {
  coverage: TopicCoverage[];
}

export function InterviewCoverage({ coverage }: InterviewCoverageProps) {
  const completedCount = coverage.filter((c) => c.status === "completed").length;

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span>Syllabus Coverage</span>
          <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">
            {completedCount} / {coverage.length} Topics
          </span>
        </CardTitle>
        <CardDescription className="text-xs text-zinc-400 dark:text-zinc-500">
          Targeted categories evaluated in this practice session.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-0 pr-2 space-y-3">
        {coverage.map((topic) => (
          <div
            key={topic.id}
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border text-xs transition-all duration-300",
              topic.status === "active"
                ? "bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 dark:border-indigo-400 font-semibold"
                : "bg-white dark:bg-zinc-950/30 border-zinc-150 dark:border-zinc-850"
            )}
          >
            <div className="flex items-center gap-2.5">
              {topic.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              ) : topic.status === "active" ? (
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                </span>
              ) : (
                <Circle className="h-4 w-4 text-zinc-300 dark:text-zinc-700 flex-shrink-0" />
              )}
              <span className={cn(
                topic.status === "completed" ? "text-zinc-500 dark:text-zinc-400 line-through" :
                topic.status === "active" ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-600 dark:text-zinc-400"
              )}>
                {topic.name}
              </span>
            </div>
            {topic.status === "completed" && topic.score !== null && (
              <span className="text-[10px] font-bold text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded bg-green-500/5 border border-green-500/20">
                {topic.score}%
              </span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
