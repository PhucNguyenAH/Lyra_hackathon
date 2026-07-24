const PROFILE_API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8008"
).replace(/\/$/, "");

const PROFILE_API_TIMEOUT_MS = 180_000;

export type RoleFlavor =
  | "backend"
  | "frontend"
  | "fullstack"
  | "ai"
  | "ml"
  | "data"
  | "devops"
  | "cloud"
  | "quant"
  | "mobile"
  | "security"
  | "platform";

export type ProfileSkill = {
  name: string;
  evidence: string[];
};

export type ProfileExperience = {
  id: string;
  role: string;
  org: string;
  period: string | null;
  bullets: string[];
  tech: string[];
  role_flavors: RoleFlavor[];
};

export type ProfileProject = {
  id: string;
  name: string;
  description: string;
  bullets: string[];
  tech: string[];
  role_flavors: RoleFlavor[];
};

export type ProfileEducation = {
  id: string;
  institution: string;
  degree: string;
  field_of_study: string;
  location: string;
  date_range: string;
  wam: string | null;
  coursework: string[];
  honours_awards: string[];
};

export type MasterProfile = {
  summary: string;
  skills: ProfileSkill[];
  experiences: ProfileExperience[];
  projects: ProfileProject[];
  education: ProfileEducation[];
};

export type CandidatePreferences = {
  display_name: string;
  email?: string;
  current_title: string;
  current_location: string;
  target_titles: string[];
  preferred_locations: string[];
  work_modes: Array<"remote" | "hybrid" | "onsite">;
  employment_types: Array<"internship" | "graduate" | "full-time" | "contract">;
  willing_to_relocate: boolean;
  work_authorization: string;
  salary_expectation: string;
};

export type ProfileRecord = {
  id: string;
  user_id: string | null;
  master: MasterProfile;
  preferences: CandidatePreferences;
  version: number;
};

export type CVUploadRecord = {
  id: string;
  label: string;
  created_at: string;
};

export class ProfileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ProfileApiError";
  }
}

async function profileRequest<T>(
  path: string,
  userId: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PROFILE_API_URL}${path}`, {
      ...init,
      headers: {
        "X-User-ID": userId,
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(PROFILE_API_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("Profile processing timed out. Please try the upload again.");
    }
    throw new Error(`Could not reach the backend at ${PROFILE_API_URL}.`);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      detail?: string | { message?: string };
    } | null;
    const detail = payload?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message ?? `Profile API request failed (${response.status})`;
    throw new ProfileApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function getProfile(userId: string): Promise<ProfileRecord> {
  return profileRequest<ProfileRecord>("/profile", userId);
}

export function updatePreferences(
  userId: string,
  preferences: CandidatePreferences,
): Promise<ProfileRecord> {
  return profileRequest<ProfileRecord>("/profile/preferences", userId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
  });
}

export function updateMasterProfile(
  userId: string,
  master: MasterProfile,
): Promise<ProfileRecord> {
  return profileRequest<ProfileRecord>("/profile", userId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(master),
  });
}

export function uploadCV(
  userId: string,
  file: File,
  label: string,
): Promise<ProfileRecord> {
  const body = new FormData();
  body.append("file", file);
  body.append("label", label);
  return profileRequest<ProfileRecord>("/profile/upload", userId, {
    method: "POST",
    body,
  });
}

export function getCVUploads(userId: string): Promise<CVUploadRecord[]> {
  return profileRequest<CVUploadRecord[]>("/profile/uploads", userId);
}

export type JobMatch = {
  match_score: number;
  required_skills: string[];
  matched_skills: string[];
};

// LLM skill-match: scores the user's resume against one job description.
export function matchJob(userId: string, jdText: string): Promise<JobMatch> {
  return profileRequest<JobMatch>("/profile/match", userId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jd_text: jdText }),
  });
}

export function deleteCVUpload(userId: string, uploadId: string): Promise<void> {
  return profileRequest<void>(`/profile/uploads/${uploadId}`, userId, {
    method: "DELETE",
  });
}

export type SelectedItem = {
  item_id: string;
  kept_bullets: string[];
  order: number;
  why: string;
};

export type CVVariant = {
  target_summary: string;
  selected_experiences: SelectedItem[];
  selected_projects: SelectedItem[];
  emphasized_skills: string[];
  omitted_notable: string[];
  rationale: string;
};

export type CVVariantRecord = {
  id: string;
  application_id: string;
  profile_version: number;
  variant: CVVariant;
  created_at: string;
};

export function tailorApplication(
  userId: string,
  applicationId: string,
): Promise<CVVariant> {
  return profileRequest<CVVariant>(
    `/applications/${applicationId}/tailor`,
    userId,
    { method: "POST" },
  );
}

export function getApplicationVariants(
  userId: string,
  applicationId: string,
): Promise<CVVariantRecord[]> {
  return profileRequest<CVVariantRecord[]>(
    `/applications/${applicationId}/variants`,
    userId,
  );
}

// Tailors against any JD text directly — no seeded `jobs`/`applications` row
// required, so every job in the (frontend-only) seed pool can be tailored for
// real, not just the one row that happens to exist in Supabase.
export function tailorPreview(userId: string, jdText: string): Promise<CVVariant> {
  return profileRequest<CVVariant>("/profile/tailor-preview", userId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jd_text: jdText }),
  });
}
