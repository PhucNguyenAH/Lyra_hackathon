"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, UploadCloud, Edit3, Trash2, MoreHorizontal, CheckCircle2, Calendar, ClipboardCheck, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CVDraft {
  id: string;
  title: string;
  role: string;
  level: string;
  source: string;
  updated: string;
  exported: string;
}

export interface AppliedJob {
  id: string;
  role: string;
  company: string;
  appliedDate: string;
  status: "Applied" | "Assessment" | "Interview" | "Offer" | "Rejected";
}

export interface PrepFeedback {
  id: string;
  role: string;
  date: string;
  score: number;
  strength: string;
  improvements: string;
}

interface DraftsDashboardProps {
  drafts: CVDraft[];
  onSelectDraft: (id: string) => void;
  onImportCV: (name: string, role: string, level: string) => void;
  onDeleteDraft: (id: string) => void;
}

export function DraftsDashboard({
  drafts,
  onSelectDraft,
  onImportCV,
  onDeleteDraft,
}: DraftsDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importName, setImportName] = useState("Kian Nguyen");
  const [importRole, setImportRole] = useState("Backend Engineer");
  const [importLevel, setImportLevel] = useState("Junior (0-2 years)");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Mock Applied Jobs tracking list
  const [appliedJobs, setAppliedJobs] = useState<AppliedJob[]>([
    { id: "app-1", role: "Backend Engineer", company: "InnovateTech Solutions", appliedDate: "2026-07-15", status: "Interview" },
    { id: "app-2", role: "Junior Software Dev", company: "CognitiveAgents Corp", appliedDate: "2026-07-18", status: "Applied" },
    { id: "app-3", role: "Frontend Architect", company: "Vercel Partner Studio", appliedDate: "2026-07-10", status: "Assessment" },
  ]);

  // Mock Interview Prep feedback log
  const [prepLog, setPrepLog] = useState<PrepFeedback[]>([
    {
      id: "prep-1",
      role: "Senior Frontend Architect",
      date: "2026-07-20",
      score: 88,
      strength: "Next.js App Router context and server component boundary concepts.",
      improvements: "Integrate more quantified metrics and exact layout shift (ms) diagnostic values.",
    },
  ]);

  const filteredDrafts = drafts.filter(
    (d) =>
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.level.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onImportCV(importName, importRole, importLevel);
    setShowImportModal(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 via-violet-500 to-indigo-700 bg-clip-text text-transparent dark:from-indigo-400 dark:to-violet-300">
            Athena Overview Hub
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Monitor resume drafts, track active applications, and analyze mock interview scores.
          </p>
        </div>
        <Button
          onClick={() => setShowImportModal(true)}
          className="h-10 rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-500/20 hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
        >
          <UploadCloud className="h-4 w-4" />
          Import PDF Resume
        </Button>
      </div>

      {/* Metrics Row cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md">
          <span className="text-[10px] font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider">Saved Resumes</span>
          <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">{drafts.length}</p>
        </Card>
        <Card className="p-4 border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md">
          <span className="text-[10px] font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider">Applied Jobs</span>
          <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">{appliedJobs.length}</p>
        </Card>
        <Card className="p-4 border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md">
          <span className="text-[10px] font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider">Practice Sessions</span>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{prepLog.length}</p>
        </Card>
        <Card className="p-4 border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md">
          <span className="text-[10px] font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider">Average Prep Score</span>
          <p className="text-2xl font-extrabold text-amber-500 mt-1">88%</p>
        </Card>
      </div>

      {/* Main Grid: Left = Drafts, Right = Applied Tracker */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Drafts table - Left */}
        <Card className="xl:col-span-2 border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md shadow-sm">
          <CardHeader className="pb-3 border-b border-zinc-200/20 dark:border-zinc-800/20">
            <CardTitle className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              RESUME DRAFTS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4 flex items-center justify-between gap-4 border-b border-zinc-200/20 dark:border-zinc-800/20">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-zinc-550" />
                <Input
                  placeholder="Search drafts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs h-9 bg-zinc-100/30 dark:bg-zinc-950/30 border-zinc-200/50 dark:border-zinc-800"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200/20 dark:border-zinc-800/20 text-zinc-400 dark:text-zinc-555">
                    <th className="p-4 font-bold tracking-wider">TITLE</th>
                    <th className="p-4 font-bold tracking-wider">TARGET ROLE</th>
                    <th className="p-4 font-bold tracking-wider">UPDATED</th>
                    <th className="p-4 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrafts.map((draft) => (
                    <tr
                      key={draft.id}
                      className="group border-b border-zinc-200/20 dark:border-zinc-800/20 hover:bg-zinc-150/20 dark:hover:bg-zinc-850/20 cursor-pointer"
                      onClick={() => onSelectDraft(draft.id)}
                    >
                      <td className="p-4 font-semibold text-zinc-800 dark:text-zinc-200">{draft.title}</td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">{draft.role}</span>
                          <span className="text-[10px] text-zinc-450 mt-0.5">{draft.level}</span>
                        </div>
                      </td>
                      <td className="p-4 text-zinc-500">{draft.updated}</td>
                      <td className="p-4 relative" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setActiveMenuId(activeMenuId === draft.id ? null : draft.id)}
                          className="h-8 w-8 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-150 dark:hover:bg-zinc-800"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        {activeMenuId === draft.id && (
                          <div className="absolute right-4 top-12 z-30 w-36 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-1.5 shadow-lg">
                            <button
                              onClick={() => onSelectDraft(draft.id)}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-850"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              Open Editor
                            </button>
                            <button
                              onClick={() => {
                                onDeleteDraft(draft.id);
                                setActiveMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete Draft
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Applied Tracker widget - Right */}
        <Card className="border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md shadow-sm">
          <CardHeader className="pb-3 border-b border-zinc-200/20 dark:border-zinc-800/20">
            <CardTitle className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              JOB APPLICATIONS TRACKER
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {appliedJobs.map((app) => (
              <div key={app.id} className="flex flex-col p-3 rounded-lg border border-zinc-150/60 dark:border-zinc-850 bg-white/30 dark:bg-zinc-950/20 text-xs">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-zinc-800 dark:text-zinc-200 truncate max-w-[140px]">{app.role}</h4>
                    <p className="text-zinc-400 dark:text-zinc-550 text-[10px] mt-0.5">{app.company}</p>
                  </div>
                  <Badge className={cn(
                    "text-[8px] font-extrabold uppercase border-none px-2 py-0.5 text-white",
                    app.status === "Interview" && "bg-amber-500",
                    app.status === "Applied" && "bg-blue-500",
                    app.status === "Assessment" && "bg-purple-500",
                    app.status === "Offer" && "bg-emerald-600"
                  )}>
                    {app.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] text-zinc-450 mt-3 pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-800">
                  <Calendar className="h-3 w-3" />
                  Applied on {app.appliedDate}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Bottom: Interview Prep Feedback Widget */}
      <Card className="border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md shadow-sm">
        <CardHeader className="pb-3 border-b border-zinc-200/20 dark:border-zinc-800/20">
          <CardTitle className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            INTERVIEW PRACTICE PREP FEEDBACK
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {prepLog.map((log) => (
            <div key={log.id} className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-center">
              {/* Score circle */}
              <div className="flex items-center gap-4 border-r border-zinc-200 dark:border-zinc-800/40 pr-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-emerald-500/20 bg-emerald-500/5 text-xl font-black text-emerald-600">
                  {log.score}%
                </div>
                <div>
                  <h4 className="font-bold text-xs text-zinc-800 dark:text-zinc-200">{log.role}</h4>
                  <span className="text-[10px] text-zinc-400 mt-1 block flex items-center gap-1">
                    <Calendar className="h-3 w-3 inline" />
                    Last session: {log.date}
                  </span>
                </div>
              </div>

              {/* Feedback Points */}
              <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed">
                <div className="space-y-1 p-3 rounded-lg border border-green-500/10 bg-green-500/5 text-zinc-700 dark:text-zinc-300">
                  <h5 className="font-bold text-green-700 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Core Strength
                  </h5>
                  <p className="text-[11px]">{log.strength}</p>
                </div>
                <div className="space-y-1 p-3 rounded-lg border border-amber-500/10 bg-amber-500/5 text-zinc-700 dark:text-zinc-300">
                  <h5 className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <ClipboardCheck className="h-4 w-4" /> Suggested Improvements
                  </h5>
                  <p className="text-[11px]">{log.improvements}</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Mock Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="w-full max-w-md border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl rounded-2xl overflow-hidden p-6 text-xs">
            <h3 className="text-sm font-bold text-zinc-400 dark:text-zinc-550 uppercase tracking-wider mb-2">Import Resume File</h3>
            <p className="text-zinc-500 mb-6">Import experience details from a PDF file.</p>
            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="font-semibold text-zinc-650 dark:text-zinc-400">Full Name</label>
                <Input value={importName} onChange={(e) => setImportName(e.target.value)} className="h-9 text-xs" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-zinc-650 dark:text-zinc-400">Role Target</label>
                  <Input value={importRole} onChange={(e) => setImportRole(e.target.value)} className="h-9 text-xs" required />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-zinc-650 dark:text-zinc-400">Level Target</label>
                  <Input value={importLevel} onChange={(e) => setImportLevel(e.target.value)} className="h-9 text-xs" required />
                </div>
              </div>
              <div className="pt-4 border-t border-zinc-150 dark:border-zinc-800 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setShowImportModal(false)} className="h-9 text-xs">Cancel</Button>
                <Button type="submit" className="h-9 text-xs bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700">Confirm & Import</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
