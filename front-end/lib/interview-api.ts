const INTERVIEW_API_URL = (
  process.env.NEXT_PUBLIC_INTERVIEW_API_URL ?? "http://localhost:8008"
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

export type ApiSession = {
  id: string;
  config: {
    user_id: string;
    job_description: string | null;
    role_level: string | null;
    topics: ApiTopic[];
  };
  state: {
    messages: Array<{ role: "interviewer" | "candidate"; content: string }>;
  };
  status: "active" | "evaluating" | "completed" | "failed";
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
    throw new Error("Could not reach Athena Backend at http://localhost:8008.");
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
  roleLevel: string | null
): Promise<ApiSession> {
  return apiRequest<ApiSession>("/interview/sessions", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      job_description: jobDescription,
      cv_text: cvText,
      role_level: roleLevel,
    }),
  });
}

export function answerInterview(sessionId: string, answer: string): Promise<AnswerResult> {
  return apiRequest<AnswerResult>(`/interview/sessions/${sessionId}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
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

export function getInterviewReport(sessionId: string): Promise<ReportResult> {
  return apiRequest<ReportResult>(`/interview/sessions/${sessionId}/report`);
}
