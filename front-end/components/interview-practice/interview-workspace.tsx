"use client";

import React, { useState } from "react";
import { InterviewChat, Message } from "./interview-chat";
import { InterviewCoverage, TopicCoverage } from "./interview-coverage";
import { InterviewScorecard, ScoreBreakdown } from "./interview-scorecard";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpCircle, Star, Sparkles, MessageSquare, RotateCcw, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function InterviewWorkspace() {
  const [screen, setScreen] = useState<"SETUP" | "INTERVIEW" | "REPORT">("SETUP");
  const [jobTitle, setJobTitle] = useState("Backend Engineer");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isInterviewerThinking, setIsInterviewerThinking] = useState(false);

  // Syllabus tracker state
  const [topics, setTopics] = useState<TopicCoverage[]>(initialTopics);
  
  // Track individual question scores and content for post-interview review
  const [answeredQuestions, setAnsweredQuestions] = useState<{
    id: string;
    question: string;
    answer: string;
    score: ScoreBreakdown;
  }[]>([]);

  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);

  const startInterview = () => {
    setScreen("INTERVIEW");
    setMessages([
      {
        id: "msg-init",
        sender: "interviewer",
        text: `Hello! Welcome to your technical mock interview for the ${jobTitle} position. We will cover five core categories: Next.js Architecture, Tailwind styling pipelines, Core Web Vitals, UI Polish mechanics, and Team collaboration. Let's start with Next.js: Can you describe your experience implementing the App Router in client-side applications, and how you design patterns for custom data caching?`,
        timestamp: new Date(),
      },
    ]);
    setTopics(initialTopics.map((t, idx) => (idx === 0 ? { ...t, status: "active" } : t)));
    setAnsweredQuestions([]);
    setExpandedReviewId(null);
  };

  const handleSendMessage = (text: string) => {
    const activeTopicIdx = topics.findIndex((t) => t.status === "active");
    const activeTopic = topics[activeTopicIdx];

    // Find the latest interviewer question text
    const lastQuestionMsg = [...messages].reverse().find((m) => m.sender === "interviewer");
    const questionText = lastQuestionMsg ? lastQuestionMsg.text : "Tell me about your tech experience.";

    // 1. Add candidate answer message
    const candidateMsg: Message = {
      id: `msg-cand-${Date.now()}`,
      sender: "candidate",
      text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, candidateMsg]);
    setIsInterviewerThinking(true);

    // 2. Simulate AI processing: score response and ask next question
    setTimeout(() => {
      // Generate mock feedback score
      const mockResultScore: ScoreBreakdown = generateMockScore(activeTopicIdx, text);

      // Record answer history
      const newAnswerRecord = {
        id: `record-${activeTopic.id}`,
        question: questionText,
        answer: text,
        score: mockResultScore,
      };
      setAnsweredQuestions((prev) => [...prev, newAnswerRecord]);

      // Update topic status
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

      // Add interviewer next question or end interview
      const nextTopic = topics[activeTopicIdx + 1];
      if (nextTopic) {
        const nextQuestion = getNextQuestion(nextTopic.id);
        const interviewerMsg: Message = {
          id: `msg-int-${Date.now()}`,
          sender: "interviewer",
          text: `Got it. Let's move on to the next topic, which is ${nextTopic.name}: ${nextQuestion}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, interviewerMsg]);
      } else {
        // All topics completed -> Go to report screen
        setTimeout(() => {
          setScreen("REPORT");
        }, 1500);
      }

      setIsInterviewerThinking(false);
    }, 2000);
  };

  const getOverallAverageScore = () => {
    if (answeredQuestions.length === 0) return 0;
    const sum = answeredQuestions.reduce((acc, q) => acc + q.score.overall, 0);
    return Math.round(sum / answeredQuestions.length);
  };

  return (
    <div className="flex-1 flex flex-col space-y-6">
      {screen === "SETUP" && (
        <Card className="max-w-md mx-auto border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm mt-12 animate-in fade-in-50 duration-300">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-indigo-500" />
              Interview Simulator Setup
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400 dark:text-zinc-555">
              Configure target mock interview role.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">Target Role Title</label>
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="text-xs h-9 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500"
              />
            </div>
            <div className="pt-2">
              <Button
                onClick={startInterview}
                className="w-full h-10 rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-500/20 hover:bg-indigo-700 transition-colors"
              >
                Initiate Practice Simulation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {screen === "INTERVIEW" && (
        <div className="flex flex-col flex-1 min-h-0 space-y-6 animate-in fade-in-50 duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Interactive Mock Interview (Blind Mode)
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Active evaluation for: <strong className="text-indigo-500">{jobTitle}</strong>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScreen("SETUP")}
              className="h-9 px-3 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs"
            >
              Reset Session
            </Button>
          </div>

          {/* Full Width chat feed with no hints matching user request */}
          <div className="max-w-3xl mx-auto w-full h-[600px] flex-1 min-h-0">
            <InterviewChat
              messages={messages}
              onSendMessage={handleSendMessage}
              isInterviewerThinking={isInterviewerThinking}
            />
          </div>
        </div>
      )}

      {screen === "REPORT" && (
        <div className="max-w-4xl mx-auto w-full space-y-6 animate-in zoom-in-95 duration-300">
          {/* Main overview results card */}
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm">
            <CardHeader className="text-center pb-6 border-b border-zinc-150 dark:border-zinc-850">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400 mb-3">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg font-bold">Mock Practice Session Complete</CardTitle>
              <CardDescription className="text-xs text-zinc-400 dark:text-zinc-555">
                Practice report analysis for the position of {jobTitle}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                {/* Circular Average Gauge */}
                <div className="flex flex-col items-center justify-center text-center p-4 border-r border-zinc-200 dark:border-zinc-800/40">
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-indigo-500/25 bg-indigo-500/5 text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
                    {getOverallAverageScore()}%
                  </div>
                  <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mt-3">Overall Practice Score</h4>
                </div>

                {/* Score narrative */}
                <div className="md:col-span-2 space-y-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  <p>
                    <strong>Feedback Summary:</strong> You completed the mock interview assessment. You demonstrated strong competence in Next.js core setups. However, to boost your score further, focus on providing more specific quantitative results (percentages, savings metrics) and detailing concurrency patterns.
                  </p>
                  <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-2" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Topic Matches:</span>
                    <strong className="text-green-500">5 / 5 Topics evaluated</strong>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Double Column: Syllabus checklist left, Review logs right */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 h-full min-h-0">
              <InterviewCoverage coverage={topics} />
            </div>

            {/* Collapsible response score history */}
            <div className="md:col-span-2 space-y-4">
              <h3 className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-1">
                Question by Question Score Breakdown
              </h3>
              <div className="space-y-3">
                {answeredQuestions.map((item, idx) => {
                  const isExpanded = expandedReviewId === item.id;
                  return (
                    <Card key={item.id} className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 backdrop-blur-sm overflow-hidden">
                      <button
                        onClick={() => setExpandedReviewId(isExpanded ? null : item.id)}
                        className="w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-zinc-100/50 dark:hover:bg-zinc-800/10 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-xs text-zinc-800 dark:text-zinc-200 truncate">
                            Q{idx + 1}: {item.question}
                          </h4>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-550 mt-1 truncate">
                            Your answer: {item.answer}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className="font-bold text-xs border-none bg-indigo-500 text-white">
                            {item.score.overall}%
                          </Badge>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="p-4 border-t border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/30 dark:bg-zinc-950/20 space-y-4 animate-in slide-in-from-top-1 duration-200">
                          <InterviewScorecard
                            score={item.score}
                            questionText={item.question}
                            answerText={item.answer}
                          />
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScreen("SETUP")}
              className="h-10 px-4 border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Initiate New Session
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helpers & initial state definitions

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
