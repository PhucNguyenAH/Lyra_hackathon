"use client";

import React, { useState, useEffect, useRef } from "react";
import { InterviewChat, Message } from "./interview-chat";
import { InterviewCoverage, TopicCoverage } from "./interview-coverage";
import { ScoreBreakdown } from "./interview-scorecard";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { HelpCircle, Sparkles, RotateCcw, CheckCircle2, ChevronRight, FileText, AlertTriangle, Play, Pause, Timer, ClipboardList, Loader2, PhoneCall, MessagesSquare, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CVDraft } from "../drafts-dashboard";
import { JobPosting } from "../jobs-dashboard";
import { CVData } from "../cv-editor/cv-pdf-preview";
import {
  answerInterview,
  abandonInterview,
  createInterview,
  DeliveryEvidence,
  endInterview,
  FeedbackReport,
  getInterviewReport,
  getInterviewSession,
  HiringProcessResearch,
  InterviewStage,
  listInterviewSessions,
  recordInterviewEvent,
  researchHiringProcess,
  SessionSummary,
  skipInterviewTopic,
  timeoutInterviewTopic,
} from "@/lib/interview-api";

const CONFIGURED_USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "";
const BROWSER_USER_ID_KEY = "lyra-interview-user-id";
const REPORT_POLL_INTERVAL_MS = 1_500;
const REPORT_POLL_ATTEMPTS = 40;
const INACTIVITY_NUDGE_MS = 60_000;
const INACTIVITY_HINT_MS = 180_000;
const INACTIVITY_MOVE_MS = 300_000;

const emptyScore: ScoreBreakdown = {
  overall: 0,
  situation: 0,
  task: 0,
  action: 0,
  result: 0,
  relevance: 0,
  specificity: 0,
  proseFeedback: "Feedback is generated when the interview ends.",
  metricsPresent: false,
};

function getInterviewUserId(): string {
  if (CONFIGURED_USER_ID) return CONFIGURED_USER_ID;
  const existing = window.localStorage.getItem(BROWSER_USER_ID_KEY);
  if (existing) return existing;
  const generated = window.crypto.randomUUID();
  window.localStorage.setItem(BROWSER_USER_ID_KEY, generated);
  return generated;
}

interface InterviewWorkspaceProps {
  drafts: CVDraft[];
  cvDatabase: Record<string, CVData>;
  jobs: JobPosting[];
  initialSessionId?: string;
  onSessionIdChange?: (sessionId: string | null) => void;
  onExamModeChange?: (active: boolean) => void;
}

export interface QARecord {
  id: string;
  topicId?: string;
  question: string;
  answer: string;
  score: ScoreBreakdown;
  whatWasMissing?: string;
  strongerAnswer?: string;
  delivery?: DeliveryEvidence;
}

export interface SessionRecord {
  id: string;
  role: string;
  company: string;
  date: string;
  cvName: string;
  score: number;
  qa: QARecord[];
}

const reportScore = (value: number) => Math.round(value * 20);

function topicIdToLabel(topicId: string): string {
  return topicId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Maps a persisted report (from GET /interview/sessions) into the same shape
 * a freshly-finished session produces, so past and live practice render identically. */
function summaryToSessionRecord(summary: SessionSummary, drafts: CVDraft[]): SessionRecord {
  const { report } = summary;
  const average = Math.round(Object.values(report.scores).reduce((sum, value) => sum + value, 0) * 5);
  const qa: QARecord[] = report.per_topic.map((feedback) => ({
    id: `report-${feedback.topic_id}`,
    topicId: feedback.topic_id,
    question: topicIdToLabel(feedback.topic_id),
    answer: feedback.what_they_said,
    score: {
      overall: average,
      situation: reportScore(report.scores.communication),
      task: reportScore(report.scores.handling_pressure),
      action: reportScore(report.scores.technical_depth),
      result: reportScore(report.scores.specificity),
      relevance: reportScore(report.scores.communication),
      specificity: reportScore(report.scores.specificity),
      proseFeedback: feedback.verdict_summary,
      metricsPresent: /\d/.test(feedback.what_they_said),
    },
    whatWasMissing: feedback.what_was_missing,
    strongerAnswer: feedback.stronger_answer,
  }));

  return {
    id: summary.id,
    role: summary.job_title || "General practice",
    company: summary.company || "General Prep",
    date: new Date(summary.created_at).toLocaleDateString(),
    cvName: drafts.find((draft) => draft.id === summary.cv_draft_id)?.title || "N/A",
    score: average,
    qa,
  };
}

export function InterviewWorkspace({ drafts, cvDatabase, jobs, initialSessionId, onSessionIdChange, onExamModeChange }: InterviewWorkspaceProps) {
  const [screen, setScreen] = useState<"SETUP" | "INTERVIEW" | "REPORT">("SETUP");
  
  // Choose between General vs. Job & CV Tailored
  const [interviewMode, setInterviewMode] = useState<"tailored" | "general">("tailored");
  const [generalTrack, setGeneralTrack] = useState<"SWE" | "AI">("SWE");
  const [selectedStage, setSelectedStage] = useState<InterviewStage>("phone_screen");
  const [appliedJobs, setAppliedJobs] = useState<JobPosting[]>([]);
  const [applicationsReady, setApplicationsReady] = useState(false);
  const [hiringProcess, setHiringProcess] = useState<HiringProcessResearch | null>(null);
  const [isResearchingProcess, setIsResearchingProcess] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchVersion, setResearchVersion] = useState(0);

  // Selected configuration references
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isInterviewerThinking, setIsInterviewerThinking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [apiSessionId, setApiSessionId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [reportSummary, setReportSummary] = useState<FeedbackReport | null>(null);
  const [inactivityNotice, setInactivityNotice] = useState<string | null>(null);
  const localIdCounter = useRef(0);
  const inactivityStartedAtRef = useRef(0);
  const inactivityStageRef = useRef<"idle" | "nudged" | "hinting" | "moving">("idle");
  const autoHintRef = useRef<() => void>(() => undefined);
  const autoMoveRef = useRef<() => void>(() => undefined);
  const nextLocalId = (prefix: string) => {
    localIdCounter.current += 1;
    return `${prefix}-${localIdCounter.current}`;
  };
  const resetInactivityTimer = () => {
    inactivityStartedAtRef.current = Date.now();
    inactivityStageRef.current = "idle";
    setInactivityNotice(null);
  };

  // Active exam states
  const [showConfirmStart, setShowConfirmStart] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Syllabus tracker state
  const [topics, setTopics] = useState<TopicCoverage[]>(initialTopics);
  
  // Track active session's question answers
  const [answeredQuestions, setAnsweredQuestions] = useState<QARecord[]>([]);
  const [activeQAIdx, setActiveQAIdx] = useState<number>(0);

  // Active ticking timer effect
  useEffect(() => {
    if (screen !== "INTERVIEW" || isPaused) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [screen, isPaused]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Dynamic Session History State — every completed round already persists in
  // Supabase (interview_sessions + interview_reports), so this loads the real
  // history on mount instead of caching it client-side.
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    listInterviewSessions(getInterviewUserId())
      .then((summaries) => {
        if (cancelled) return;
        setSessionHistory(summaries.map((summary) => summaryToSessionRecord(summary, drafts)));
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Could not load your practice history");
        }
      });
    return () => {
      cancelled = true;
    };
  // Only needs to run once on mount — later completions are appended locally by saveSessionToHistory.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    const loadApplications = async () => {
      try {
        const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8008").replace(/\/$/, "");
        const response = await fetch(`${apiUrl}/email-services/applications`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load application statuses");
        const applications = await response.json() as Array<{ job_id: string; status: string }>;
        const eligibleJobIds = new Set(applications.filter((application) => ["applied", "interview"].includes(application.status)).map((application) => application.job_id));
        if (active) {
          const eligibleJobs = jobs.filter((job) => eligibleJobIds.has(job.id));
          setAppliedJobs(eligibleJobs);
          const query = new URLSearchParams(window.location.search);
          const requestedJobId = query.get("jobId");
          const requestedStage = query.get("stage");
          if (requestedJobId && eligibleJobs.some((job) => job.id === requestedJobId)) {
            setSelectedJobId(requestedJobId);
          }
          if (requestedStage === "phone_screen" || requestedStage === "experience_technical") {
            setSelectedStage(requestedStage);
          }
        }
      } catch {
        if (active) setAppliedJobs([]);
      } finally {
        if (active) setApplicationsReady(true);
      }
    };
    void loadApplications();
    return () => {
      active = false;
    };
  }, [jobs]);

  const targetJobs = appliedJobs;

  const activeJob = targetJobs.find((job) => job.id === selectedJobId);
  const activeCV = cvDatabase[selectedDraftId];
  const draftSelectItems = drafts.map((draft) => ({
    value: draft.id,
    label: `${draft.title} (${draft.role})`,
  }));
  const jobSelectItems = targetJobs.map((job) => ({
    value: job.id,
    label: `${job.title} @ ${job.company}`,
  }));

  useEffect(() => {
    if (!activeJob) return;
    let active = true;
    const start = window.setTimeout(() => {
      setIsResearchingProcess(true);
      setResearchError(null);
      researchHiringProcess(activeJob.company, activeJob.title, activeJob.url)
        .then((process) => {
          if (!active) return;
          setHiringProcess(process);
          const firstSupported = process.stages.find((stage) => stage.practice_supported);
          if (firstSupported?.category === "phone_screen" || firstSupported?.category === "experience_technical") setSelectedStage(firstSupported.category);
        })
        .catch((error) => { if (active) setResearchError(error instanceof Error ? error.message : "Could not research this hiring process"); })
        .finally(() => { if (active) setIsResearchingProcess(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(start); };
  }, [activeJob, researchVersion]);

  const handleStartClick = () => {
    if (interviewMode === "tailored" && (!selectedDraftId || !activeCV)) {
      toast.error("Choose a saved CV draft before starting.");
      return;
    }
    if (interviewMode === "tailored" && !activeJob) {
      toast.error("Choose a target job before starting.");
      return;
    }
    if (interviewMode === "tailored" && !hiringProcess) {
      toast.error(isResearchingProcess ? "Wait for the hiring-process research to finish." : "Research this job's hiring process before starting.");
      return;
    }
    setShowConfirmStart(true);
  };

  const startInterview = async () => {
    if (interviewMode === "tailored" && (!activeCV || !activeJob)) {
      toast.error("Choose both a CV draft and target job before starting.");
      return;
    }
    setIsStarting(true);
    try {
      const jobDescription = interviewMode === "tailored"
        ? `${activeJob!.title} at ${activeJob!.company} (${activeJob!.location}). Required skills: ${activeJob!.skillsRequired.join(", ")}.`
        : `General ${generalTrack === "AI" ? "AI engineering" : "software engineering"} interview practice.`;
      const session = await createInterview(
        getInterviewUserId(),
        jobDescription,
        JSON.stringify(activeCV ?? {}),
        interviewMode === "tailored"
          ? (drafts.find((draft) => draft.id === selectedDraftId)?.level || "Not specified")
          : "Junior to mid-level practice",
        {
          interviewStage: interviewMode === "tailored" ? selectedStage : "experience_technical",
          jobTitle: activeJob?.title ?? null,
          company: activeJob?.company ?? null,
          cvDraftId: selectedDraftId || null,
          hiringProcess,
        }
      );
      setApiSessionId(session.id);
      onSessionIdChange?.(session.id);
      setTopics(session.config.topics.map((topic, index) => ({
        id: topic.id,
        name: topic.title,
        status: index === 0 ? "active" as const : "pending" as const,
        score: null,
      })));
      setMessages(session.state.messages.map((message, index) => ({
        id: `session-${session.id}-${index}`,
        sender: message.role,
        text: message.content,
        timestamp: new Date(),
      })));
      setAnsweredQuestions([]);
      setReportSummary(null);
      setActiveQAIdx(0);
      setTimerSeconds(0);
      setIsPaused(false);
      setShowConfirmStart(false);
      setScreen("INTERVIEW");
      resetInactivityTimer();
      onExamModeChange?.(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the AI interview");
    } finally {
      setIsStarting(false);
    }
  };

  const finishWithReport = (report: FeedbackReport, evidence: QARecord[]) => {
    const average = Math.round(Object.values(report.scores).reduce((sum, value) => sum + value, 0) * 5);
    const records = report.per_topic.map((feedback, index) => {
      const source = [...evidence].reverse().find((item) => item.topicId === feedback.topic_id);
      const topic = topics.find((item) => item.id === feedback.topic_id);
      return {
        id: `report-${feedback.topic_id}`,
        topicId: feedback.topic_id,
        question: source?.question || topic?.name || `Topic ${index + 1}`,
        answer: source?.answer || feedback.what_they_said,
        score: {
          overall: average,
          situation: reportScore(report.scores.communication),
          task: reportScore(report.scores.handling_pressure),
          action: reportScore(report.scores.technical_depth),
          result: reportScore(report.scores.specificity),
          relevance: reportScore(report.scores.communication),
          specificity: reportScore(report.scores.specificity),
          proseFeedback: feedback.verdict_summary,
          metricsPresent: /\d/.test(feedback.what_they_said),
        },
        whatWasMissing: feedback.what_was_missing,
        strongerAnswer: feedback.stronger_answer,
        delivery: source?.delivery,
      } satisfies QARecord;
    });
    setReportSummary(report);
    saveSessionToHistory(records);
  };

  const pollForReport = async (sessionId: string, evidence: QARecord[]) => {
    for (let attempt = 0; attempt < REPORT_POLL_ATTEMPTS; attempt += 1) {
      const result = await getInterviewReport(sessionId);
      if (result.status === "completed" && result.report) {
        finishWithReport(result.report, evidence);
        return;
      }
      if (result.status === "failed") throw new Error("The interview report could not be generated.");
      await new Promise((resolve) => window.setTimeout(resolve, REPORT_POLL_INTERVAL_MS));
    }
    throw new Error("The report is taking longer than expected. Please try again shortly.");
  };

  const handleSendMessage = async (text: string, delivery?: DeliveryEvidence) => {
    if (isPaused || isInterviewerThinking || !apiSessionId) return;
    resetInactivityTimer();
    const activeTopicIdx = topics.findIndex((topic) => topic.status === "active");
    const activeTopic = topics[activeTopicIdx];
    const questionText = [...messages].reverse().find((message) => message.sender === "interviewer")?.text
      || activeTopic?.name
      || "Interview question";
    const candidateMsg: Message = {
      id: nextLocalId("msg-cand"),
      sender: "candidate",
      text,
      timestamp: new Date(),
    };
    const evidence: QARecord = {
      id: nextLocalId("answer"),
      topicId: activeTopic?.id,
      question: questionText,
      answer: text,
      score: emptyScore,
      delivery,
    };
    const nextEvidence = [...answeredQuestions, evidence];
    setMessages((previous) => [...previous, candidateMsg]);
    setAnsweredQuestions(nextEvidence);
    setIsInterviewerThinking(true);
    try {
      const result = await answerInterview(apiSessionId, text, delivery);
      setMessages((previous) => [...previous, {
        id: nextLocalId("msg-int"),
        sender: "interviewer",
        text: result.interviewer_message,
        timestamp: new Date(),
      }]);
      resetInactivityTimer();
      if (result.move === "next_topic" || result.move === "complete") {
        setTopics((previous) => previous.map((topic, index) => {
          if (index === activeTopicIdx) return { ...topic, status: "completed" as const };
          if (result.move !== "complete" && index === activeTopicIdx + 1) return { ...topic, status: "active" as const };
          return topic;
        }));
      }
      if (result.session_complete) await pollForReport(apiSessionId, nextEvidence);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not analyze your answer");
    } finally {
      setIsInterviewerThinking(false);
    }
  };

  const handleSilentTimeout = async () => {
    if (isPaused || isInterviewerThinking || !apiSessionId) return;
    const activeTopicIdx = topics.findIndex((topic) => topic.status === "active");
    setInactivityNotice(null);
    setIsInterviewerThinking(true);
    try {
      const result = await timeoutInterviewTopic(apiSessionId);
      setMessages((previous) => [...previous, {
        id: nextLocalId("msg-timeout"),
        sender: "interviewer",
        text: result.interviewer_message,
        timestamp: new Date(),
      }]);
      if (result.move === "next_topic" || result.move === "complete") {
        setTopics((previous) => previous.map((topic, index) => {
          if (index === activeTopicIdx) return { ...topic, status: "completed" as const };
          if (result.move !== "complete" && index === activeTopicIdx + 1) return { ...topic, status: "active" as const };
          return topic;
        }));
        resetInactivityTimer();
      }
      if (result.session_complete) await pollForReport(apiSessionId, answeredQuestions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not request an automatic hint");
      resetInactivityTimer();
    } finally {
      setIsInterviewerThinking(false);
    }
  };

  const saveSessionToHistory = (records: QARecord[]) => {
    onExamModeChange?.(false); // Restore Normal Layout (exit fullscreen)
    if (records.length === 0) {
      setScreen("SETUP");
      return;
    }

    const finalScore = Math.round(
      records.reduce((acc, q) => acc + q.score.overall, 0) / records.length
    );
    
    const newSessionRecord: SessionRecord = {
      id: `session-${Date.now()}`,
      role: interviewMode === "general" 
        ? (generalTrack === "AI" ? "AI Engineer (General)" : "Software Engineer (General)") 
        : (activeJob?.title || "Selected role"),
      company: interviewMode === "general" ? "General Prep" : (activeJob?.company || "Selected company"),
      date: new Date().toLocaleDateString(),
      cvName: interviewMode === "general" ? "N/A" : (activeCV?.fullName || drafts.find((draft) => draft.id === selectedDraftId)?.title || "Selected CV"),
      score: finalScore,
      qa: records,
    };

    setSessionHistory((prev) => [newSessionRecord, ...prev]);
    setActiveQAIdx(0);
    setScreen("REPORT");
  };

  useEffect(() => {
    if (!initialSessionId) return;
    let active = true;
    const restore = async () => {
      setIsStarting(true);
      try {
        const session = await getInterviewSession(initialSessionId);
        if (!active) return;
        const evidence: QARecord[] = session.state.turns.map((turn, index) => ({
          id: `restored-${index}`,
          topicId: turn.topic_id,
          question: session.config.topics.find((topic) => topic.id === turn.topic_id)?.title || "Interview question",
          answer: turn.answer,
          score: emptyScore,
          delivery: turn.delivery || undefined,
        }));
        setApiSessionId(session.id);
        setTopics(session.config.topics.map((topic, index) => ({
          id: topic.id,
          name: topic.title,
          status: session.state.topic_states[index]?.completed ? "completed" : index === session.state.current_topic_index && session.status === "active" ? "active" : "pending",
          score: null,
        })));
        setMessages(session.state.messages.map((message, index) => ({ id: `session-${session.id}-${index}`, sender: message.role, text: message.content, timestamp: new Date() })));
        setAnsweredQuestions(evidence);
        if (session.status === "active") {
          setScreen("INTERVIEW");
          resetInactivityTimer();
          onExamModeChange?.(true);
        } else {
          const result = await getInterviewReport(session.id);
          if (!active) return;
          if (result.status === "completed" && result.report) finishWithReport(result.report, evidence);
          else if (result.status === "evaluating") await pollForReport(session.id, evidence);
          else throw new Error("This interview session could not be restored.");
        }
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "Could not restore this interview session");
      } finally {
        if (active) setIsStarting(false);
      }
    };
    void restore();
    return () => { active = false; };
  // The route id is the restoration boundary; callbacks intentionally use the current render state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId]);

  const handleRequestHint = () => void handleSendMessage("I'm stuck — could you rephrase that or give me a hint?");

  const handleNextTopic = async () => {
    if (isInterviewerThinking || !apiSessionId) return;

    const activeTopicIdx = topics.findIndex((topic) => topic.status === "active");
    const nextTopic = topics[activeTopicIdx + 1];

    setIsInterviewerThinking(true);
    try {
      const result = await skipInterviewTopic(apiSessionId);
      setTopics((previous) => previous.map((topic, index) => {
        if (index === activeTopicIdx) return { ...topic, status: "completed" as const };
        if (nextTopic && index === activeTopicIdx + 1) return { ...topic, status: "active" as const };
        return topic;
      }));
      setMessages((previous) => [...previous, { id: nextLocalId("msg-skip"), sender: "interviewer", text: result.interviewer_message, timestamp: new Date() }]);
      resetInactivityTimer();
      if (result.session_complete) await pollForReport(apiSessionId, answeredQuestions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not skip this topic");
    } finally {
      setIsInterviewerThinking(false);
    }
  };

  const handleFinishEarly = async () => {
    if (answeredQuestions.length === 0) {
      toast.error("Please answer at least one question before terminating the mock round early.");
      return;
    }
    if (!apiSessionId) return;
    setIsInterviewerThinking(true);
    try {
      await endInterview(apiSessionId);
      await pollForReport(apiSessionId, answeredQuestions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not finish the interview");
    } finally {
      setIsInterviewerThinking(false);
    }
  };

  const handlePauseSession = async () => {
    if (!apiSessionId) return;
    try {
      await recordInterviewEvent(apiSessionId, "paused", { elapsed_seconds: timerSeconds });
      setIsPaused(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not pause this interview");
    }
  };

  const handleResumeSession = async () => {
    if (!apiSessionId) return;
    try {
      await recordInterviewEvent(apiSessionId, "resumed", { elapsed_seconds: timerSeconds });
      setIsPaused(false);
      resetInactivityTimer();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resume this interview");
    }
  };

  const handleQuitInterview = async () => {
    if (!apiSessionId) return;
    try {
      await abandonInterview(apiSessionId);
      onExamModeChange?.(false);
      setApiSessionId(null);
      setScreen("SETUP");
      onSessionIdChange?.(null);
      toast.info("Interview saved as abandoned. You can start a fresh round when ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save and quit this interview");
    }
  };

  const handleViewPastSessionReport = (session: SessionRecord) => {
    setReportSummary(null);
    setAnsweredQuestions(session.qa);
    setTopics(initialTopics.map((t) => {
      const qaMatch = session.qa.find((q) => q.id === `record-${t.id}`);
      return {
        ...t,
        status: qaMatch ? "completed" as const : "pending" as const,
        score: qaMatch ? qaMatch.score.overall : null,
      };
    }));
    setActiveQAIdx(0);
    setScreen("REPORT");
  };

  const activeQA = answeredQuestions[activeQAIdx] || answeredQuestions[0];
  const activeScore = activeQA?.score || {
    overall: 80,
    situation: 95,
    task: 90,
    action: 85,
    result: 90,
    relevance: 95,
    specificity: 90,
    proseFeedback: "Select an answered question from the feed list on the left to inspect its detailed STAR scoring and quality parameters.",
    metricsPresent: true,
  };

  const practiceSelectedQuestion = () => {
    if (!activeQA) return;
    setScreen("SETUP");
    toast.info("Start a new AI interview to practise this area with fresh follow-up questions.");
  };

  useEffect(() => {
    autoHintRef.current = () => void handleSilentTimeout();
    autoMoveRef.current = () => void handleNextTopic();
  });

  useEffect(() => {
    if (screen !== "INTERVIEW" || isPaused || !apiSessionId) return;
    if (inactivityStartedAtRef.current === 0) inactivityStartedAtRef.current = Date.now();

    const interval = window.setInterval(() => {
      if (isInterviewerThinking) return;
      const elapsed = Date.now() - inactivityStartedAtRef.current;

      if (elapsed >= INACTIVITY_MOVE_MS && inactivityStageRef.current !== "moving") {
        inactivityStageRef.current = "moving";
        setInactivityNotice("No problem. Moving to the next topic...");
        autoMoveRef.current();
      } else if (
        elapsed >= INACTIVITY_HINT_MS
        && (inactivityStageRef.current === "idle" || inactivityStageRef.current === "nudged")
      ) {
        inactivityStageRef.current = "hinting";
        autoHintRef.current();
      } else if (elapsed >= INACTIVITY_NUDGE_MS && inactivityStageRef.current === "idle") {
        inactivityStageRef.current = "nudged";
        setInactivityNotice("Take your time. You can type, speak, or ask for a hint.");
      }
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [apiSessionId, isInterviewerThinking, isPaused, screen]);

  return (
    <div className="flex-1 flex flex-col space-y-6">
      
      {/* Confirm Start Dialog */}
      <Dialog open={showConfirmStart} onOpenChange={setShowConfirmStart}>
        <DialogContent className="sm:max-w-md bg-white border-zinc-200 text-xs shadow-none">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-1.5 text-zinc-800">
              <ClipboardList className="h-5 w-5 text-zinc-550" />
              Confirm Assessment Setup
            </DialogTitle>
            <DialogDescription className="text-[11px] text-zinc-500">
              Please review your mock track details before entering fullscreen simulation.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/50 space-y-3">
            <div className="flex justify-between">
              <span className="font-semibold text-zinc-500">Mode:</span>
              <span className="font-bold text-zinc-800 capitalize">{interviewMode} Track</span>
            </div>
            
            {interviewMode === "general" ? (
              <div className="flex justify-between">
                <span className="font-semibold text-zinc-500">Selected Syllabus:</span>
                <span className="font-bold text-zinc-800">{generalTrack === "AI" ? "AI Engineer" : "Software Engineering"}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="font-semibold text-zinc-500">Resume profile:</span>
                  <span className="font-bold text-zinc-800 truncate max-w-[200px]">{activeCV?.fullName || drafts.find((draft) => draft.id === selectedDraftId)?.title || "Not selected"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-zinc-500">Target Role:</span>
                  <span className="font-bold text-zinc-850 truncate max-w-[200px]">{activeJob?.title || "Not selected"}</span>
                </div>
              </>
            )}

            <div className="pt-2 border-t border-zinc-200 text-[10px] leading-relaxed text-zinc-500 italic">
              ⚠️ Note: This session runs in a fullscreen exam environment. You must complete or trigger &quot;Finish Early&quot; to exit back to the setup dashboard.
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmStart(false)}
              className="h-9 text-[11px] font-semibold border-zinc-200 shadow-none"
            >
              Cancel
            </Button>
            <Button
              onClick={startInterview}
              disabled={isStarting}
              className="h-9 text-[11px] font-semibold bg-zinc-900 text-white hover:bg-zinc-800 shadow-none border-none"
            >
              {isStarting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing CV-based questions...</> : "Begin Assessment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {screen === "SETUP" && (
        <div className="space-y-5 animate-in fade-in-50 duration-300">
          <div className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-zinc-800">
            <div>
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Interview Practice</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Practise for the interview you actually have</h1>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500">Use a job and CV for targeted questions, or choose a general engineering track.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500"><span className="font-semibold text-zinc-800 dark:text-zinc-200">1. Set up</span><ChevronRight className="h-3.5 w-3.5" /><span>2. Practise</span><ChevronRight className="h-3.5 w-3.5" /><span>3. Review</span></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start text-sm">
          
          {/* Setup Inputs Card */}
          <Card className="lg:col-span-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-none">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Choose your practice type
              </CardTitle>
              <CardDescription className="text-xs text-zinc-450 dark:text-zinc-555">
                You can change this before starting the session.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Practice type</label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setInterviewMode("tailored")}
                    className={cn(
                      "min-h-24 rounded-xl border p-4 text-left transition-colors",
                      interviewMode === "tailored"
                        ? "border-indigo-500 bg-indigo-50/60 text-zinc-900 ring-1 ring-indigo-500 dark:bg-indigo-950/20 dark:text-zinc-100"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400"
                    )}
                  >
                    <span className="block text-sm font-bold">Job and CV tailored</span><span className="mt-1 block text-xs font-normal leading-relaxed text-zinc-500">Questions based on the saved draft and job you choose below.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInterviewMode("general")}
                    className={cn(
                      "min-h-24 rounded-xl border p-4 text-left transition-colors",
                      interviewMode === "general"
                        ? "border-indigo-500 bg-indigo-50/60 text-zinc-900 ring-1 ring-indigo-500 dark:bg-indigo-950/20 dark:text-zinc-100"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400"
                    )}
                  >
                    <span className="block text-sm font-bold">General practice</span><span className="mt-1 block text-xs font-normal leading-relaxed text-zinc-500">Build confidence with common engineering questions.</span>
                  </button>
                </div>
              </div>

              {interviewMode === "general" ? (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <label className="font-semibold text-zinc-500">Select General Track</label>
                  <Select
                    value={generalTrack}
                    onValueChange={(val) => {
                      if (val === "SWE" || val === "AI") setGeneralTrack(val);
                    }}
                  >
                    <SelectTrigger className="w-full h-9 bg-white dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-none">
                      <SelectValue placeholder="Select track" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SWE">Software Engineer (SWE)</SelectItem>
                      <SelectItem value="AI">AI Developer / ML Engineer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-zinc-500">Choose CV draft</label>
                    <Select items={draftSelectItems} value={selectedDraftId} onValueChange={(value) => setSelectedDraftId(value ?? "")}>
                      <SelectTrigger className="w-full h-9 bg-white dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-none"><SelectValue placeholder="Select a saved CV draft" /></SelectTrigger>
                      <SelectContent>{drafts.map((draft) => <SelectItem key={draft.id} value={draft.id}>{draft.title} ({draft.role})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-zinc-500">Choose an applied job</label>
                    <Select items={jobSelectItems} value={selectedJobId} onValueChange={(val) => { if (val) { setSelectedJobId(val); setHiringProcess(null); setResearchError(null); } }}>
                      <SelectTrigger disabled={!applicationsReady || targetJobs.length === 0} className="w-full h-9 bg-white dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-none">
                        <SelectValue placeholder={applicationsReady && targetJobs.length === 0 ? "No applied jobs yet" : "Select an applied job"} />
                      </SelectTrigger>
                      <SelectContent>
                        {targetJobs.map((j) => (
                          <SelectItem key={j.id} value={j.id}>
                            {j.title} @ {j.company}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {applicationsReady && targetJobs.length === 0 && <p className="text-[11px] text-amber-700">Move a job to Applied or Interview in the Applications board before practising.</p>}
                  </div>

                  {activeJob && (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Researched hiring process</p><p className="mt-1 text-[11px] text-zinc-500">Expected interview stages for {activeJob.company}.</p></div>
                        {hiringProcess && <Badge variant="secondary" className="text-[9px]">{Math.round(hiringProcess.confidence * 100)}% confidence</Badge>}
                      </div>
                      {isResearchingProcess && <div className="mt-4 flex items-center gap-2 rounded-lg bg-white p-4 text-xs text-zinc-500 dark:bg-zinc-900"><Loader2 className="h-4 w-4 animate-spin text-indigo-600" />Tavily is checking company and candidate-reported sources...</div>}
                      {researchError && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><p>{researchError}</p><button type="button" onClick={() => setResearchVersion((version) => version + 1)} className="mt-2 font-bold underline">Retry research</button></div>}
                      {hiringProcess && <>
                        <p className="mt-3 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">{hiringProcess.summary}</p>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {hiringProcess.stages.map((stage, index) => {
                            const supported = stage.practice_supported && (stage.category === "phone_screen" || stage.category === "experience_technical");
                            const Icon = stage.category === "phone_screen" ? PhoneCall : stage.category === "experience_technical" ? MessagesSquare : Code2;
                            return <div key={`${stage.name}-${index}`} className={cn("rounded-lg border p-3 text-left", supported ? selectedStage === stage.category ? "border-indigo-500 bg-white ring-1 ring-indigo-500 dark:bg-zinc-900" : "border-zinc-200 bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/50" : "border-dashed border-zinc-300 opacity-75 dark:border-zinc-700")}>
                              <button type="button" disabled={!supported} onClick={() => { if (supported) setSelectedStage(stage.category as InterviewStage); }} className="w-full text-left disabled:cursor-default"><Icon className="h-4 w-4 text-indigo-600" /><span className="mt-2 block text-xs font-bold">{index + 1}. {stage.name}</span><span className="mt-1 block text-[10px] leading-relaxed text-zinc-500">{stage.description}</span><span className="mt-2 block text-[9px] font-semibold text-zinc-400">{supported ? "Available to practise" : "Shown for context, outside Athena"} · {Math.round(stage.confidence * 100)}%</span></button>
                              {stage.evidence.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{stage.evidence.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="text-[9px] font-semibold text-indigo-600 hover:underline">Source</a>)}</div>}
                            </div>;
                          })}
                        </div>
                      </>}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4">
                <Button
                  onClick={handleStartClick}
                  className="w-full h-10 rounded-lg bg-zinc-900 text-white font-semibold text-xs hover:bg-zinc-800 transition-colors shadow-none border-none"
                >
                  Review and start
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Practice History log */}
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-none h-fit">
            <CardHeader className="pb-3 border-b border-zinc-200/20 dark:border-zinc-800/20">
              <CardTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <RotateCcw className="h-4 w-4 text-zinc-400" />
                Recent practice
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {sessionHistory.length === 0 ? (
                <div className="text-center py-6 text-zinc-450">
                  No practice sessions conducted yet.
                </div>
              ) : (
                sessionHistory.map((session) => (
                  <div key={session.id} className="flex flex-col p-3 rounded-lg border border-zinc-150/60 dark:border-zinc-850 bg-white/30 dark:bg-zinc-955/20 text-xs">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1 pr-2">
                        <h4 className="font-bold text-zinc-800 dark:text-zinc-200 truncate">{session.role}</h4>
                        <p className="text-zinc-455 dark:text-zinc-555 text-[9px] mt-0.5 truncate">{session.company} • {session.date}</p>
                      </div>
                      
                      {/* Low saturation score badge */}
                      <Badge className="font-bold text-[10px] bg-zinc-100 text-zinc-800 border border-zinc-250 dark:bg-zinc-800 dark:text-zinc-250 shrink-0 px-2 py-0.5 shadow-none">
                        {session.score}%
                      </Badge>
                    </div>

                    {session.cvName !== "N/A" && (
                      <div className="text-[9px] text-zinc-500 mt-2 italic truncate">
                        CV: &quot;{session.cvName}&quot;
                      </div>
                    )}

                    <button
                      onClick={() => handleViewPastSessionReport(session)}
                      className="mt-3 text-[10px] font-bold text-zinc-650 hover:text-zinc-900 hover:underline flex items-center gap-1 text-left"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      View STAR Report Card
                    </button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          </div>
        </div>
      )}

      {screen === "INTERVIEW" && (
        <div className="flex flex-col flex-1 min-h-0 space-y-6 animate-in fade-in-50 duration-300 relative text-xs h-screen w-full px-4 md:px-8 py-6 bg-zinc-50 dark:bg-zinc-950">
          
          {/* Paused Overlay Container */}
          {isPaused && (
            <div className="absolute inset-0 z-45 bg-zinc-955/65 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 space-y-4 text-white">
              <div className="h-12 w-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 animate-pulse">
                <Pause className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider">Practice Session Paused</h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-xs">Your mock interview evaluation timer is suspended.</p>
              </div>
              <Button
                onClick={() => {
                  void handleResumeSession();
                }}
                className="h-10 px-6 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-none border-none"
              >
                <Play className="h-4 w-4 fill-zinc-900" />
                Resume Interview
              </Button>
            </div>
          )}

          {/* Active Interview Simulator Header with pulsing Timer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-base font-extrabold tracking-tight text-zinc-800 dark:text-zinc-100">
                  Interactive Mock Interview (Blind Mode)
                </h1>
                
                {/* Timer Clock Badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 border border-zinc-250/20 text-[11px] font-mono text-zinc-700 font-bold">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                  </span>
                  <Timer className="h-3 w-3 text-zinc-500" />
                  {formatTimer(timerSeconds)}
                </div>
              </div>
              
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {interviewMode === "general" ? (
                  <span>General Practice Track: <strong className="text-zinc-700 dark:text-zinc-300">{generalTrack === "AI" ? "AI Engineer" : "Software Engineer (SWE)"}</strong></span>
                ) : (
                  <span><strong className="text-zinc-700 dark:text-zinc-300">{selectedStage === "phone_screen" ? "Phone screen" : "Technical conversation"}</strong> · {activeCV?.fullName || "Selected CV"} for {activeJob?.title || "Selected job"}</span>
                )}
              </p>
            </div>

            {/* Session Control Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequestHint}
                disabled={isInterviewerThinking}
                className="h-9 text-[11px] border-zinc-250 hover:bg-zinc-100 flex items-center gap-1 px-3 font-semibold text-zinc-750 shadow-none"
              >
                <HelpCircle className="h-3.5 w-3.5" /> Hint
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextTopic}
                disabled={isInterviewerThinking}
                className="h-9 text-[11px] border-zinc-250 hover:bg-zinc-100 flex items-center gap-1 px-3 font-semibold text-zinc-750 shadow-none"
              >
                Next topic <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handlePauseSession()}
                className="h-9 text-[11px] border-zinc-250 hover:bg-zinc-100 flex items-center gap-1 px-3 font-semibold text-zinc-750 shadow-none"
              >
                <Pause className="h-3.5 w-3.5" />
                Pause
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFinishEarly}
                className="h-9 text-[11px] border-zinc-250 hover:bg-zinc-100 text-amber-700 flex items-center gap-1 px-3 font-semibold shadow-none"
              >
                Finish Early
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleQuitInterview()}
                className="h-9 text-[11px] border-zinc-250 text-rose-700 hover:bg-rose-50 flex items-center gap-1 px-3 font-semibold shadow-none"
              >
                Quit Loop
              </Button>
            </div>
          </div>

          {/* Chat Feed */}
          <div className="mx-auto w-full max-w-7xl flex-1 min-h-0">
            <InterviewChat
              messages={messages}
              onSendMessage={handleSendMessage}
              isInterviewerThinking={isInterviewerThinking}
              inactivityNotice={inactivityNotice}
              onInputActivity={resetInactivityTimer}
            />
          </div>
        </div>
      )}

      {screen === "REPORT" && (
        <div className="max-w-6xl mx-auto w-full space-y-6 animate-in zoom-in-95 duration-300 text-xs">
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-550">
                Technical Assessment Report Card
              </h1>
              <p className="text-xs text-zinc-550">
                Mock evaluation details for {interviewMode === "general" ? `${generalTrack === "AI" ? "AI Engineer" : "Software Engineer (SWE)"}` : `${activeJob?.title || "selected job"}`}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setScreen("SETUP")}
                className="h-9 px-4 bg-zinc-900 text-white font-semibold hover:bg-zinc-800 flex items-center gap-1.5 shadow-none border-none"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Setup & History
              </Button>
            </div>
          </div>

          {reportSummary && (
            <Card className="border-indigo-200 bg-indigo-50/50 shadow-none dark:border-indigo-900/60 dark:bg-indigo-950/20">
              <CardContent className="p-5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">AI coach summary</p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">{reportSummary.overall}</p>
                <p className="mt-3 text-xs font-semibold text-indigo-900 dark:text-indigo-200">Focus next: {reportSummary.one_thing}</p>
              </CardContent>
            </Card>
          )}

          {/* Question navigator and selected-answer coaching workspace */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            
            {/* Left Timeline Column */}
            <div className="xl:col-span-2 space-y-4">
              <h3 className="text-xs font-bold text-zinc-450 uppercase tracking-wider px-1">
                Questions & answers
              </h3>
              <div className="space-y-3 overflow-y-auto max-h-[680px] pr-2">
                {answeredQuestions.map((item, idx) => {
                  const isActive = activeQAIdx === idx;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveQAIdx(idx)}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border text-xs transition-all shadow-none flex items-start justify-between gap-3",
                        isActive
                          ? "border-zinc-800 bg-zinc-100/50 dark:bg-zinc-800/20"
                          : "border-zinc-200 dark:border-zinc-800 bg-white hover:bg-zinc-50 dark:bg-zinc-900/40"
                      )}
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <h4 className="font-bold text-zinc-800 dark:text-zinc-200 truncate">
                          Q{idx + 1}: {item.question}
                        </h4>
                        <p className="text-zinc-455 dark:text-zinc-555 line-clamp-2">
                          Your response: &quot;{item.answer}&quot;
                        </p>
                      </div>
                      
                      {/* Low saturation overall indicator badge */}
                      <Badge className={cn(
                        "font-bold text-[10px] border shrink-0 shadow-none",
                        item.score.overall >= 80 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/20 dark:text-emerald-400" 
                          : "bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-955/20 dark:text-amber-400"
                      )}>
                        {item.score.overall}%
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="xl:col-span-3 space-y-4">
              <Card className="border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-zinc-900">
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Selected question</p><h2 className="mt-1 text-base font-bold leading-snug text-zinc-900 dark:text-zinc-100">{activeQA?.question}</h2></div>
                    <div className="shrink-0 rounded-lg bg-emerald-50 px-3 py-2 text-center text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"><span className="block text-xl font-black">{activeScore.overall}</span><span className="text-[9px] font-bold uppercase">Overall</span></div>
                  </div>
                  <div className="mt-4 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-950"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Your answer</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{activeQA?.answer}</p></div>
                  {activeQA?.delivery && (
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"><span className="block text-sm font-bold">{Math.round(activeQA.delivery.duration_seconds)}s</span><span className="text-[9px] uppercase text-zinc-500">Duration</span></div>
                      <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"><span className="block text-sm font-bold">{Math.round(activeQA.delivery.words_per_minute)}</span><span className="text-[9px] uppercase text-zinc-500">Words/min</span></div>
                      <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"><span className="block text-sm font-bold">{activeQA.delivery.filler_words}</span><span className="text-[9px] uppercase text-zinc-500">Fillers</span></div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-zinc-900">
                <CardHeader className="pb-3"><CardTitle className="text-sm font-bold">{reportSummary ? "AI evaluation" : "STAR breakdown"}</CardTitle></CardHeader>
                <CardContent className="text-xs">
                  <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
                    {(reportSummary
                      ? [["Specificity", reportScore(reportSummary.scores.specificity)], ["Technical depth", reportScore(reportSummary.scores.technical_depth)], ["Communication", reportScore(reportSummary.scores.communication)], ["Under pressure", reportScore(reportSummary.scores.handling_pressure)]]
                      : [["Situation", activeScore.situation], ["Task", activeScore.task], ["Action", activeScore.action], ["Result", activeScore.result]]
                    ).map(([label, value]) => <div key={String(label)}><div className="mb-1.5 flex justify-between font-semibold"><span>{label}</span><span>{value}%</span></div><Progress value={Number(value)} className="h-1.5 bg-zinc-100 [&>div]:bg-zinc-800 dark:bg-zinc-800 dark:[&>div]:bg-zinc-200" /></div>)}
                  </div>
                  {(reportSummary?.score_evidence?.length ?? 0) > 0 && (
                    <div className="mt-4 grid gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:grid-cols-2">
                      {reportSummary?.score_evidence?.map((item) => (
                        <p key={item.dimension} className="rounded-lg bg-zinc-50 p-2.5 leading-relaxed text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300">
                          <span className="font-semibold capitalize">{item.dimension.replace("_", " ")}:</span> {item.evidence}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {(reportSummary?.cv_suggestions?.length ?? 0) > 0 && (
                <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900/60 dark:bg-violet-950/20">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-violet-900 dark:text-violet-200"><Sparkles className="h-4 w-4" />Feedback connected to your CV</h3>
                  <p className="mt-1 text-xs text-violet-900/70 dark:text-violet-200/70">These exact-bullet suggestions will appear the next time you tailor your CV.</p>
                  <div className="mt-3 space-y-2">
                    {reportSummary?.cv_suggestions?.map((suggestion) => (
                      <div key={`${suggestion.item_id}-${suggestion.issue}`} className="rounded-lg border border-violet-200/70 bg-white/70 p-3 text-xs dark:border-violet-900 dark:bg-zinc-950/50">
                        <p className="font-medium text-zinc-800 dark:text-zinc-200">“{suggestion.source_bullet}”</p>
                        <p className="mt-1 text-zinc-600 dark:text-zinc-400">{suggestion.suggestion}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20"><h3 className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />What worked</h3><p className="mt-2 text-xs leading-relaxed text-emerald-900/75 dark:text-emerald-200/70">Your answer was relevant ({activeScore.relevance}%) and technically specific ({activeScore.specificity}%). {activeScore.metricsPresent ? "You supported it with measurable evidence." : "Your explanation stayed focused on the question."}</p></section>
                <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20"><h3 className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4" />Improve next</h3><p className="mt-2 text-xs leading-relaxed text-amber-900/75 dark:text-amber-200/70">{activeQA?.whatWasMissing || activeScore.proseFeedback}</p></section>
              </div>

              <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5 dark:border-indigo-900/60 dark:bg-indigo-950/20"><h3 className="flex items-center gap-2 text-sm font-bold text-indigo-900 dark:text-indigo-200"><Sparkles className="h-4 w-4" />A stronger answer</h3><p className="mt-2 text-xs leading-relaxed text-indigo-900/75 dark:text-indigo-200/70">{activeQA?.strongerAnswer || "Start with one sentence of context and your responsibility. Explain the specific technical action and trade-off, then end with a measurable result grounded in your experience."}</p></section>

              <div className="flex flex-wrap gap-2"><Button onClick={practiceSelectedQuestion} className="bg-zinc-900 text-white hover:bg-zinc-800"><RotateCcw className="mr-1.5 h-4 w-4" />Practise this question again</Button><Button variant="outline" onClick={() => setScreen("SETUP")}>Start another interview</Button></div>

              <InterviewCoverage coverage={topics} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helpers & initial states

const initialTopics: TopicCoverage[] = [
  { id: "topic-1", name: "Next.js & React 19", status: "pending", score: null },
  { id: "topic-2", name: "Tailwind CSS & Styling Pipelines", status: "pending", score: null },
  { id: "topic-3", name: "Web Performance Optimization", status: "pending", score: null },
  { id: "topic-4", name: "UI Polish & Animation Mechanics", status: "pending", score: null },
  { id: "topic-5", name: "Contracts & Collaboration", status: "pending", score: null },
];

const ArrowLeft = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
  </svg>
);
