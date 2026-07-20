"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Heart, Briefcase, MapPin, Sparkles, AlertCircle, HelpCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface JobPosting {
  id: string;
  title: string;
  company: string;
  location: string;
  matchScore: number;
  skillsRequired: string[];
  skillsMatched: string[];
}

interface JobsDashboardProps {
  jobs: JobPosting[];
  onTailorCV: (jobId: string) => void;
}

export function JobsDashboard({ jobs, onTailorCV }: JobsDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [savedJobs, setSavedJobs] = useState<string[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const toggleSaveJob = (id: string) => {
    setSavedJobs((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filteredJobs = jobs.filter(
    (job) =>
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Target Jobs & Match Analyzer
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Explore job openings classified by how closely they match your current resume draft experience.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-zinc-550" />
          <Input
            placeholder="Search roles or companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs h-9 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredJobs.map((job) => {
          const isSaved = savedJobs.includes(job.id);
          const isExpanded = expandedJobId === job.id;
          return (
            <Card
              key={job.id}
              className={cn(
                "border-zinc-200/60 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md shadow-sm transition-all duration-300 flex flex-col justify-between hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700",
                isExpanded && "md:col-span-2"
              )}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 flex-shrink-0">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                        {job.title}
                      </CardTitle>
                      <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2 mt-1">
                        <span>{job.company}</span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <MapPin className="h-3 w-3 inline text-zinc-400" />
                          {job.location}
                        </span>
                      </CardDescription>
                    </div>
                  </div>

                  {/* Match Percentage Badge */}
                  <div className="text-right">
                    <Badge
                      className={cn(
                        "font-extrabold text-xs px-2.5 py-1 text-white border-none shadow-sm",
                        job.matchScore >= 80
                          ? "bg-emerald-600 hover:bg-emerald-600 shadow-emerald-500/10"
                          : job.matchScore >= 50
                          ? "bg-amber-500 hover:bg-amber-500 shadow-amber-500/10"
                          : "bg-red-500 hover:bg-red-500 shadow-red-500/10"
                      )}
                    >
                      {job.matchScore}% Match
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-450 dark:text-zinc-500 font-semibold">Skills Analysis</span>
                    <button
                      onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold text-[11px]"
                    >
                      {isExpanded ? "Collapse Details" : "Show Skills Breakdown"}
                    </button>
                  </div>

                  {/* Expanded Skills list */}
                  {isExpanded ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg border border-zinc-200/10 bg-zinc-100/30 dark:bg-zinc-950/20 text-[11px] animate-in fade-in duration-200">
                      <div className="space-y-1.5">
                        <h4 className="font-bold text-green-600 dark:text-green-400 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Matched Competencies ({job.skillsMatched.length})
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {job.skillsMatched.map((s) => (
                            <Badge key={s} variant="secondary" className="text-[9px] bg-green-500/5 text-green-700 dark:text-green-400 border border-green-500/15 font-semibold">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="font-bold text-red-500 flex items-center gap-1.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Missed Gaps ({job.skillsRequired.filter((s) => !job.skillsMatched.includes(s)).length})
                        </h4>
                        <div className="flex flex-wrap gap-1">
                          {job.skillsRequired
                            .filter((s) => !job.skillsMatched.includes(s))
                            .map((s) => (
                              <Badge key={s} variant="secondary" className="text-[9px] bg-red-500/5 text-red-700 dark:text-red-400 border border-red-500/15 font-semibold">
                                {s}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 max-h-12 overflow-hidden">
                      {job.skillsRequired.map((skill) => {
                        const isMatched = job.skillsMatched.includes(skill);
                        return (
                          <span
                            key={skill}
                            className={cn(
                              "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold border",
                              isMatched
                                ? "bg-green-500/5 text-green-700 dark:text-green-400 border-green-500/10"
                                : "bg-red-500/5 text-red-700 dark:text-red-400 border-red-500/10"
                            )}
                          >
                            {skill}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>

              <CardFooter className="pt-3 border-t border-zinc-200/20 dark:border-zinc-800/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => toggleSaveJob(job.id)}
                    className={cn(
                      "h-9 w-9 rounded-lg border-zinc-200 dark:border-zinc-850 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                      isSaved && "text-red-500 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 dark:hover:bg-red-500/10"
                    )}
                    title={isSaved ? "Saved" : "Save Job"}
                  >
                    <Heart className={cn("h-4 w-4", isSaved && "fill-red-500 text-red-500")} />
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => alert(`Simulating Application request for job ${job.title}...`)}
                    className="h-9 px-3 border-zinc-200 dark:border-zinc-850 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 text-xs font-semibold text-zinc-700 dark:text-zinc-300"
                  >
                    Apply Now
                  </Button>
                </div>

                <Button
                  onClick={() => onTailorCV(job.id)}
                  className="h-9 px-3 rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-500/15 hover:bg-indigo-700 flex items-center gap-1"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-300 fill-amber-300" />
                  Tailor CV for Job
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
