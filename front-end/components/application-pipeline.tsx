"use client";

import React, { useEffect, useState } from "react";
import { BriefcaseBusiness, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APPLICATION_STATUSES, APPLICATION_STORAGE_KEY, type ApplicationStatus, type JobMatching, type TrackedApplication } from "@/components/drafts-dashboard";
import { cn } from "@/lib/utils";

export function ApplicationPipeline({ jobs }: { jobs: JobMatching[] }) {
  const [applications, setApplications] = useState<Record<string, TrackedApplication>>({});
  const [ready, setReady] = useState(false);
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<ApplicationStatus | null>(null);

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(APPLICATION_STORAGE_KEY);
        if (saved) setApplications(JSON.parse(saved) as Record<string, TrackedApplication>);
      } catch {
        window.localStorage.removeItem(APPLICATION_STORAGE_KEY);
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  useEffect(() => {
    if (ready) window.localStorage.setItem(APPLICATION_STORAGE_KEY, JSON.stringify(applications));
  }, [applications, ready]);

  const updateStatus = (jobId: string, status: ApplicationStatus) => {
    setApplications((current) => ({
      ...current,
      [jobId]: {
        jobId,
        status,
        appliedAt: current[jobId]?.appliedAt ?? (status !== "NOT APPLIED" ? new Date().toISOString() : undefined),
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  return (
    <div className="min-w-0 space-y-5 animate-in fade-in duration-300">
      <header>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Job tracker</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">Applications</h1>
        <p className="mt-1 text-sm text-zinc-500">Drag jobs between stages. Confirmed email decisions update this board automatically.</p>
      </header>
      <Card className="min-w-0 max-w-full gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <CardTitle className="flex items-center gap-2 text-base"><BriefcaseBusiness className="h-4 w-4 text-indigo-600" />Application pipeline</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 max-w-full overflow-x-auto p-3">
          <div className="grid w-max grid-cols-[repeat(7,210px)] gap-3">
            {APPLICATION_STATUSES.map((status) => {
              const statusJobs = jobs.filter((job) => (applications[job.id]?.status ?? "NOT APPLIED") === status);
              return (
                <section key={status} onDragOver={(event) => { event.preventDefault(); setDragOverStatus(status); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOverStatus(null); }} onDrop={(event) => { event.preventDefault(); const jobId = event.dataTransfer.getData("text/plain") || draggedJobId; if (jobId) updateStatus(jobId, status); setDraggedJobId(null); setDragOverStatus(null); }} className={cn("flex min-h-[440px] flex-col rounded-xl border bg-zinc-50/70 p-2.5 transition-colors dark:bg-zinc-950/30", dragOverStatus === status ? "border-indigo-400 bg-indigo-50/70 ring-2 ring-indigo-500/10 dark:bg-indigo-950/20" : "border-zinc-200 dark:border-zinc-800")}>
                  <div className="mb-2 flex items-center justify-between gap-2 px-1"><StatusBadge status={status} /><span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-200 px-1.5 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{statusJobs.length}</span></div>
                  <div className="max-h-[560px] space-y-2 overflow-y-auto pr-0.5">
                    {statusJobs.map((job) => <article key={job.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", job.id); setDraggedJobId(job.id); }} onDragEnd={() => { setDraggedJobId(null); setDragOverStatus(null); }} className={cn("cursor-grab rounded-lg border border-zinc-200 bg-white p-3 shadow-sm active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-900", draggedJobId === job.id && "opacity-50")}><div className="flex items-start gap-2"><GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" /><div className="min-w-0"><h3 className="line-clamp-2 text-xs font-semibold leading-relaxed text-zinc-900 dark:text-zinc-100">{job.title}</h3><p className="mt-1 truncate text-[11px] text-zinc-500">{job.company}</p></div></div><div className="mt-2 flex items-center justify-between border-t border-zinc-100 pt-2 dark:border-zinc-800"><span className="truncate text-[10px] text-zinc-400">{job.location}</span><span className="ml-2 shrink-0 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{job.matchScore}%</span></div></article>)}
                    {statusJobs.length === 0 && <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-zinc-200 px-3 text-center text-[11px] text-zinc-400 dark:border-zinc-800">Drop a job here</div>}
                  </div>
                </section>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge className={cn("border px-2 py-0.5 text-[9px] font-bold shadow-none", status === "NOT APPLIED" && "border-zinc-200 bg-zinc-50 text-zinc-500", status === "APPLIED" && "border-blue-200 bg-blue-50 text-blue-700", status === "INTERVIEW" && "border-indigo-200 bg-indigo-50 text-indigo-700", ["OFFER", "ACCEPTED"].includes(status) && "border-emerald-200 bg-emerald-50 text-emerald-700", ["REJECTED", "WITHDRAWN"].includes(status) && "border-rose-200 bg-rose-50 text-rose-700")}>{status}</Badge>;
}
