"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import {
  getProfile,
  tailorApplication,
  ProfileApiError,
  type ProfileRecord,
  type CVVariant,
} from "@/lib/profile-api";

const CONFIGURED_USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "";
const BROWSER_USER_ID_KEY = "lyra-interview-user-id";

// Only one job/application row is seeded in Supabase so far (a placeholder
// "Backend Engineer @ InnovateTech Solutions" posting). Real job listings
// live in the job-scraping teammate's `jobs`/`applications` tables — once
// more are seeded there, this should become a picker instead of a constant.
const DEMO_APPLICATION_ID = "69107f20-662a-4e53-9795-fb5d39396845";
const DEMO_JOB_LABEL = "Backend Engineer @ InnovateTech Solutions";
const DEMO_JOB_DESCRIPTION =
  "Backend engineering with Java, Spring Boot, PostgreSQL, and AWS.";

function getUserId(): string {
  if (CONFIGURED_USER_ID) return CONFIGURED_USER_ID;
  const existing = window.localStorage.getItem(BROWSER_USER_ID_KEY);
  if (existing) return existing;
  const generated = window.crypto.randomUUID();
  window.localStorage.setItem(BROWSER_USER_ID_KEY, generated);
  return generated;
}

export function CVBuilderWorkspace() {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [variant, setVariant] = useState<CVVariant | null>(null);
  const [tailorLoading, setTailorLoading] = useState(false);
  const [tailorError, setTailorError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProfile(getUserId())
      .then((record) => {
        if (!cancelled) setProfile(record);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProfileError(
            error instanceof Error ? error.message : "Could not load your master profile.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerate = async () => {
    setTailorLoading(true);
    setTailorError(null);
    try {
      const result = await tailorApplication(getUserId(), DEMO_APPLICATION_ID);
      setVariant(result);
    } catch (error) {
      setTailorError(
        error instanceof ProfileApiError
          ? error.message
          : "Could not reach the tailoring backend. Confirm Athena Backend is running on port 8008.",
      );
    } finally {
      setTailorLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles className="h-6 w-6 text-indigo-500" />
          CV Builder
        </h1>
        <p className="text-sm text-zinc-500">
          Selects the most relevant experiences and projects from your master profile for one target job.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your master profile</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600 dark:text-zinc-400">
          {profileLoading && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your master profile…
            </div>
          )}
          {!profileLoading && profileError && (
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
              {profileError}
            </div>
          )}
          {!profileLoading && profile && (
            <div className="space-y-2">
              <p>
                {profile.master.experiences.length} experience(s) · {profile.master.projects.length} project(s) ·{" "}
                {profile.master.skills.length} skill(s)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {profile.master.skills.slice(0, 12).map((skill) => (
                  <Badge key={skill.name} variant="secondary">
                    {skill.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Target job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-semibold">{DEMO_JOB_LABEL}</p>
          <p className="text-zinc-500">{DEMO_JOB_DESCRIPTION}</p>
        </CardContent>
      </Card>

      <Button onClick={handleGenerate} disabled={tailorLoading || profileLoading} className="w-full">
        {tailorLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Selecting the best points from your profile…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate tailored CV
          </>
        )}
      </Button>

      {tailorError && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {tailorError}
        </div>
      )}

      {variant && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tailored summary</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">{variant.target_summary}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Selected experience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {variant.selected_experiences.length === 0 && (
                <p className="text-sm text-zinc-400">No experience selected for this job.</p>
              )}
              {variant.selected_experiences.map((item) => (
                <div key={item.item_id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                  <p className="font-mono text-xs text-zinc-400">{item.item_id}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {item.kept_bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs italic text-zinc-500">{item.why}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Selected projects</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {variant.selected_projects.length === 0 && (
                <p className="text-sm text-zinc-400">No projects selected for this job.</p>
              )}
              {variant.selected_projects.map((item) => (
                <div key={item.item_id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                  <p className="font-mono text-xs text-zinc-400">{item.item_id}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {item.kept_bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs italic text-zinc-500">{item.why}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Emphasized skills</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {variant.emphasized_skills.map((skill) => (
                <Badge key={skill}>{skill}</Badge>
              ))}
            </CardContent>
          </Card>

          {variant.omitted_notable.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Omitted (override if you disagree)</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {variant.omitted_notable.map((itemId) => (
                  <Badge key={itemId} variant="outline">
                    {itemId}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Why this selection</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-600 dark:text-zinc-400">{variant.rationale}</CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
