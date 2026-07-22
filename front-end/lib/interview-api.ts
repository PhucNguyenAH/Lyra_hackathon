const INTERVIEW_API_URL = (
  process.env.NEXT_PUBLIC_INTERVIEW_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8008"
).replace(/\/$/, "");
const INTERVIEW_API_TIMEOUT_MS = 60_000;

export type ApiTopic = {
  id: string;
  type: "behavioral" | "technical" | "company_domain";
  title: string;
  opening_question: string;
  what_good_looks_like: string[];
  callback: string | null;
};

export type InterviewStage = "phone_screen" | "experience_technical";

export type HiringProcessResearch = {
  company: string;
  job_title: string;
  summary: string;
  stages: Array<{
    name: string;
    category: "phone_screen" | "experience_technical" | "coding_assessment" | "onsite" | "other";
    description: string;
    evidence: Array<{ url: string; title: string }>;
    confidence: number;
    practice_supported: boolean;
  }>;
  researched_at: string;
  confidence: number;
};

export type ApiSession = {
  id: string;
  config: {
    user_id: string;
    job_description: string | null;
    role_level: string | null;
    interview_stage: InterviewStage;
    job_title: string | null;
    company: string | null;
    cv_draft_id: string | null;
    hiring_process: HiringProcessResearch | null;
    topics: ApiTopic[];
  };
  state: {
    current_topic_index: number;
    topic_states: Array<{ topic_id: string; followup_count: number; hint_count: number; answer_count: number; completed: boolean }>;
    messages: Array<{ role: "interviewer" | "candidate"; content: string }>;
    turns: Array<{ topic_id: string; answer: string; delivery?: DeliveryEvidence | null; analysis: { interviewer_message: string }; move: string }>;
    events: Array<{ type: string; at: string; topic_id: string | null; detail: Record<string, unknown> }>;
  };
  status: "active" | "evaluating" | "completed" | "failed" | "abandoned";
};

export type DeliveryEvidence = {
  duration_seconds: number;
  word_count: number;
  words_per_minute: number;
  filler_words: number;
  transcript_source: "groq_whisper" | "typed";
};

export type TranscriptionResult = {
  text: string;
  duration_seconds: number | null;
};

export type AnswerResult = {
  interviewer_message: string;
  verdict: "solid" | "vague" | "stuck";
  move: "follow_up" | "hint" | "next_topic" | "complete";
  session_complete: boolean;
};

export type FeedbackReport = {
  overall: string;
  scores: {
    specificity: number;
    technical_depth: number;
    communication: number;
    handling_pressure: number;
  };
  per_topic: Array<{
    topic_id: string;
    verdict_summary: string;
    what_they_said: string;
    what_was_missing: string;
    stronger_answer: string;
  }>;
  weak_topics: Array<{
    topic: string;
    why_weak: string;
    drill_suggestion: string;
  }>;
  one_thing: string;
};

type ReportResult = {
  status: ApiSession["status"];
  report: FeedbackReport | null;
};

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${INTERVIEW_API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(INTERVIEW_API_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("The AI interviewer timed out. Confirm Athena Backend is running on port 8008, then try again.");
    }
    throw new Error(`Could not reach Athena Backend at ${INTERVIEW_API_URL}.`);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail || `Interview API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function createInterview(
  userId: string,
  jobDescription: string | null,
  cvText: string,
  roleLevel: string | null,
  context?: {
    interviewStage?: InterviewStage;
    jobTitle?: string | null;
    company?: string | null;
    cvDraftId?: string | null;
    hiringProcess?: HiringProcessResearch | null;
  }
): Promise<ApiSession> {
  return apiRequest<ApiSession>("/interview/sessions", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      job_description: jobDescription,
      cv_text: cvText,
      role_level: roleLevel,
      interview_stage: context?.interviewStage ?? "experience_technical",
      job_title: context?.jobTitle ?? null,
      company: context?.company ?? null,
      cv_draft_id: context?.cvDraftId ?? null,
      hiring_process: context?.hiringProcess ?? null,
    }),
  });
}

export function getInterviewSession(sessionId: string): Promise<ApiSession> {
  return apiRequest<ApiSession>(`/interview/sessions/${sessionId}`);
}

export function researchHiringProcess(
  company: string,
  jobTitle: string,
  jobUrl?: string | null
): Promise<HiringProcessResearch> {
  return apiRequest<HiringProcessResearch>("/interview/hiring-process/research", {
    method: "POST",
    body: JSON.stringify({ company, job_title: jobTitle, job_url: jobUrl || null }),
  });
}

export function answerInterview(
  sessionId: string,
  answer: string,
  delivery?: DeliveryEvidence
): Promise<AnswerResult> {
  return apiRequest<AnswerResult>(`/interview/sessions/${sessionId}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer, delivery }),
  });
}

export async function transcribeInterviewAudio(audio: Blob): Promise<TranscriptionResult> {
  const form = new FormData();
  const extension = audio.type.includes("mp4") ? "m4a" : "webm";
  form.append("audio", audio, `interview-answer.${extension}`);
  let response: Response;
  try {
    response = await fetch(`${INTERVIEW_API_URL}/interview/transcriptions`, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(INTERVIEW_API_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Could not send the recording to Groq Whisper.");
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail || `Audio transcription failed (${response.status})`);
  }
  return response.json() as Promise<TranscriptionResult>;
}

export function endInterview(sessionId: string): Promise<ReportResult> {
  return apiRequest<ReportResult>(`/interview/sessions/${sessionId}/end`, { method: "POST" });
}

export function skipInterviewTopic(
  sessionId: string
): Promise<{ interviewer_message: string; session_complete: boolean }> {
  return apiRequest(`/interview/sessions/${sessionId}/skip`, { method: "POST" });
}

export function timeoutInterviewTopic(sessionId: string): Promise<AnswerResult> {
  return apiRequest<AnswerResult>(`/interview/sessions/${sessionId}/timeout`, { method: "POST" });
}

export function recordInterviewEvent(
  sessionId: string,
  type: "paused" | "resumed",
  detail: Record<string, unknown> = {}
): Promise<ApiSession> {
  return apiRequest<ApiSession>(`/interview/sessions/${sessionId}/events`, {
    method: "POST",
    body: JSON.stringify({ type, detail }),
  });
}

export function abandonInterview(sessionId: string, reason = "candidate_quit"): Promise<ApiSession> {
  return apiRequest<ApiSession>(`/interview/sessions/${sessionId}/abandon`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function getInterviewReport(sessionId: string): Promise<ReportResult> {
  return apiRequest<ReportResult>(`/interview/sessions/${sessionId}/report`);
}

export type SessionSummary = {
  id: string;
  job_title: string | null;
  company: string | null;
  cv_draft_id: string | null;
  created_at: string;
  report: FeedbackReport;
};

export function listInterviewSessions(userId: string): Promise<SessionSummary[]> {
  return apiRequest<SessionSummary[]>(`/interview/sessions?user_id=${encodeURIComponent(userId)}`);
}
