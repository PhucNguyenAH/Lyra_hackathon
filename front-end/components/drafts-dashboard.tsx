"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BellRing,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  Clock3,
  ExternalLink,
  FileSearch,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Search,
  Sparkles,
  UploadCloud,
  LoaderCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface CVDraft {
  id: string;
  title: string;
  role: string;
  level: string;
  source: string;
  updated: string;
  exported: string;
  matchScore?: number;
  targetCompany?: string;
  matchedSkills?: string[];
  missingSkills?: string[];
  matchSuggestions?: { id: string; title: string; detail: string; scoreBoost: number; action: "summary" | "skills" | "experience" }[];
  sourcePdfUrl?: string;
  isEnhancementSource?: boolean;
}

export interface JobMatching {
  id: string;
  title: string;
  company: string;
  location: string;
  matchScore: number;
  skillsRequired: string[];
  skillsMatched: string[];
}

type EmailDecision = {
  id: string;
  company: string;
  role: string;
  subject: string;
  body: string;
  question: string;
  received: string;
  detectedStatus: "Interview" | "Offer" | "Rejected" | "Update";
  confidence: number;
  state: "pending" | "confirmed" | "dismissed";
};

export const APPLICATION_STATUSES = ["NOT APPLIED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED", "ACCEPTED", "WITHDRAWN"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type TrackedApplication = {
  jobId: string;
  status: ApplicationStatus;
  appliedAt?: string;
  updatedAt: string;
};

type EmailNotificationResponse = {
  id: string;
  company: string;
  role: string;
  subject: string;
  body: string;
  received_at: string | null;
  intent: "interview_invite" | "rejection" | "offer" | "ack" | "unrelated";
  confidence: number;
  question: string;
};

interface DraftsDashboardProps {
  jobs: JobMatching[];
  drafts: CVDraft[];
  onTailorCV: (jobId: string, source: { draftId?: string; file?: File }) => void;
}

const EMAIL_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8008").replace(/\/$/, "");
const EMAIL_POLL_INTERVAL_MS = 15_000;
export const APPLICATION_STORAGE_KEY = "athena-job-applications-v1";

export function DraftsDashboard({ jobs, drafts, onTailorCV }: DraftsDashboardProps) {
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [emailDecisions, setEmailDecisions] = useState<EmailDecision[]>([]);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailActionId, setEmailActionId] = useState<string | null>(null);
  const [reviewEmailId, setReviewEmailId] = useState<string | null>(null);
  const [setupMode, setSetupMode] = useState<"pdf" | "manual">("pdf");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<"idle" | "extracting" | "ready">("idle");
  const [tailorJobId, setTailorJobId] = useState<string | null>(null);
  const [sourceDraftId, setSourceDraftId] = useState(drafts[0]?.id ?? "");
  const [tailorUploadName, setTailorUploadName] = useState<string | null>(null);
  const [tailorUploadFile, setTailorUploadFile] = useState<File | null>(null);
  const [applications, setApplications] = useState<Record<string, TrackedApplication>>({});
  const [applicationFilter, setApplicationFilter] = useState<ApplicationStatus | "ALL">("ALL");
  const [applicationsReady, setApplicationsReady] = useState(false);
  const [profile, setProfile] = useState({
    name: "Kian Nguyen",
    email: "kiannguyen.works@gmail.com",
    location: "Sydney, NSW",
    targetRoles: "Backend Engineer, AI Engineer, Full Stack Developer",
    skills: "Java, Spring Boot, Python, FastAPI, React, Next.js, PostgreSQL, AWS, Docker",
    preferredLocation: "Sydney, NSW",
    workMode: "Hybrid or remote",
    seniority: "Graduate and junior roles",
  });

  const filteredJobs = useMemo(() => {
    const query = jobSearch.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesQuery = !query || [job.title, job.company, job.location, ...job.skillsRequired].join(" ").toLowerCase().includes(query);
      const status = applications[job.id]?.status ?? "NOT APPLIED";
      return matchesQuery && (applicationFilter === "ALL" || status === applicationFilter);
    });
  }, [applicationFilter, applications, jobSearch, jobs]);

  const pendingCount = emailDecisions.filter((decision) => decision.state === "pending").length;
  const tailorJob = jobs.find((job) => job.id === tailorJobId);
  const trackedCount = Object.values(applications).filter((application) => application.status !== "NOT APPLIED").length;
  const updateProfile = (field: keyof typeof profile, value: string) => setProfile((current) => ({ ...current, [field]: value }));
  const updateDecision = async (id: string, state: "confirmed" | "dismissed") => {
    setEmailActionId(id);
    setEmailError(null);
    try {
      const action = state === "confirmed" ? "confirm" : "dismiss";
      const response = await fetch(`${EMAIL_API_URL}/email-services/needs-attention/${id}/${action}`, { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not update this email decision");
      }
      setEmailDecisions((current) => current.map((decision) => decision.id === id ? { ...decision, state } : decision));
      if (state === "confirmed") {
        const decision = emailDecisions.find((item) => item.id === id);
        const targetStatus = decision ? decisionStatus(decision.detectedStatus) : null;
        const matchingJob = decision ? findMatchingJob(jobs, decision.company, decision.role) : undefined;
        if (matchingJob && targetStatus) updateApplicationStatus(matchingJob.id, targetStatus);
      }
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : "Could not update this email decision");
    } finally {
      setEmailActionId(null);
    }
  };

  const updateApplicationStatus = (jobId: string, status: ApplicationStatus) => {
    setApplications((current) => {
      const previous = current[jobId];
      return {
        ...current,
        [jobId]: {
          jobId,
          status,
          appliedAt: previous?.appliedAt ?? (status === "APPLIED" ? new Date().toISOString() : undefined),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  useEffect(() => {
    const loadSavedApplications = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(APPLICATION_STORAGE_KEY);
        if (saved) setApplications(JSON.parse(saved) as Record<string, TrackedApplication>);
      } catch {
        window.localStorage.removeItem(APPLICATION_STORAGE_KEY);
      } finally {
        setApplicationsReady(true);
      }
    }, 0);
    return () => window.clearTimeout(loadSavedApplications);
  }, []);

  useEffect(() => {
    if (applicationsReady) window.localStorage.setItem(APPLICATION_STORAGE_KEY, JSON.stringify(applications));
  }, [applications, applicationsReady]);

  useEffect(() => {
    let active = true;
    const loadNotifications = async () => {
      try {
        const response = await fetch(`${EMAIL_API_URL}/email-services/notifications`, { cache: "no-store" });
        if (!response.ok) throw new Error("Email notifications are temporarily unavailable");
        const notifications = await response.json() as EmailNotificationResponse[];
        if (!active) return;
        setEmailDecisions(notifications.map((notification) => ({
          id: notification.id,
          company: notification.company,
          role: notification.role,
          subject: notification.subject,
          body: notification.body,
          question: notification.question,
          received: formatReceivedAt(notification.received_at),
          detectedStatus: intentStatus(notification.intent),
          confidence: Math.round(notification.confidence * 100),
          state: "pending",
        })));
        setEmailError(null);
      } catch (error) {
        if (active) setEmailError(error instanceof Error ? error.message : "Email notifications are temporarily unavailable");
      } finally {
        if (active) setEmailLoading(false);
      }
    };
    void loadNotifications();
    const poll = window.setInterval(() => void loadNotifications(), EMAIL_POLL_INTERVAL_MS);
    return () => { active = false; window.clearInterval(poll); };
  }, []);
  const handleCVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    setImportStatus("extracting");
    setProfileSaved(false);
    window.setTimeout(() => setImportStatus("ready"), 900);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800">
        <div className="pt-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Job search workspace</p>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">Good morning, {profile.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-zinc-500">Set your details once, then review matches and decisions as they arrive.</p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-80 sm:items-end">
          <div className="flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <BellRing className="h-3.5 w-3.5" />
            {pendingCount} email {pendingCount === 1 ? "decision" : "decisions"} to review
          </div>
          <Card className="w-full gap-0 border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"><CircleUserRound className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><h2 className="text-xs font-semibold text-zinc-950 dark:text-zinc-50">Job profile</h2>{profileSaved ? <Badge className="border-0 bg-emerald-50 px-1.5 text-[9px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">Ready</Badge> : <Badge variant="secondary" className="px-1.5 text-[9px]">Needs review</Badge>}</div>
                <p className="mt-0.5 truncate text-[10px] text-zinc-500">{profile.targetRoles}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setProfileDialogOpen(true)} className="h-8 shrink-0 px-2.5 text-[10px]"><Pencil className="mr-1 h-3 w-3" />{profileSaved ? "Edit" : "Complete"}</Button>
            </div>
          </Card>
        </div>
      </header>

      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="flex h-[min(90dvh,820px)] max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-zinc-100 px-6 py-5 pr-12 dark:border-zinc-800">
            <DialogTitle>Job-search profile</DialogTitle>
            <DialogDescription>Import your CV details, review the extracted fields, and tell us what work you want.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 touch-pan-y">
            <section>
              <div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">1</span><div><h3 className="text-sm font-semibold">Add your CV details</h3><p className="text-xs text-zinc-500">Import a PDF or enter the core fields yourself.</p></div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setSetupMode("pdf")} className={cn("rounded-xl border p-4 text-left transition-colors", setupMode === "pdf" ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/10 dark:bg-indigo-950/20" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800")}>
                  <span className="flex items-center gap-2 text-sm font-semibold"><UploadCloud className="h-4 w-4 text-indigo-600" />Extract from PDF CV</span><span className="mt-1 block text-xs leading-relaxed text-zinc-500">We pull out your name, email, location, roles, skills, education, and experience.</span>
                </button>
                <button type="button" onClick={() => setSetupMode("manual")} className={cn("rounded-xl border p-4 text-left transition-colors", setupMode === "manual" ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/10 dark:bg-indigo-950/20" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800")}>
                  <span className="flex items-center gap-2 text-sm font-semibold"><Pencil className="h-4 w-4 text-indigo-600" />Enter details manually</span><span className="mt-1 block text-xs leading-relaxed text-zinc-500">Start with the essentials now. You can add education and experience later.</span>
                </button>
              </div>

              {setupMode === "pdf" && (
                <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-center dark:border-zinc-700 dark:bg-zinc-950/30">
                  <input id="profile-cv-upload" type="file" accept="application/pdf,.pdf" onChange={handleCVUpload} className="sr-only" />
                  {importStatus === "extracting" ? <><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-indigo-600" /><p className="mt-2 text-sm font-semibold">Extracting core fields…</p><p className="mt-1 text-xs text-zinc-500">{uploadedFileName}</p></> : importStatus === "ready" ? <><span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-4 w-4" /></span><p className="mt-2 text-sm font-semibold">CV fields extracted</p><p className="mt-1 text-xs text-zinc-500">Review the details below before saving.</p><label htmlFor="profile-cv-upload" className="mt-3 inline-block cursor-pointer text-xs font-semibold text-indigo-600 hover:underline">Choose a different PDF</label></> : <><UploadCloud className="mx-auto h-6 w-6 text-zinc-400" /><p className="mt-2 text-sm font-semibold">Upload your current CV</p><p className="mt-1 text-xs text-zinc-500">PDF only · Your extracted fields remain editable</p><label htmlFor="profile-cv-upload" className="mt-3 inline-flex h-9 cursor-pointer items-center rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700">Choose PDF</label></>}
                </div>
              )}
            </section>

            <section className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
              <div className="mb-4 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">2</span><div><h3 className="text-sm font-semibold">Review core fields</h3><p className="text-xs text-zinc-500">These fields power your job matches and CV drafts.</p></div></div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <ProfileField label="Full name" value={profile.name} onChange={(value) => updateProfile("name", value)} />
              <ProfileField label="Email for notifications" value={profile.email} onChange={(value) => updateProfile("email", value)} />
              <ProfileField label="Location" value={profile.location} onChange={(value) => updateProfile("location", value)} />
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Skills and keywords</label>
                <Textarea value={profile.skills} onChange={(event) => updateProfile("skills", event.target.value)} className="min-h-20 resize-y text-sm" />
              </div>
            </div>
            </section>

            <section className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
              <div className="mb-4 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">3</span><div><h3 className="text-sm font-semibold">Tell us your preferences</h3><p className="text-xs text-zinc-500">This is asked separately because it normally cannot be inferred from a CV.</p></div></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ProfileField label="Preferred roles" value={profile.targetRoles} onChange={(value) => updateProfile("targetRoles", value)} className="sm:col-span-2" />
                <ProfileField label="Preferred location" value={profile.preferredLocation} onChange={(value) => updateProfile("preferredLocation", value)} />
                <ProfileField label="Work mode" value={profile.workMode} onChange={(value) => updateProfile("workMode", value)} />
                <ProfileField label="Seniority" value={profile.seniority} onChange={(value) => updateProfile("seniority", value)} />
              </div>
            </section>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-zinc-100 pt-5 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Complete details produce better matches. You can add more later.</p>
              <Button onClick={() => { setProfileSaved(true); setProfileDialogOpen(false); }} className="bg-indigo-600 text-white hover:bg-indigo-700"><Check className="mr-1.5 h-4 w-4" />Save profile</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(tailorJobId)} onOpenChange={(open) => { if (!open) setTailorJobId(null); }}>
        <DialogContent className="p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-zinc-100 px-6 py-5 pr-12 dark:border-zinc-800">
            <DialogTitle>Choose a CV to enhance</DialogTitle>
            <DialogDescription>{tailorJob ? `${tailorJob.title} at ${tailorJob.company}` : "Select the CV Athena should tailor."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 px-6 pb-6">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">From your workspace</h3>
              <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
                {drafts.map((draft) => (
                  <button key={draft.id} type="button" onClick={() => { setSourceDraftId(draft.id); setTailorUploadName(null); setTailorUploadFile(null); }} className={cn("flex w-full items-center gap-3 rounded-xl border p-3 text-left", sourceDraftId === draft.id && !tailorUploadName ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/20" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800")}>
                    <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{draft.title}</span><span className="block truncate text-xs text-zinc-500">{draft.source} · {draft.role} · {draft.matchScore ? `${draft.matchScore}% match` : "Not scored"}</span></span>
                    {sourceDraftId === draft.id && !tailorUploadName && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
                  </button>
                ))}
                {drafts.length === 0 && <p className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-zinc-900">No saved CVs yet. Upload one below.</p>}
              </div>
            </div>

            <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-zinc-200 dark:border-zinc-800" /></div><div className="relative flex justify-center"><span className="bg-white px-2 text-[10px] font-semibold uppercase text-zinc-400 dark:bg-zinc-950">or</span></div></div>

            <div>
              <input id="job-tailor-cv-upload" type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setTailorUploadName(file.name); setTailorUploadFile(file); setSourceDraftId(""); } }} />
              <label htmlFor="job-tailor-cv-upload" className={cn("flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 transition-colors hover:border-indigo-400", tailorUploadName ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/20" : "border-zinc-300 dark:border-zinc-700")}>
                <UploadCloud className="h-5 w-5 shrink-0 text-indigo-600" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{tailorUploadName || "Upload a different PDF CV"}</span><span className="block text-xs text-zinc-500">Athena will extract it, compare it with this job, and suggest improvements.</span></span>
                {tailorUploadName && <Check className="h-4 w-4 shrink-0 text-indigo-600" />}
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Your original CV stays unchanged. A new tailored draft is created.</p>
              <Button disabled={!sourceDraftId && !tailorUploadFile} onClick={() => { if (!tailorJobId) return; onTailorCV(tailorJobId, tailorUploadFile ? { file: tailorUploadFile } : { draftId: sourceDraftId }); setTailorJobId(null); }} className="shrink-0 bg-indigo-600 text-white hover:bg-indigo-700"><Sparkles className="mr-1.5 h-4 w-4" />Open enhancement workspace</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mb-6 grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]">
        <Card className="mb-6 min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
          <CardHeader className="!flex !flex-row items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 text-base"><BriefcaseBusiness className="h-4 w-4 shrink-0 text-indigo-600" /><span className="hidden sm:inline">Live job matches</span></CardTitle>
              <p className="mt-1 hidden truncate text-xs text-zinc-500 sm:block">{jobs.length} current roles · {trackedCount} in your application tracker</p>
            </div>
            <div className="ml-auto flex shrink-0 items-center justify-end gap-2"><select aria-label="Filter jobs by application status" value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value as ApplicationStatus | "ALL")} className="h-9 w-24 shrink-0 rounded-md border border-zinc-200 bg-white px-2 text-xs sm:w-32 dark:border-zinc-800 dark:bg-zinc-950"><option value="ALL">All statuses</option>{APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select><div className="relative w-[clamp(8rem,20vw,14rem)] shrink-0"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><Input value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} placeholder="Search jobs or skills" className="h-9 min-w-0 pl-9 text-sm" /></div></div>
          </CardHeader>
          <CardContent className="h-[calc(100dvh-20rem)] max-h-[648px] min-w-0 space-y-2 overflow-y-auto overscroll-contain px-3 pb-6 pt-3">
            {filteredJobs.map((job) => {
              const expanded = expandedJobId === job.id;
              const gaps = job.skillsRequired.filter((skill) => !job.skillsMatched.includes(skill));
              const applicationStatus = applications[job.id]?.status ?? "NOT APPLIED";
              return (
                <article key={job.id} className="rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-indigo-200 dark:border-zinc-800 dark:bg-zinc-950/30">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"><Building2 className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">{job.title}</h3><p className="mt-0.5 truncate text-xs text-zinc-500">{job.company}</p><p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400"><MapPin className="h-3 w-3" />{job.location}</p></div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5"><MatchBadge score={job.matchScore} /><ApplicationStatusBadge status={applicationStatus} /></div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <button type="button" onClick={() => setExpandedJobId(expanded ? null : job.id)} className="flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-indigo-600 dark:text-zinc-400">{expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{expanded ? "Hide match details" : `${job.skillsMatched.length} skills matched`}</button>
                    <div className="flex flex-wrap items-center gap-2">{applicationStatus === "NOT APPLIED" ? <Button size="sm" onClick={() => updateApplicationStatus(job.id, "APPLIED")} className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Apply</Button> : <select aria-label={`Update ${job.title} application status`} value={applicationStatus} onChange={(event) => updateApplicationStatus(job.id, event.target.value as ApplicationStatus)} className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-[11px] font-semibold dark:border-zinc-800 dark:bg-zinc-950">{APPLICATION_STATUSES.filter((status) => status !== "NOT APPLIED").map((status) => <option key={status} value={status}>{status}</option>)}</select>}<Button size="sm" variant="outline" onClick={() => { setTailorJobId(job.id); setSourceDraftId(drafts[0]?.id ?? ""); setTailorUploadName(null); setTailorUploadFile(null); }} className="h-8 text-xs"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Enhance CV</Button></div>
                  </div>
                  {expanded && <div className="mt-3 grid gap-3 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-900 sm:grid-cols-2"><div><p className="font-semibold text-emerald-700 dark:text-emerald-400">Matched</p><p className="mt-1 leading-relaxed text-zinc-500">{job.skillsMatched.join(", ")}</p></div><div><p className="font-semibold text-amber-700 dark:text-amber-400">Gaps to review</p><p className="mt-1 leading-relaxed text-zinc-500">{gaps.join(", ") || "No major gaps detected"}</p></div></div>}
                </article>
              );
            })}
          </CardContent>
        </Card>

        <Card className="h-fit gap-0 overflow-hidden py-0 shadow-sm">
          <CardHeader className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-800"><CardTitle className="flex items-center justify-between text-base"><span className="flex items-center gap-2"><Mail className="h-4 w-4 text-indigo-600" />Email decisions</span><Badge variant="secondary">{pendingCount} pending</Badge></CardTitle><p className="mt-1 text-xs text-zinc-500">Uncertain inbox updates wait here for your decision.</p></CardHeader>
          <CardContent className="space-y-3 p-3">
            {emailLoading && <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-500"><LoaderCircle className="h-4 w-4 animate-spin" />Checking your inbox decisions…</div>}
            {!emailLoading && emailError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-400">{emailError}</div>}
            {!emailLoading && !emailError && emailDecisions.length === 0 && <div className="py-8 text-center"><Check className="mx-auto h-5 w-5 text-emerald-600" /><p className="mt-2 text-sm font-semibold">No decisions waiting</p><p className="mt-1 text-xs text-zinc-500">New uncertain application emails will appear here.</p></div>}
            {emailDecisions.filter((decision) => decision.state !== "dismissed").map((decision) => (
              <article key={decision.id} className={cn("rounded-xl border p-4", decision.state === "confirmed" ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-zinc-200 dark:border-zinc-800")}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{decision.company}</p><p className="truncate text-xs text-zinc-500">{decision.role}</p></div><StatusBadge status={decision.detectedStatus} /></div>
                <p className="mt-3 text-xs font-medium text-zinc-700 dark:text-zinc-300">“{decision.subject}”</p>
                <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400"><Clock3 className="h-3 w-3" />{decision.received} · {decision.confidence}% detection confidence</p>
                {reviewEmailId === decision.id && <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"><p className="font-semibold text-zinc-900 dark:text-zinc-100">Why this needs review</p><p className="mt-1">{decision.question}</p><p className="mt-3 font-semibold text-zinc-900 dark:text-zinc-100">Email preview</p><p className="mt-1 whitespace-pre-wrap">{decision.body || "No email body was stored."}</p></div>}
                {decision.state === "pending" ? <div className="mt-3 grid grid-cols-3 gap-2"><Button size="sm" disabled={emailActionId === decision.id} onClick={() => void updateDecision(decision.id, "confirmed")} className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700">{emailActionId === decision.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" />Confirm</>}</Button><Button size="sm" variant="outline" onClick={() => setReviewEmailId((current) => current === decision.id ? null : decision.id)} className="h-8 text-xs"><FileSearch className="mr-1 h-3.5 w-3.5" />Review</Button><Button size="sm" variant="ghost" disabled={emailActionId === decision.id} onClick={() => void updateDecision(decision.id, "dismissed")} className="h-8 text-xs text-zinc-500"><X className="mr-1 h-3.5 w-3.5" />Dismiss</Button></div> : <div className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"><Check className="h-3.5 w-3.5" />Application updated</div>}
              </article>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProfileField({ label, value, onChange, className }: { label: string; value: string; onChange: (value: string) => void; className?: string }) {
  return <div className={className}><label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</label><Input value={value} onChange={(event) => onChange(event.target.value)} className="h-11 text-sm" /></div>;
}

function MatchBadge({ score }: { score: number }) {
  return <Badge className={cn("shrink-0 border px-2 py-1 text-[10px] font-bold shadow-none", score >= 85 ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400" : score >= 70 ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-400" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400")}>{score}% match</Badge>;
}

function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge className={cn("border px-2 py-0.5 text-[9px] font-bold shadow-none", status === "NOT APPLIED" && "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900", status === "APPLIED" && "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-400", status === "INTERVIEW" && "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-400", ["OFFER", "ACCEPTED"].includes(status) && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400", ["REJECTED", "WITHDRAWN"].includes(status) && "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400")}>{status}</Badge>;
}

function decisionStatus(status: EmailDecision["detectedStatus"]): ApplicationStatus | null {
  if (status === "Interview") return "INTERVIEW";
  if (status === "Offer") return "OFFER";
  if (status === "Rejected") return "REJECTED";
  return null;
}

function findMatchingJob(jobs: JobMatching[], company: string, role: string): JobMatching | undefined {
  const normalizedCompany = company.trim().toLowerCase();
  const normalizedRole = role.trim().toLowerCase();
  return jobs.find((job) => job.company.trim().toLowerCase() === normalizedCompany && job.title.trim().toLowerCase() === normalizedRole)
    ?? jobs.find((job) => job.company.toLowerCase().includes(normalizedCompany) || normalizedCompany.includes(job.company.toLowerCase()));
}

function intentStatus(intent: EmailNotificationResponse["intent"]): EmailDecision["detectedStatus"] {
  if (intent === "interview_invite") return "Interview";
  if (intent === "offer") return "Offer";
  if (intent === "rejection") return "Rejected";
  return "Update";
}

function formatReceivedAt(receivedAt: string | null): string {
  if (!receivedAt) return "Recently";
  const received = new Date(receivedAt);
  if (Number.isNaN(received.getTime())) return "Recently";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - received.getTime()) / 60_000));
  if (elapsedMinutes < 1) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} hr ago`;
  return received.toLocaleDateString();
}

function StatusBadge({ status }: { status: EmailDecision["detectedStatus"] }) {
  return <Badge className={cn("shrink-0 border px-2 py-0.5 text-[9px] shadow-none", status === "Interview" && "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-400", status === "Offer" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400", status === "Rejected" && "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400", status === "Update" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400")}>{status}</Badge>;
}
