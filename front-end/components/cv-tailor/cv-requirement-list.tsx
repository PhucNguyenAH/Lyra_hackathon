"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Requirement {
  id: string;
  text: string;
  category: string;
  status: "matched" | "partial" | "gap";
  score: number;
}

interface CVRequirementListProps {
  requirements: Requirement[];
  activeRequirementId: string | null;
  onHoverRequirement?: (id: string | null) => void;
}

export function CVRequirementList({
  requirements,
  activeRequirementId,
  onHoverRequirement,
}: CVRequirementListProps) {
  return (
    <Card className="border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm h-full flex flex-col">
      <CardHeader className="pb-3 flex-shrink-0">
        <CardTitle className="text-base font-semibold flex items-center justify-between">
          <span>Target Requirements</span>
          <Badge variant="outline" className="text-zinc-500 font-semibold border-zinc-200 dark:border-zinc-800">
            {requirements.filter((r) => r.status === "matched").length} / {requirements.length} Matched
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs text-zinc-400 dark:text-zinc-500">
          Key skill gaps and matching points extracted from the job description.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto min-h-0 pr-2 space-y-3">
        {requirements.map((req) => {
          const isHighlighted = activeRequirementId === req.id;
          return (
            <div
              key={req.id}
              onMouseEnter={() => onHoverRequirement?.(req.id)}
              onMouseLeave={() => onHoverRequirement?.(null)}
              className={cn(
                "group flex flex-col p-3 rounded-lg border text-left transition-all duration-300",
                isHighlighted
                  ? "bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 dark:border-indigo-400 shadow-sm scale-[1.01]"
                  : "bg-white dark:bg-zinc-950/30 border-zinc-150 dark:border-zinc-850 hover:border-zinc-300 dark:hover:border-zinc-750"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold leading-relaxed text-zinc-700 dark:text-zinc-300 flex-1">
                  {req.text}
                </p>
                <div className="flex-shrink-0 mt-0.5">
                  {req.status === "matched" && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {req.status === "partial" && (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  )}
                  {req.status === "gap" && (
                    <HelpCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[9px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800/80 px-1.5 py-0.5 rounded">
                  {req.category}
                </span>
                <span className="text-[9px] text-zinc-400 dark:text-zinc-500">
                  Match Score: <strong className={cn(
                    req.score >= 80 ? "text-green-600 dark:text-green-400" :
                    req.score >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-500"
                  )}>{req.score}%</strong>
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
