"use client";

import React, { useState, useEffect } from "react";
import { InterviewChat, Message } from "./interview-chat";
import { InterviewCoverage, TopicCoverage } from "./interview-coverage";
import { InterviewScorecard, ScoreBreakdown } from "./interview-scorecard";
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
import { HelpCircle, Star, Sparkles, RotateCcw, CheckCircle2, ChevronRight, FileText, AlertTriangle, Play, Pause, AlertCircle, RefreshCw, Timer, ClipboardList, BookOpen, Building2, Network, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CVDraft } from "../drafts-dashboard";
import { CVData } from "../cv-editor/cv-pdf-preview";

interface InterviewWorkspaceProps {
  drafts: CVDraft[];
  cvDatabase: Record<string, CVData>;
  onExamModeChange?: (active: boolean) => void;
}

export interface QARecord {
  id: string;
  question: string;
  answer: string;
  score: ScoreBreakdown;
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

export function InterviewWorkspace({ drafts, cvDatabase, onExamModeChange }: InterviewWorkspaceProps) {
  const [screen, setScreen] = useState<"SETUP" | "INTERVIEW" | "REPORT">("SETUP");
  
  // Choose between General vs. Job & CV Tailored
  const [interviewMode, setInterviewMode] = useState<"tailored" | "general">("tailored");
  const [generalTrack, setGeneralTrack] = useState<"SWE" | "AI">("SWE");
  const [questionFocus, setQuestionFocus] = useState<"general" | "domain" | "system-design" | "mixed">("general");

  // Selected configuration references
  const [selectedDraftId, setSelectedDraftId] = useState(drafts[0]?.id || "");
  const [selectedJobId, setSelectedJobId] = useState("job-2"); // Default to Senior Frontend Architect
  const [messages, setMessages] = useState<Message[]>([]);
  const [isInterviewerThinking, setIsInterviewerThinking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

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

  // Dynamic Session History State
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>([
    {
      id: "session-1",
      role: "Senior Frontend Architect",
      company: "Vercel Partner Studio",
      date: "2026-07-20",
      cvName: "Kian Nguyen (v2 - optimized)",
      score: 88,
      qa: [
        {
          id: "record-topic-1",
          question: "Can you describe your experience implementing the App Router in client-side applications, and how you design patterns for custom data caching?",
          answer: "At Macquarie University, I handled 300,000+ requests with Next.js App Router and dynamic client-side pagination, using context boundaries to cache and deduplicate queries.",
          score: {
            overall: 90,
            situation: 95,
            task: 90,
            action: 85,
            result: 90,
            relevance: 95,
            specificity: 90,
            proseFeedback: "Excellent coverage of the React 19 concurrent features. Your explanation of server-side boundaries was clear, and you described the caching challenges using precise state terms.",
            metricsPresent: true,
          }
        },
        {
          id: "record-topic-2",
          question: "How do you organize your styling configuration in Tailwind v4, and what steps do you take to construct reusable custom layouts with shadcn components?",
          answer: "I structure styles inside globals.css using the new Tailwind v4 theme syntax. I set up custom layouts using shadcn component declarations that consume design tokens, securing a consistent design language.",
          score: {
            overall: 85,
            situation: 80,
            task: 90,
            action: 85,
            result: 85,
            relevance: 90,
            specificity: 80,
            proseFeedback: "Good explanation of utility class organization in Tailwind v4. The structure was coherent, but you could emphasize how theme extension variables are declared inside CSS instead of tailwind.config.",
            metricsPresent: false,
          }
        }
      ]
    }
  ]);

  // Target mock jobs catalog
  const targetJobs = [
    { id: "job-1", title: "Backend Engineer (Java / Spring Boot)", company: "InnovateTech Solutions" },
    { id: "job-2", title: "Senior Frontend Architect", company: "Vercel Partner Studio" },
    { id: "job-3", title: "AI Engineer & Full Stack developer", company: "CognitiveAgents Corp" },
  ];

  const activeJob = targetJobs.find((j) => j.id === selectedJobId) || targetJobs[1];
  const activeCV = cvDatabase[selectedDraftId];

  const handleStartClick = () => {
    setShowConfirmStart(true);
  };

  const startInterview = () => {
    setShowConfirmStart(false);
    setScreen("INTERVIEW");
    setIsPaused(false);
    setTimerSeconds(0);
    onExamModeChange?.(true); // Toggle Fullscreen Exam Room

    let initialText = "";

    if (questionFocus === "mixed") {
      initialText = `This will be a mixed interview covering technical fundamentals, ${interviewMode === "tailored" ? `${activeJob.company}'s domain, ` : "product-domain thinking, "}and system design. Let's begin with a general knowledge question: ${generalTrack === "AI" ? "How would you evaluate the quality of a retrieval-augmented generation system?" : "How do you decide between synchronous and asynchronous processing in a production application?"}`;
    } else if (questionFocus === "system-design") {
      initialText = interviewMode === "tailored"
        ? `You are designing a production system for ${activeJob.company}. Walk me through the architecture, data flow, scaling assumptions, failure modes, and trade-offs you would consider for a platform used by this ${activeJob.title} team.`
        : `Design a production-grade ${generalTrack === "AI" ? "retrieval-augmented AI platform" : "high-traffic collaboration platform"}. Start with requirements, then explain your architecture, data model, scaling strategy, failure handling, and trade-offs.`;
    } else if (questionFocus === "domain") {
      initialText = interviewMode === "tailored"
        ? `What do you understand about ${activeJob.company}'s domain, users, and likely technical constraints? For the ${activeJob.title} role, identify one important product or engineering problem and explain how you would approach it.`
        : `Choose a company or product domain you know well. Explain its users, business model, technical constraints, and one engineering decision that is especially important in that domain.`;
    } else if (interviewMode === "general") {
      if (generalTrack === "AI") {
        initialText = "Hello! Welcome to your technical mock interview preparation session for general AI Engineering. We will evaluate your knowledge in AI agents, LangChain loops, and vector database indexing. Can you start by explaining how you design retrieval-augmented generation (RAG) pipelines and handle chunking?";
      } else {
        initialText = "Hello! Welcome to your technical mock interview preparation session for general Software Engineering (SWE). We will evaluate your core engineering background in APIs, concurrency hazards, and caching patterns. Can you start by explaining how you structure full-stack applications?";
      }
    } else {
      const candidateName = activeCV?.fullName || "Candidate";
      const firstCompany = activeCV?.experience?.[0]?.company || "previous employer";
      const keyProject = activeCV && "projects" in activeCV 
        ? (activeCV as any).projects?.[0]?.name 
        : "academic projects";

      initialText = `Hello ${candidateName}! Welcome to your technical mock interview for the ${activeJob.title} position at ${activeJob.company}. I've reviewed your customized resume, particularly your software work at ${firstCompany} and your project '${keyProject}'. Let's start with a core topic: can you describe how you architected state updates, dynamic data caching, or concurrent hazards in these systems?`;
    }

    setMessages([
      {
        id: "msg-init",
        sender: "interviewer",
        text: initialText,
        timestamp: new Date(),
      },
    ]);
    setTopics(initialTopics.map((t, idx) => (idx === 0 ? { ...t, status: "active" } : t)));
    setAnsweredQuestions([]);
    setActiveQAIdx(0);
  };

  const handleSendMessage = (text: string) => {
    if (isPaused) return;

    const activeTopicIdx = topics.findIndex((t) => t.status === "active");
    const activeTopic = topics[activeTopicIdx];

    const lastQuestionMsg = [...messages].reverse().find((m) => m.sender === "interviewer");
    const questionText = lastQuestionMsg ? lastQuestionMsg.text : "Can you detail your technical decisions?";

    const candidateMsg: Message = {
      id: `msg-cand-${Date.now()}`,
      sender: "candidate",
      text,
      timestamp: new Date(),
    };

    setMessages((prev) => {
      if (prev.some((m) => m.id === candidateMsg.id || (m.text === text && m.sender === "candidate" && Date.now() - m.timestamp.getTime() < 500))) {
        return prev;
      }
      return [...prev, candidateMsg];
    });
    setIsInterviewerThinking(true);

    setTimeout(() => {
      const mockResultScore: ScoreBreakdown = generateMockScore(activeTopicIdx, text);

      const newAnswerRecord: QARecord = {
        id: `record-${activeTopic.id}`,
        question: questionText,
        answer: text,
        score: mockResultScore,
      };
      setAnsweredQuestions((prev) => {
        if (prev.some((r) => r.id === newAnswerRecord.id)) return prev;
        return [...prev, newAnswerRecord];
      });

      setTopics((prev) =>
        prev.map((t, idx) => {
          if (idx === activeTopicIdx) {
            return { ...t, status: "completed", score: mockResultScore.overall };
          }
          if (idx === activeTopicIdx + 1) {
            return { ...t, status: "active" };
          }
          return t;
        })
      );

      const nextTopic = topics[activeTopicIdx + 1];
      if (nextTopic) {
        const mixedStage = (activeTopicIdx + 1) % 3;
        const nextQuestion = questionFocus === "mixed" && mixedStage === 1
          ? `For ${interviewMode === "tailored" ? activeJob.company : "a product company"}, what domain constraints and user needs would most influence your engineering decisions?`
          : questionFocus === "mixed" && mixedStage === 2
            ? `Design a scalable system for this domain. Explain the requirements, architecture, data model, failure modes, and the main trade-off you would make.`
            : questionFocus === "domain"
              ? `How would ${interviewMode === "tailored" ? activeJob.company : "a company in this domain"} balance user needs, business constraints, and technical risk for ${nextTopic.name}?`
              : questionFocus === "system-design"
                ? `Design the ${nextTopic.name} part of a production platform. Cover scale, reliability, data flow, and trade-offs.`
                : getNextQuestion(nextTopic.id);
        const interviewerMsg: Message = {
          id: `msg-int-${Date.now()}`,
          sender: "interviewer",
          text: `Got it. Let's move on to the next topic, which is ${nextTopic.name}: ${nextQuestion}`,
          timestamp: new Date(),
        };

        setMessages((prev) => {
          if (prev.some((m) => m.text === interviewerMsg.text && m.sender === "interviewer")) {
            return prev;
          }
          return [...prev, interviewerMsg];
        });
      } else {
        setTimeout(() => {
          saveSessionToHistory([...answeredQuestions, newAnswerRecord]);
        }, 1500);
      }

      setIsInterviewerThinking(false);
    }, 2000);
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
        : activeJob.title,
      company: interviewMode === "general" ? "General Prep" : activeJob.company,
      date: new Date().toLocaleDateString(),
      cvName: interviewMode === "general" ? "N/A" : (activeCV?.fullName || "Kian Nguyen"),
      score: finalScore,
      qa: records,
    };

    setSessionHistory((prev) => [newSessionRecord, ...prev]);
    setActiveQAIdx(0);
    setScreen("REPORT");
  };

  const handleRequestHint = () => {
    const activeTopicIdx = topics.findIndex((t) => t.status === "active");
    const activeTopic = topics[activeTopicIdx] || topics[0];

    const hintMsg: Message = {
      id: `msg-hint-${Date.now()}`,
      sender: "interviewer",
      text: `💡 [Hint Tip]: For ${activeTopic.name}, ensure your answer discusses exact design patterns, libraries, or numbers (e.g. Next.js cache APIs or 300k+ requests) to secure a higher STAR rating!`,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, hintMsg]);
  };

  const handleFinishEarly = () => {
    if (answeredQuestions.length === 0) {
      toast.error("Please answer at least one question before terminating the mock round early.");
      return;
    }
    saveSessionToHistory(answeredQuestions);
  };

  const handleQuitLoop = () => {
    onExamModeChange?.(false); // Exit fullscreen exam mode
    setScreen("SETUP");
  };

  const handleViewPastSessionReport = (session: SessionRecord) => {
    setAnsweredQuestions(session.qa);
    setTopics(initialTopics.map((t, idx) => {
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
    setMessages([{ id: `retry-${activeQA.id}`, sender: "interviewer", text: activeQA.question, timestamp: new Date() }]);
    setAnsweredQuestions([]);
    setTimerSeconds(0);
    setScreen("INTERVIEW");
    onExamModeChange?.(true);
  };

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
            <div className="flex justify-between gap-4">
              <span className="font-semibold text-zinc-500">Question focus:</span>
              <span className="text-right font-bold text-zinc-800">{questionFocus === "general" ? "General knowledge" : questionFocus === "domain" ? "Company & domain" : questionFocus === "system-design" ? "System design" : "Mixed interview"}</span>
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
                  <span className="font-bold text-zinc-800 truncate max-w-[200px]">{activeCV?.fullName || "Kian Nguyen"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-zinc-500">Target Role:</span>
                  <span className="font-bold text-zinc-850 truncate max-w-[200px]">{activeJob.title}</span>
                </div>
              </>
            )}

            <div className="pt-2 border-t border-zinc-200 text-[10px] leading-relaxed text-zinc-500 italic">
              ⚠️ Note: This session runs in a fullscreen exam environment. You must complete or trigger "Finish Early" to exit back to the setup dashboard.
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
              className="h-9 text-[11px] font-semibold bg-zinc-900 text-white hover:bg-zinc-800 shadow-none border-none"
            >
              Begin Assessment
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
                    <span className="block text-sm font-bold">Job and CV tailored</span><span className="mt-1 block text-xs font-normal leading-relaxed text-zinc-500">Questions based on a target job and your selected CV.</span>
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

              <div className="space-y-2">
                <div><label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Question focus</label><p className="mt-0.5 text-[11px] text-zinc-500">Choose what the interviewer should test most deeply.</p></div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    { id: "general", label: "General knowledge", description: "Core concepts and technical fundamentals.", icon: BookOpen },
                    { id: "domain", label: "Company & domain", description: "Users, product context, and business constraints.", icon: Building2 },
                    { id: "system-design", label: "System design", description: "Architecture, scale, reliability, and trade-offs.", icon: Network },
                    { id: "mixed", label: "Mixed interview", description: "Rotate through all three question types.", icon: Shuffle },
                  ] as const).map((focus) => {
                    const Icon = focus.icon;
                    const selected = questionFocus === focus.id;
                    return <button key={focus.id} type="button" onClick={() => setQuestionFocus(focus.id)} className={cn("rounded-xl border p-3 text-left transition-colors", selected ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 dark:bg-indigo-950/20" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/40")}><div className="flex items-center gap-2"><Icon className={cn("h-4 w-4", selected ? "text-indigo-600" : "text-zinc-400")} /><span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{focus.label}</span></div><p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">{focus.description}</p></button>;
                  })}
                </div>
              </div>

              {interviewMode === "general" ? (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <label className="font-semibold text-zinc-500">Select General Track</label>
                  <Select
                    value={generalTrack}
                    onValueChange={(val) => setGeneralTrack(val as any)}
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
                    <label className="font-semibold text-zinc-500">Select Resume Version</label>
                    <Select value={selectedDraftId} onValueChange={(val) => { if (val) setSelectedDraftId(val); }}>
                      <SelectTrigger className="w-full h-9 bg-white dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-none">
                        <SelectValue placeholder="Select resume" />
                      </SelectTrigger>
                      <SelectContent>
                        {drafts.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.title} ({d.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-zinc-500">Select Target Job Role</label>
                    <Select value={selectedJobId} onValueChange={(val) => { if (val) setSelectedJobId(val); }}>
                      <SelectTrigger className="w-full h-9 bg-white dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-none">
                        <SelectValue placeholder="Select target job" />
                      </SelectTrigger>
                      <SelectContent>
                        {targetJobs.map((j) => (
                          <SelectItem key={j.id} value={j.id}>
                            {j.title} @ {j.company}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                        CV: "{session.cvName}"
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
                onClick={() => setIsPaused(false)}
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
                  <span>Evaluating: <strong className="text-zinc-700 dark:text-zinc-300">{activeCV?.fullName}</strong> for <strong className="text-zinc-700 dark:text-zinc-300">{activeJob.title}</strong></span>
                )}
              </p>
            </div>

            {/* Session Control Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequestHint}
                className="h-9 text-[11px] border-zinc-250 hover:bg-zinc-100 flex items-center gap-1 px-3 font-semibold text-zinc-750 shadow-none"
              >
                <HelpCircle className="h-3.5 w-3.5" /> Hint
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPaused(true)}
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
                onClick={handleQuitLoop}
                className="h-9 text-[11px] border-zinc-250 text-rose-700 hover:bg-rose-50 flex items-center gap-1 px-3 font-semibold shadow-none"
              >
                Quit Loop
              </Button>
            </div>
          </div>

          {/* Chat Feed */}
          <div className="max-w-5xl mx-auto w-full h-[600px] flex-1 min-h-0">
            <InterviewChat
              messages={messages}
              onSendMessage={handleSendMessage}
              isInterviewerThinking={isInterviewerThinking}
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
                Mock evaluation details for {interviewMode === "general" ? `${generalTrack === "AI" ? "AI Engineer" : "Software Engineer (SWE)"}` : `${activeJob.title}`}
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
                          Your response: "{item.answer}"
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
                </CardContent>
              </Card>

              <Card className="border-zinc-200 bg-white shadow-none dark:border-zinc-800 dark:bg-zinc-900">
                <CardHeader className="pb-3"><CardTitle className="text-sm font-bold">STAR breakdown</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-x-5 gap-y-4 text-xs sm:grid-cols-4">
                  {[["Situation", activeScore.situation], ["Task", activeScore.task], ["Action", activeScore.action], ["Result", activeScore.result]].map(([label, value]) => <div key={String(label)}><div className="mb-1.5 flex justify-between font-semibold"><span>{label}</span><span>{value}%</span></div><Progress value={Number(value)} className="h-1.5 bg-zinc-100 [&>div]:bg-zinc-800 dark:bg-zinc-800 dark:[&>div]:bg-zinc-200" /></div>)}
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20"><h3 className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />What worked</h3><p className="mt-2 text-xs leading-relaxed text-emerald-900/75 dark:text-emerald-200/70">Your answer was relevant ({activeScore.relevance}%) and technically specific ({activeScore.specificity}%). {activeScore.metricsPresent ? "You supported it with measurable evidence." : "Your explanation stayed focused on the question."}</p></section>
                <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20"><h3 className="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4" />Improve next</h3><p className="mt-2 text-xs leading-relaxed text-amber-900/75 dark:text-amber-200/70">{activeScore.proseFeedback} Focus first on the lowest STAR area and make the result explicit.</p></section>
              </div>

              <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5 dark:border-indigo-900/60 dark:bg-indigo-950/20"><h3 className="flex items-center gap-2 text-sm font-bold text-indigo-900 dark:text-indigo-200"><Sparkles className="h-4 w-4" />A stronger answer structure</h3><p className="mt-2 text-xs leading-relaxed text-indigo-900/75 dark:text-indigo-200/70">Start with one sentence of context and your responsibility. Explain the specific technical action you took, including the trade-off you considered. End with a measurable result and what you learned. Keep every claim grounded in your real experience.</p></section>

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

function getNextQuestion(topicId: string): string {
  switch (topicId) {
    case "topic-2":
      return "How do you organize your styling configuration in Tailwind v4, and what steps do you take to construct reusable custom layouts with shadcn components?";
    case "topic-3":
      return "Can you describe a scenario where you diagnosed a layout shift or low INP score on a web application? What specific Web API tools did you adjust to optimize the performance?";
    case "topic-4":
      return "For a highly interactive application, how do you handle complex overlay transitions (like popovers and dialogs) without breaking focus order? How would you implement a simple scroll-driven transition?";
    case "topic-5":
      return "How do you establish interface contracts with backend teammates when working on asynchronous APIs? Give an example of how you handle loading and error states.";
    default:
      return "Tell me about your latest client-side layout architectural challenges.";
  }
}

function generateMockScore(topicIdx: number, candidateText: string): ScoreBreakdown {
  const metricsPresent = /\d+%|\d+\s?engineers|\d+\s?years|\d+\s?ms/i.test(candidateText);

  const mockFeedbacks = [
    {
      overall: 90,
      situation: 95,
      task: 90,
      action: 85,
      result: 90,
      relevance: 95,
      specificity: 90,
      proseFeedback: "Excellent coverage of the React 19 concurrent features. Your explanation of server-side boundaries was clear, and you described the caching challenges using precise state terms.",
    },
    {
      overall: 85,
      situation: 80,
      task: 90,
      action: 85,
      result: 85,
      relevance: 90,
      specificity: 80,
      proseFeedback: "Good explanation of utility class organization in Tailwind v4. The structure was coherent, but you could emphasize how theme extension variables are declared inside CSS instead of tailwind.config.",
    },
    {
      overall: 80,
      situation: 85,
      task: 80,
      action: 75,
      result: 80,
      relevance: 85,
      specificity: 80,
      proseFeedback: "Clear description of Core Web Vitals diagnostics. The explanation of page speed variables was detailed, but try to cite specific diagnostic values (like ms delay in INP) next time.",
    },
    {
      overall: 92,
      situation: 95,
      task: 90,
      action: 95,
      result: 90,
      relevance: 95,
      specificity: 90,
      proseFeedback: "Very polished description of custom overlays. You correctly noted the overlay stack mechanics and how dialog tags focus containment helps accessibility.",
    },
    {
      overall: 88,
      situation: 90,
      task: 85,
      action: 90,
      result: 85,
      relevance: 90,
      specificity: 85,
      proseFeedback: "Outstanding collaboration description. You correctly outlined client-server data contracting and how API schemas are documented in typescript before implementation.",
    },
  ];

  const currentFeedback = mockFeedbacks[topicIdx] || mockFeedbacks[0];

  return {
    ...currentFeedback,
    metricsPresent,
    overall: metricsPresent ? currentFeedback.overall : Math.max(70, currentFeedback.overall - 10),
  };
}

const ArrowLeft = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
  </svg>
);
