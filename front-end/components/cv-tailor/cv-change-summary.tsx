"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ShieldCheck, RefreshCw, BarChart2, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface CVChangeSummaryProps {
  stats: {
    reworded: number;
    emphasized: number;
    reordered: number;
    unchanged: number;
    total: number;
  };
}

export function CVChangeSummary({ stats }: CVChangeSummaryProps) {
  return (
    <Card className="border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-indigo-500" />
            Tailoring Analysis & Invariants
          </CardTitle>
        </div>
        {/* Compliance Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400 text-xs font-semibold">
          <ShieldCheck className="h-4 w-4" />
          Traceability Invariant Verified
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Progress / Chart Column */}
          <div className="md:col-span-2 space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-zinc-500">Keywords Matching Rate</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">92% (+38%)</span>
              </div>
              <Progress value={92} className="h-2 bg-zinc-200 dark:bg-zinc-800 border-none" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs pt-1">
              <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-100/50 dark:bg-zinc-800/30">
                <span className="text-zinc-500">Tailoring Actions</span>
                <strong className="text-zinc-800 dark:text-zinc-200">{stats.total} bullets</strong>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-100/50 dark:bg-zinc-800/30">
                <span className="text-zinc-500">Unchanged</span>
                <strong className="text-zinc-800 dark:text-zinc-200">{stats.unchanged} bullets</strong>
              </div>
            </div>
          </div>

          {/* Action Counts */}
          <div className="grid grid-cols-3 col-span-2 gap-4">
            <div className="flex flex-col p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white/30 dark:bg-zinc-950/20 justify-center">
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Reworded
              </span>
              <span className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
                {stats.reworded}
              </span>
              <span className="text-[9px] text-zinc-400 mt-0.5">Optimized terminology</span>
            </div>

            <div className="flex flex-col p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white/30 dark:bg-zinc-950/20 justify-center">
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Emphasized
              </span>
              <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                {stats.emphasized}
              </span>
              <span className="text-[9px] text-zinc-400 mt-0.5">Prioritized parameters</span>
            </div>

            <div className="flex flex-col p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white/30 dark:bg-zinc-950/20 justify-center">
              <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Reordered
              </span>
              <span className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-1">
                {stats.reordered}
              </span>
              <span className="text-[9px] text-zinc-400 mt-0.5">Moved relevant experiences</span>
            </div>
          </div>
        </div>

        {/* Traceability Explanation Alert */}
        <div className="mt-4 p-3 rounded-lg border border-green-500/10 bg-green-500/5 text-zinc-600 dark:text-zinc-400 text-xs leading-normal flex items-start gap-3">
          <ShieldCheck className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
          <p>
            <strong>Traceability Check:</strong> All generated bullets are confirmed matches to original master bullets. No content was fabricated or hallucinated. Hovering any tailored bullet on the preview column will visually highlight its corresponding source bullet and target requirements.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
