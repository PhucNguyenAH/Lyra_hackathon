"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Check,
  FileCheck2,
  FileText,
  LoaderCircle,
  MapPin,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CandidatePreferences,
  CVUploadRecord,
  MasterProfile,
  ProfileApiError,
  ProfileRecord,
  deleteCVUpload,
  getCVUploads,
  getProfile,
  updateMasterProfile,
  updatePreferences,
  uploadCV,
} from "@/lib/profile-api";
import { scrapeJobs, pollJob } from "@/lib/jobs-api";
import { cn } from "@/lib/utils";

const USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "";

const EMPTY_MASTER_PROFILE: MasterProfile = {
  summary: "",
  skills: [],
  experiences: [],
  projects: [],
  education: [],
};

const EMPTY_PREFERENCES: CandidatePreferences = {
  display_name: "",
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

const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
const EMPLOYMENT_TYPES = ["internship", "graduate", "full-time", "contract"] as const;

function TagEditor({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const addValue = () => {
    const value = draft.trim();
    if (!value || values.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    onChange([...values, value]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-zinc-700">{label}</label>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addValue();
            }
          }}
          placeholder={placeholder}
          className="h-10"
        />
        <Button type="button" variant="outline" size="lg" onClick={addValue} aria-label={`Add ${label}`}>
          <Plus />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((value) => (
            <Badge key={value} variant="secondary" className="h-7 gap-1.5 px-2.5">
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((item) => item !== value))}
                aria-label={`Remove ${value}`}
                className="rounded-full text-zinc-500 hover:text-zinc-900"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ChoiceGroup<T extends string>({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: readonly T[];
  values: T[];
  onChange: (values: T[]) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-zinc-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = values.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange(selected ? values.filter((value) => value !== option) : [...values, option])
              }
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold capitalize transition-colors",
                selected
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
              )}
            >
              {selected && <Check className="size-3.5" />}
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ProfileWorkspaceProps {
  embedded?: boolean;
  onProfileChange?: (profile: ProfileRecord | null) => void;
}

export function ProfileWorkspace({
  embedded = false,
  onProfileChange,
}: ProfileWorkspaceProps = {}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [preferences, setPreferences] = useState<CandidatePreferences>(EMPTY_PREFERENCES);
  const [uploads, setUploads] = useState<CVUploadRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadLabel, setUploadLabel] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scrapeTitle, setScrapeTitle] = useState("");
  const [scrapeLocation, setScrapeLocation] = useState("");
  const [showScrapeBar, setShowScrapeBar] = useState(false);
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);
  const [isScraping, setIsScraping] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!USER_ID) {
      setLoadError("Set NEXT_PUBLIC_DEMO_USER_ID to load your profile.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const nextProfile = await getProfile(USER_ID);
      setProfile(nextProfile);
      setPreferences(nextProfile.preferences);
      setUploads(await getCVUploads(USER_ID));
      onProfileChange?.(nextProfile);
    } catch (error) {
      if (error instanceof ProfileApiError && error.status === 404) {
        setProfile(null);
        setPreferences(EMPTY_PREFERENCES);
        setUploads([]);
        onProfileChange?.(null);
      } else {
        setLoadError(error instanceof Error ? error.message : "Could not load your profile.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [onProfileChange]);

  useEffect(() => {
    const load = window.setTimeout(() => void loadProfile(), 0);
    return () => window.clearTimeout(load);
  }, [loadProfile]);

  const handleUpload = async () => {
    if (!selectedFile || !USER_ID) return;
    setIsUploading(true);
    try {
      const nextProfile = await uploadCV(
        USER_ID,
        selectedFile,
        uploadLabel.trim() || selectedFile.name.replace(/\.[^.]+$/, ""),
      );
      setProfile(nextProfile);
      setPreferences(nextProfile.preferences);
      setUploads(await getCVUploads(USER_ID));
      onProfileChange?.(nextProfile);
      setSelectedFile(null);
      setUploadLabel("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      const prefs = nextProfile.preferences;
      setScrapeTitle(prefs.target_titles?.[0] ?? prefs.current_title ?? "");
      setScrapeLocation(prefs.preferred_locations?.[0] ?? prefs.current_location ?? "");
      setShowScrapeBar(true);
      toast.success("CV added to your master profile");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "CV upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteUpload = async (uploadId: string) => {
    if (!USER_ID) return;
    setDeletingUploadId(uploadId);
    try {
      await deleteCVUpload(USER_ID, uploadId);
      setUploads((prev) => prev.filter((upload) => upload.id !== uploadId));
      toast.success("Resume removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove resume");
    } finally {
      setDeletingUploadId(null);
    }
  };

  const handleFindJobs = async () => {
    if (!scrapeTitle.trim()) return;
    setIsScraping(true);
    try {
      const jobId = await scrapeJobs(scrapeTitle.trim(), scrapeLocation.trim(), 10);
      // poll until terminal (scraping ~10 jobs can take up to a minute)
      for (let i = 0; i < 40; i++) {
        const data = await pollJob(jobId);
        if (data.status === "done") {
          const n = data.results?.length ?? 0;
          toast.success(`Found ${n} jobs — see the dashboard`);
          setShowScrapeBar(false);
          return;
        }
        if (data.status === "error") {
          toast.error(data.error ?? "Scrape failed");
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      toast.error("Scrape timed out");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scrape failed");
    } finally {
      setIsScraping(false);
    }
  };

  const handleSave = async () => {
    if (!profile || !USER_ID) return;
    setIsSaving(true);
    try {
      const nextProfile = await updatePreferences(USER_ID, preferences);
      setProfile(nextProfile);
      setPreferences(nextProfile.preferences);
      onProfileChange?.(nextProfile);
      toast.success("Profile preferences saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save preferences");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearProfile = async () => {
    if (!profile || !USER_ID) return;
    if (
      !window.confirm(
        "Clear your master profile? This resets all extracted experience, projects, and skills, and your saved preferences. Uploaded CV files stay on file so you can re-add them.",
      )
    ) {
      return;
    }
    setIsClearing(true);
    try {
      await updateMasterProfile(USER_ID, EMPTY_MASTER_PROFILE);
      const nextProfile = await updatePreferences(USER_ID, EMPTY_PREFERENCES);
      setProfile(nextProfile);
      setPreferences(EMPTY_PREFERENCES);
      onProfileChange?.(nextProfile);
      toast.success("Profile cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not clear profile");
    } finally {
      setIsClearing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <LoaderCircle className="size-4 animate-spin" /> Loading your profile
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mx-auto w-full max-w-6xl space-y-6", embedded ? "pb-2" : "pb-10")}>
      {!embedded && <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            <Sparkles className="size-3.5" /> Candidate profile
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 sm:text-3xl">Your career source of truth</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
            Add every version of your CV. Athena merges the evidence once, then selects the right facts for each job.
          </p>
        </div>
        {profile && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-7 w-fit bg-white px-3 text-zinc-600">
              Master profile v{profile.version}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isClearing}
              onClick={handleClearProfile}
              className="h-7 gap-1.5 border-rose-200 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50"
            >
              {isClearing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Clear profile
            </Button>
          </div>
        )}
      </div>}

      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {loadError}
        </div>
      )}

      <Card className="border-0 shadow-sm ring-zinc-200">
        <CardHeader className="border-b border-zinc-100">
          <CardTitle className="flex items-center gap-2"><UploadCloud className="size-4 text-indigo-600" /> CV library</CardTitle>
          <CardDescription>Upload PDF or TXT files. Each upload is merged into one deduplicated master profile.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              className="sr-only"
              id="profile-cv-upload"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center rounded-lg px-4 py-5 text-center hover:bg-white/60"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100">
                {selectedFile ? <FileCheck2 className="size-5" /> : <UploadCloud className="size-5" />}
              </span>
              <span className="mt-3 text-sm font-semibold text-zinc-900">{selectedFile ? selectedFile.name : "Choose a CV file"}</span>
              <span className="mt-1 text-xs text-zinc-500">PDF or UTF-8 TXT</span>
            </button>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={uploadLabel}
                onChange={(event) => setUploadLabel(event.target.value)}
                placeholder="Label, e.g. Backend CV"
                className="h-10 bg-white"
              />
              <Button type="button" size="lg" disabled={!selectedFile || isUploading || !USER_ID} onClick={handleUpload} className="bg-indigo-600 hover:bg-indigo-700">
                {isUploading ? <LoaderCircle className="animate-spin" /> : <UploadCloud />}
                {isUploading ? "Extracting & merging" : "Add to profile"}
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Recent uploads</p>
            <div className="space-y-2">
              {uploads.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 p-5 text-center text-sm text-zinc-500">No CVs uploaded yet.</div>
              ) : uploads.slice(0, 5).map((upload) => (
                <div key={upload.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"><FileText className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-800">{upload.label}</p>
                    <p className="text-xs text-zinc-500">{new Date(upload.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>
                  <Check className="size-4 text-emerald-600" />
                  <button
                    type="button"
                    aria-label={`Remove ${upload.label}`}
                    title="Remove resume"
                    onClick={() => handleDeleteUpload(upload.id)}
                    disabled={deletingUploadId === upload.id}
                    className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingUploadId === upload.id ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {showScrapeBar && (
            <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 sm:flex-row sm:items-end lg:col-span-2">
              <div className="flex-1 space-y-2">
                <label className="text-xs font-semibold text-zinc-700">Job title</label>
                <Input
                  value={scrapeTitle}
                  onChange={(event) => setScrapeTitle(event.target.value)}
                  placeholder="Backend Engineer"
                  className="h-10 bg-white"
                />
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-xs font-semibold text-zinc-700">Location</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 size-4 text-zinc-400" />
                  <Input
                    value={scrapeLocation}
                    onChange={(event) => setScrapeLocation(event.target.value)}
                    placeholder="Sydney, NSW"
                    className="h-10 bg-white pl-9"
                  />
                </div>
              </div>
              <Button
                type="button"
                size="lg"
                disabled={!scrapeTitle.trim() || isScraping}
                onClick={handleFindJobs}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {isScraping ? <LoaderCircle className="animate-spin" /> : <BriefcaseBusiness />}
                {isScraping ? "Finding jobs" : "Find jobs"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {profile && (
        <div className="grid gap-6 lg:grid-cols-[1fr_0.72fr]">
          <Card className="border-0 shadow-sm ring-zinc-200">
            <CardHeader className="border-b border-zinc-100">
              <CardTitle className="flex items-center gap-2"><UserRound className="size-4 text-indigo-600" /> Profile & preferences</CardTitle>
              <CardDescription>Used to rank jobs and personalize recommendations—not as CV evidence.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><label className="text-xs font-semibold text-zinc-700">Display name</label><Input className="h-10" value={preferences.display_name} onChange={(event) => setPreferences({ ...preferences, display_name: event.target.value })} placeholder="Kian Nguyen" /></div>
                <div className="space-y-2"><label className="text-xs font-semibold text-zinc-700">Current title</label><Input className="h-10" value={preferences.current_title} onChange={(event) => setPreferences({ ...preferences, current_title: event.target.value })} placeholder="Software Engineering student" /></div>
                <div className="space-y-2 sm:col-span-2"><label className="text-xs font-semibold text-zinc-700">Current location</label><div className="relative"><MapPin className="absolute left-3 top-3 size-4 text-zinc-400" /><Input className="h-10 pl-9" value={preferences.current_location} onChange={(event) => setPreferences({ ...preferences, current_location: event.target.value })} placeholder="Sydney, NSW" /></div></div>
              </div>

              <TagEditor label="Target job titles" placeholder="Backend Engineer" values={preferences.target_titles} onChange={(target_titles) => setPreferences({ ...preferences, target_titles })} />
              <TagEditor label="Preferred locations" placeholder="Sydney, NSW" values={preferences.preferred_locations} onChange={(preferred_locations) => setPreferences({ ...preferences, preferred_locations })} />
              <ChoiceGroup label="Work mode" options={WORK_MODES} values={preferences.work_modes} onChange={(work_modes) => setPreferences({ ...preferences, work_modes })} />
              <ChoiceGroup label="Employment type" options={EMPLOYMENT_TYPES} values={preferences.employment_types} onChange={(employment_types) => setPreferences({ ...preferences, employment_types })} />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><label className="text-xs font-semibold text-zinc-700">Work authorization</label><Input className="h-10" value={preferences.work_authorization} onChange={(event) => setPreferences({ ...preferences, work_authorization: event.target.value })} placeholder="Australian citizen" /></div>
                <div className="space-y-2"><label className="text-xs font-semibold text-zinc-700">Salary expectation</label><Input className="h-10" value={preferences.salary_expectation} onChange={(event) => setPreferences({ ...preferences, salary_expectation: event.target.value })} placeholder="AUD 80k–95k" /></div>
              </div>

              <button
                type="button"
                aria-pressed={preferences.willing_to_relocate}
                onClick={() => setPreferences({ ...preferences, willing_to_relocate: !preferences.willing_to_relocate })}
                className="flex w-full items-center justify-between rounded-xl border border-zinc-200 p-4 text-left"
              >
                <div><p className="text-sm font-semibold text-zinc-800">Open to relocation</p><p className="mt-0.5 text-xs text-zinc-500">Include roles outside your preferred locations.</p></div>
                <span className={cn("relative h-6 w-11 rounded-full transition-colors", preferences.willing_to_relocate ? "bg-indigo-600" : "bg-zinc-200")}><span className={cn("absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform", preferences.willing_to_relocate ? "translate-x-6" : "translate-x-1")} /></span>
              </button>

              <div className="flex justify-end border-t border-zinc-100 pt-5">
                <Button type="button" size="lg" disabled={isSaving} onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700">
                  {isSaving ? <LoaderCircle className="animate-spin" /> : <Save />}
                  {isSaving ? "Saving" : "Save preferences"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-0 bg-zinc-950 text-white shadow-sm ring-zinc-900">
              <CardHeader><CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="size-4 text-indigo-400" /> Master profile</CardTitle><CardDescription className="text-zinc-400">Facts Athena can safely select when tailoring.</CardDescription></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    [profile.master.experiences.length, "Experiences"],
                    [profile.master.projects.length, "Projects"],
                    [profile.master.skills.length, "Skills"],
                    [profile.master.education.length, "Education"],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10"><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-zinc-400">{label}</p></div>
                  ))}
                </div>
                <p className="mt-4 line-clamp-5 text-sm leading-6 text-zinc-300">{profile.master.summary || "Upload a detailed CV to build your factual career summary."}</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm ring-zinc-200">
              <CardHeader><CardTitle>Top skills</CardTitle><CardDescription>Skills backed by evidence in your uploaded CVs.</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {profile.master.skills.length ? profile.master.skills.slice(0, 16).map((skill) => <Badge key={skill.name} variant="secondary" className="h-7 px-2.5">{skill.name}</Badge>) : <p className="text-sm text-zinc-500">No extracted skills yet.</p>}
              </CardContent>
            </Card>

          </div>
        </div>
      )}
    </div>
  );
}
