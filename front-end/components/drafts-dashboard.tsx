"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type CandidatePreferences,
  type MasterProfile,
  ProfileApiError,
  type ProfileRecord,
  getProfile,
  updateMasterProfile,
  updatePreferences,
  uploadCV,
} from "@/lib/profile-api";
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
  Mail,
  MapPin,
  Pencil,
  Plus,
  Search,
  Sparkles,
  UploadCloud,
  LoaderCircle,
  Trash2,
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
  description?: string;
  url?: string;
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

type ApplicationResponse = {
  job_id: string;
  status: "not_applied" | "applied" | "interview" | "offer" | "rejected" | "accepted" | "withdrawn";
  applied_at: string | null;
  last_activity_at: string;
};

interface DraftsDashboardProps {
  jobs: JobMatching[];
  onTailorCV: (jobId: string) => void;
}

const EMAIL_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8008").replace(/\/$/, "");
const EMAIL_POLL_INTERVAL_MS = 15_000;
const PROFILE_USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "";
const EMPTY_PROFILE_PREFERENCES: CandidatePreferences = {
  display_name: "",
  email: "",
  current_title: "",
  current_location: "",
  target_titles: [],
  preferred_locations: [],
  work_modes: [],
  employment_types: [],
  willing_to_relocate: false,
  work_authorization: "",
  salary_expectation: "",
};
export function DraftsDashboard({ jobs, onTailorCV }: DraftsDashboardProps) {
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileRecord, setProfileRecord] = useState<ProfileRecord | null>(null);
  const [profileForm, setProfileForm] = useState<CandidatePreferences>(EMPTY_PROFILE_PREFERENCES);
  const [masterForm, setMasterForm] = useState<MasterProfile | null>(null);
  const [masterDirty, setMasterDirty] = useState(false);
  const [setupMode, setSetupMode] = useState<"pdf" | "manual">("pdf");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<"idle" | "extracting" | "ready">("idle");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(
    PROFILE_USER_ID ? null : "Set NEXT_PUBLIC_DEMO_USER_ID to use the saved profile.",
  );
  const [jobSearch, setJobSearch] = useState("");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [emailDecisions, setEmailDecisions] = useState<EmailDecision[]>([]);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailActionId, setEmailActionId] = useState<string | null>(null);
  const [reviewEmailId, setReviewEmailId] = useState<string | null>(null);
  const [applications, setApplications] = useState<Record<string, TrackedApplication>>({});
  const [applicationFilter, setApplicationFilter] = useState<ApplicationStatus | "ALL">("ALL");
  const filteredJobs = useMemo(() => {
    const query = jobSearch.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesQuery = !query || [job.title, job.company, job.location, ...job.skillsRequired].join(" ").toLowerCase().includes(query);
      const status = applications[job.id]?.status ?? "NOT APPLIED";
      return matchesQuery && (applicationFilter === "ALL" || status === applicationFilter);
    });
  }, [applicationFilter, applications, jobSearch, jobs]);

  const pendingCount = emailDecisions.filter((decision) => decision.state === "pending").length;
  const trackedCount = Object.values(applications).filter((application) => application.status !== "NOT APPLIED").length;
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
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : "Could not update this email decision");
    } finally {
      setEmailActionId(null);
    }
  };

  const updateApplicationStatus = async (jobId: string, status: ApplicationStatus) => {
    const response = await fetch(`${EMAIL_API_URL}/email-services/applications/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status.toLowerCase().replaceAll(" ", "_") }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { detail?: string } | null;
      setEmailError(payload?.detail || "Could not update application status");
      return;
    }
    const saved = await response.json() as ApplicationResponse;
    setApplications((current) => ({
      ...current,
      [saved.job_id]: {
        jobId: saved.job_id,
        status: saved.status.replaceAll("_", " ").toUpperCase() as ApplicationStatus,
        appliedAt: saved.applied_at ?? undefined,
        updatedAt: saved.last_activity_at,
      },
    }));
  };

  useEffect(() => {
    if (!PROFILE_USER_ID) return;
    let active = true;
    void getProfile(PROFILE_USER_ID)
      .then((savedProfile) => {
        if (!active) return;
        setProfileRecord(savedProfile);
        setProfileForm(savedProfile.preferences);
        setMasterForm(savedProfile.master);
        setMasterDirty(false);
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof ProfileApiError && error.status === 404)) return;
        setProfileError(error instanceof Error ? error.message : "Could not load your profile.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadApplications = async () => {
      try {
        const response = await fetch(`${EMAIL_API_URL}/email-services/applications`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load application statuses");
        const rows = await response.json() as ApplicationResponse[];
        if (!active) return;
        setApplications(Object.fromEntries(rows.map((row) => [
          row.job_id,
          {
            jobId: row.job_id,
            status: row.status.replaceAll("_", " ").toUpperCase() as ApplicationStatus,
            appliedAt: row.applied_at ?? undefined,
            updatedAt: row.last_activity_at,
          },
        ])));
      } catch (error) {
        if (active) setEmailError(error instanceof Error ? error.message : "Could not load application statuses");
      }
    };
    void loadApplications();
    const poll = window.setInterval(() => void loadApplications(), EMAIL_POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, []);

  const handleProfileCVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !PROFILE_USER_ID) return;
    setUploadedFileName(file.name);
    setImportStatus("extracting");
    setProfileError(null);
    try {
      const savedProfile = await uploadCV(
        PROFILE_USER_ID,
        file,
        file.name.replace(/\.[^.]+$/, ""),
      );
      setProfileRecord(savedProfile);
      setProfileForm(savedProfile.preferences);
      setMasterForm(savedProfile.master);
      setMasterDirty(false);
      setImportStatus("ready");
    } catch (error) {
      setImportStatus("idle");
      setProfileError(error instanceof Error ? error.message : "Could not process this CV.");
    }
  };

  const saveJobProfile = async () => {
    if (!PROFILE_USER_ID) return;
    if (!profileRecord) {
      setProfileError("Upload a CV first so Athena can create your master profile.");
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    try {
      const masterSavedProfile = masterForm && masterDirty
        ? await updateMasterProfile(PROFILE_USER_ID, masterForm)
        : profileRecord;
      const savedProfile = await updatePreferences(PROFILE_USER_ID, {
        ...profileForm,
        target_titles: cleanList(profileForm.target_titles),
        preferred_locations: cleanList(profileForm.preferred_locations),
      });
      setProfileRecord(savedProfile);
      setProfileForm(savedProfile.preferences);
      setMasterForm(masterSavedProfile.master);
      setMasterDirty(false);
      setProfileDialogOpen(false);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setProfileSaving(false);
    }
  };

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
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800">
        <div className="pt-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">Job search workspace</p>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">Good morning, {profileRecord?.preferences.display_name.split(" ")[0] || "there"}</h1>
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
                <div className="flex items-center gap-1.5"><h2 className="text-xs font-semibold text-zinc-950 dark:text-zinc-50">Job profile</h2>{profileRecord ? <Badge className="border-0 bg-emerald-50 px-1.5 text-[9px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">Ready</Badge> : <Badge variant="secondary" className="px-1.5 text-[9px]">Needs review</Badge>}</div>
                <p className="mt-0.5 truncate text-[10px] text-zinc-500">{profileRecord?.preferences.target_titles.join(", ") || "Add your CV and job preferences"}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setProfileDialogOpen(true)} className="h-8 shrink-0 px-2.5 text-[10px]"><Pencil className="mr-1 h-3 w-3" />{profileRecord ? "Edit" : "Complete"}</Button>
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
              <div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">1</span><div><h3 className="text-sm font-semibold">Add your CV details</h3><p className="text-xs text-zinc-500">Import a CV or review your saved details manually.</p></div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setSetupMode("pdf")} className={cn("rounded-xl border p-4 text-left transition-colors", setupMode === "pdf" ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/10 dark:bg-indigo-950/20" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800")}>
                  <span className="flex items-center gap-2 text-sm font-semibold"><UploadCloud className="h-4 w-4 text-indigo-600" />Extract from CV</span><span className="mt-1 block text-xs leading-relaxed text-zinc-500">Athena extracts and merges facts into your master profile.</span>
                </button>
                <button type="button" onClick={() => setSetupMode("manual")} className={cn("rounded-xl border p-4 text-left transition-colors", setupMode === "manual" ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/10 dark:bg-indigo-950/20" : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800")}>
                  <span className="flex items-center gap-2 text-sm font-semibold"><Pencil className="h-4 w-4 text-indigo-600" />Edit saved details</span><span className="mt-1 block text-xs leading-relaxed text-zinc-500">Update your identity and job preferences without changing CV evidence.</span>
                </button>
              </div>

              {setupMode === "pdf" && (
                <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-center dark:border-zinc-700 dark:bg-zinc-950/30">
                  <input id="profile-cv-upload" type="file" accept="application/pdf,text/plain,.pdf,.txt" onChange={(event) => void handleProfileCVUpload(event)} className="sr-only" />
                  {importStatus === "extracting" ? <><LoaderCircle className="mx-auto h-6 w-6 animate-spin text-indigo-600" /><p className="mt-2 text-sm font-semibold">Extracting and merging CV facts…</p><p className="mt-1 text-xs text-zinc-500">{uploadedFileName}</p></> : importStatus === "ready" ? <><span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-4 w-4" /></span><p className="mt-2 text-sm font-semibold">Master profile updated</p><p className="mt-1 text-xs text-zinc-500">Review your details below before saving preferences.</p><label htmlFor="profile-cv-upload" className="mt-3 inline-block cursor-pointer text-xs font-semibold text-indigo-600 hover:underline">Add another CV</label></> : <><UploadCloud className="mx-auto h-6 w-6 text-zinc-400" /><p className="mt-2 text-sm font-semibold">Upload a CV</p><p className="mt-1 text-xs text-zinc-500">PDF or TXT · Existing facts are preserved when new CVs merge</p><label htmlFor="profile-cv-upload" className="mt-3 inline-flex h-9 cursor-pointer items-center rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white hover:bg-indigo-700">Choose file</label></>}
                </div>
              )}
            </section>

            <section className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
              <div className="mb-4 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">2</span><div><h3 className="text-sm font-semibold">Review core fields</h3><p className="text-xs text-zinc-500">Personal details are editable; extracted skills stay evidence-backed.</p></div></div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ProfileField label="Full name" value={profileForm.display_name} onChange={(display_name) => setProfileForm((current) => ({ ...current, display_name }))} />
                <ProfileField label="Email for notifications" value={profileForm.email ?? ""} onChange={(email) => setProfileForm((current) => ({ ...current, email }))} />
                <ProfileField label="Location" value={profileForm.current_location} onChange={(current_location) => setProfileForm((current) => ({ ...current, current_location }))} />
                <ProfileField label="Current title" value={profileForm.current_title} onChange={(current_title) => setProfileForm((current) => ({ ...current, current_title }))} className="sm:col-span-2 lg:col-span-3" />
              </div>
              {masterForm ? (
                <ExtractedFactsEditor master={masterForm} onChange={(nextMaster) => { setMasterForm(nextMaster); setMasterDirty(true); }} />
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">Upload a CV to review its extracted experiences, projects, bullets, skills, and education.</div>
              )}
            </section>

            <section className="mt-6 border-t border-zinc-100 pt-5 dark:border-zinc-800">
              <div className="mb-4 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">3</span><div><h3 className="text-sm font-semibold">Tell us your preferences</h3><p className="text-xs text-zinc-500">Separate multiple roles, locations, or types with commas.</p></div></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ProfileField label="Preferred roles" value={profileForm.target_titles.join(", ")} onChange={(value) => setProfileForm((current) => ({ ...current, target_titles: splitList(value) }))} className="sm:col-span-2" />
                <ProfileField label="Preferred locations" value={profileForm.preferred_locations.join(", ")} onChange={(value) => setProfileForm((current) => ({ ...current, preferred_locations: splitList(value) }))} />
                <ProfileChoices label="Work mode" options={["remote", "hybrid", "onsite"]} values={profileForm.work_modes} onChange={(work_modes) => setProfileForm((current) => ({ ...current, work_modes }))} />
                <ProfileChoices label="Employment type" options={["internship", "graduate", "full-time", "contract"]} values={profileForm.employment_types} onChange={(employment_types) => setProfileForm((current) => ({ ...current, employment_types }))} />
                <ProfileField label="Work authorization" value={profileForm.work_authorization} onChange={(work_authorization) => setProfileForm((current) => ({ ...current, work_authorization }))} />
                <ProfileField label="Salary expectation" value={profileForm.salary_expectation} onChange={(salary_expectation) => setProfileForm((current) => ({ ...current, salary_expectation }))} />
              </div>
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300"><input type="checkbox" checked={profileForm.willing_to_relocate} onChange={(event) => setProfileForm((current) => ({ ...current, willing_to_relocate: event.target.checked }))} className="h-4 w-4 rounded border-zinc-300 accent-indigo-600" />Open to relocation</label>
            </section>

            {profileError && <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-400">{profileError}</div>}
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-zinc-100 pt-5 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Your preferences never become unsupported CV claims.</p>
              <Button disabled={profileSaving || importStatus === "extracting"} onClick={() => void saveJobProfile()} className="bg-indigo-600 text-white hover:bg-indigo-700">{profileSaving ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}{profileSaving ? "Saving" : "Save profile"}</Button>
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
                    <div className="flex flex-wrap items-center gap-2">{applicationStatus === "NOT APPLIED" ? <Button size="sm" onClick={() => { if (job.url) window.open(job.url, "_blank", "noopener,noreferrer"); void updateApplicationStatus(job.id, "APPLIED"); }} className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Apply</Button> : <select aria-label={`Update ${job.title} application status`} value={applicationStatus} onChange={(event) => void updateApplicationStatus(job.id, event.target.value as ApplicationStatus)} className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-[11px] font-semibold dark:border-zinc-800 dark:bg-zinc-950">{APPLICATION_STATUSES.filter((status) => status !== "NOT APPLIED").map((status) => <option key={status} value={status}>{status}</option>)}</select>}<Button size="sm" variant="outline" onClick={() => onTailorCV(job.id)} className="h-8 text-xs"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Enhance CV</Button></div>
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

function ExtractedFactsEditor({ master, onChange }: { master: MasterProfile; onChange: (master: MasterProfile) => void }) {
  const updateExperience = (index: number, changes: Partial<MasterProfile["experiences"][number]>) => onChange({ ...master, experiences: master.experiences.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) });
  const updateProject = (index: number, changes: Partial<MasterProfile["projects"][number]>) => onChange({ ...master, projects: master.projects.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) });
  const updateEducation = (index: number, changes: Partial<MasterProfile["education"][number]>) => onChange({ ...master, education: master.education.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) });

  return <div className="mt-5 space-y-5">
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Extracted summary</label>
      <Textarea value={master.summary} onChange={(event) => onChange({ ...master, summary: event.target.value })} className="min-h-24 resize-y text-sm" />
    </div>

    <div>
      <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Evidence-backed skills</p><span className="text-[10px] text-zinc-400">Remove anything extracted incorrectly</span></div>
      <div className="flex min-h-12 flex-wrap gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        {master.skills.map((skill) => <Badge key={skill.name} variant="secondary" className="h-7 gap-1.5 px-2.5">{skill.name}<button type="button" aria-label={`Remove ${skill.name}`} onClick={() => onChange({ ...master, skills: master.skills.filter((item) => item.name !== skill.name) })}><X className="h-3 w-3" /></button></Badge>)}
        {master.skills.length === 0 && <span className="text-xs text-zinc-400">No skills extracted.</span>}
      </div>
    </div>

    <div>
      <div className="mb-2 flex items-center justify-between"><div><p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Experiences</p><p className="text-[10px] text-zinc-400">Review every role and bullet Athena extracted.</p></div><Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...master, experiences: [...master.experiences, { id: `exp-new-${Date.now()}`, role: "", org: "", period: null, bullets: [""], tech: [], role_flavors: [] }] })}><Plus className="h-3.5 w-3.5" />Add role</Button></div>
      <div className="space-y-3">
        {master.experiences.map((experience, index) => <div key={experience.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-3 flex items-center justify-between gap-3"><code className="truncate text-[10px] text-zinc-400">{experience.id}</code><Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${experience.role}`} onClick={() => onChange({ ...master, experiences: master.experiences.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button></div>
          <div className="grid gap-3 sm:grid-cols-3"><ProfileField label="Role" value={experience.role} onChange={(role) => updateExperience(index, { role })} /><ProfileField label="Organization" value={experience.org} onChange={(org) => updateExperience(index, { org })} /><ProfileField label="Period" value={experience.period ?? ""} onChange={(period) => updateExperience(index, { period: period || null })} /></div>
          <div className="mt-3"><ProfileField label="Technologies" value={experience.tech.join(", ")} onChange={(value) => updateExperience(index, { tech: splitList(value) })} /></div>
          <div className="mt-3 space-y-2"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Bullets</p><Button type="button" size="xs" variant="ghost" onClick={() => updateExperience(index, { bullets: [...experience.bullets, ""] })}><Plus className="h-3 w-3" />Add bullet</Button></div>{experience.bullets.map((bullet, bulletIndex) => <div key={bulletIndex} className="flex items-start gap-2"><Textarea value={bullet} onChange={(event) => updateExperience(index, { bullets: experience.bullets.map((item, itemIndex) => itemIndex === bulletIndex ? event.target.value : item) })} className="min-h-20 resize-y text-sm" /><Button type="button" size="icon-sm" variant="ghost" aria-label="Remove bullet" onClick={() => updateExperience(index, { bullets: experience.bullets.filter((_, itemIndex) => itemIndex !== bulletIndex) })}><X className="h-3.5 w-3.5" /></Button></div>)}</div>
          {experience.role_flavors.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{experience.role_flavors.map((flavor) => <Badge key={flavor} variant="outline" className="text-[10px]">{flavor}</Badge>)}</div>}
        </div>)}
        {master.experiences.length === 0 && <p className="rounded-xl bg-zinc-50 p-4 text-center text-xs text-zinc-500 dark:bg-zinc-900">No experiences extracted.</p>}
      </div>
    </div>

    <div>
      <div className="mb-2 flex items-center justify-between"><div><p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Projects</p><p className="text-[10px] text-zinc-400">Keep only factual descriptions and supported bullets.</p></div><Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...master, projects: [...master.projects, { id: `proj-new-${Date.now()}`, name: "", description: "", bullets: [""], tech: [], role_flavors: [] }] })}><Plus className="h-3.5 w-3.5" />Add project</Button></div>
      <div className="space-y-3">
        {master.projects.map((project, index) => <div key={project.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-3 flex items-center justify-between gap-3"><code className="truncate text-[10px] text-zinc-400">{project.id}</code><Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${project.name}`} onClick={() => onChange({ ...master, projects: master.projects.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button></div>
          <div className="grid gap-3 sm:grid-cols-2"><ProfileField label="Project name" value={project.name} onChange={(name) => updateProject(index, { name })} /><ProfileField label="Technologies" value={project.tech.join(", ")} onChange={(value) => updateProject(index, { tech: splitList(value) })} /></div>
          <div className="mt-3"><label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Description</label><Textarea value={project.description} onChange={(event) => updateProject(index, { description: event.target.value })} className="min-h-16 resize-y text-sm" /></div>
          <div className="mt-3 space-y-2"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Bullets</p><Button type="button" size="xs" variant="ghost" onClick={() => updateProject(index, { bullets: [...project.bullets, ""] })}><Plus className="h-3 w-3" />Add bullet</Button></div>{project.bullets.map((bullet, bulletIndex) => <div key={bulletIndex} className="flex items-start gap-2"><Textarea value={bullet} onChange={(event) => updateProject(index, { bullets: project.bullets.map((item, itemIndex) => itemIndex === bulletIndex ? event.target.value : item) })} className="min-h-20 resize-y text-sm" /><Button type="button" size="icon-sm" variant="ghost" aria-label="Remove bullet" onClick={() => updateProject(index, { bullets: project.bullets.filter((_, itemIndex) => itemIndex !== bulletIndex) })}><X className="h-3.5 w-3.5" /></Button></div>)}</div>
          {project.role_flavors.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{project.role_flavors.map((flavor) => <Badge key={flavor} variant="outline" className="text-[10px]">{flavor}</Badge>)}</div>}
        </div>)}
        {master.projects.length === 0 && <p className="rounded-xl bg-zinc-50 p-4 text-center text-xs text-zinc-500 dark:bg-zinc-900">No projects extracted.</p>}
      </div>
    </div>

    <div>
      <div className="mb-2 flex items-center justify-between"><div><p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Education</p><p className="text-[10px] text-zinc-400">WAM is optional. Keep coursework and awards as separate items.</p></div><Button type="button" size="xs" variant="ghost" onClick={() => onChange({ ...master, education: [...master.education, { id: `edu-new-${Date.now()}`, institution: "", degree: "", field_of_study: "", location: "", date_range: "", wam: null, coursework: [], honours_awards: [] }] })}><Plus className="h-3 w-3" />Add education</Button></div>
      <div className="space-y-3">{master.education.map((education, index) => <div key={education.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-3 flex items-center justify-between gap-3"><code className="truncate text-[10px] text-zinc-400">{education.id}</code><Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${education.institution || "education"}`} onClick={() => onChange({ ...master, education: master.education.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button></div>
        <div className="grid gap-3 sm:grid-cols-2"><ProfileField label="Institution" value={education.institution} onChange={(institution) => updateEducation(index, { institution })} /><ProfileField label="Degree" value={education.degree} onChange={(degree) => updateEducation(index, { degree })} /><ProfileField label="Field of study / major" value={education.field_of_study} onChange={(field_of_study) => updateEducation(index, { field_of_study })} /><ProfileField label="Date range" value={education.date_range} onChange={(date_range) => updateEducation(index, { date_range })} /><ProfileField label="Location" value={education.location} onChange={(location) => updateEducation(index, { location })} /><ProfileField label="WAM (optional)" value={education.wam ?? ""} onChange={(wam) => updateEducation(index, { wam: wam || null })} /></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Relevant coursework</label><Textarea value={education.coursework.join("\n")} onChange={(event) => updateEducation(index, { coursework: splitLines(event.target.value) })} rows={5} placeholder="One course per line" className="resize-y text-sm" /></div><div><label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Honours &amp; awards</label><Textarea value={education.honours_awards.join("\n")} onChange={(event) => updateEducation(index, { honours_awards: splitLines(event.target.value) })} rows={5} placeholder="One award or honour per line" className="resize-y text-sm" /></div></div>
      </div>)}</div>
    </div>
  </div>;
}

function ProfileField({ label, value, onChange, className }: { label: string; value: string; onChange: (value: string) => void; className?: string }) {
  return <div className={className}><label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</label><Input value={value} onChange={(event) => onChange(event.target.value)} className="h-11 text-sm" /></div>;
}

function ProfileChoices<T extends string>({ label, options, values, onChange }: { label: string; options: readonly T[]; values: T[]; onChange: (values: T[]) => void }) {
  return <div><p className="mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</p><div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-zinc-200 p-1.5 dark:border-zinc-800">{options.map((option) => { const selected = values.includes(option); return <button key={option} type="button" onClick={() => onChange(selected ? values.filter((value) => value !== option) : [...values, option])} className={cn("rounded-md px-2 py-1.5 text-[11px] font-semibold capitalize transition-colors", selected ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300")}>{option}</button>; })}</div></div>;
}

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trimStart());
}

function splitLines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function cleanList(values: string[]): string[] {
  return values.map((item) => item.trim()).filter(Boolean);
}

function MatchBadge({ score }: { score: number }) {
  return <Badge className={cn("shrink-0 border px-2 py-1 text-[10px] font-bold shadow-none", score >= 85 ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400" : score >= 70 ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-400" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400")}>{score}% match</Badge>;
}

function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge className={cn("border px-2 py-0.5 text-[9px] font-bold shadow-none", status === "NOT APPLIED" && "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900", status === "APPLIED" && "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-400", status === "INTERVIEW" && "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-400", ["OFFER", "ACCEPTED"].includes(status) && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400", ["REJECTED", "WITHDRAWN"].includes(status) && "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400")}>{status}</Badge>;
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
