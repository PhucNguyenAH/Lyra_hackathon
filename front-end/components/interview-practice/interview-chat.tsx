"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Send, HelpCircle, User, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface Message {
  id: string;
  sender: "interviewer" | "candidate";
  text: string;
  timestamp: Date;
  status?: "pending" | "sent" | "analyzed";
}

interface InterviewChatProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isInterviewerThinking: boolean;
}

export function InterviewChat({
  messages,
  onSendMessage,
  isInterviewerThinking,
}: InterviewChatProps) {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isInterviewerThinking]);

  // Recording Timer Effect
  useEffect(() => {
    if (isRecording) {
      recordingTimer.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimer.current) clearInterval(recordingTimer.current);
      setRecordingSeconds(0);
    }

    return () => {
      if (recordingTimer.current) clearInterval(recordingTimer.current);
    };
  }, [isRecording]);

  const handleSend = () => {
    if (inputText.trim()) {
      onSendMessage(inputText);
      setInputText("");
    }
  };

  const handleVoiceRecordToggle = () => {
    if (isRecording) {
      // Stopped: Populate with mock voice transcript
      setIsRecording(false);
      setInputText(
        "At CloudCorp, I managed a team of 4 engineers where we built our main client application using Next.js App Router and React 19. I was responsible for performance, reducing the LCP by 40% and optimizing our chunk sizes by integrating custom Tailwind CSS configurations."
      );
    } else {
      // Started
      setInputText("");
      setIsRecording(true);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md shadow-sm h-full flex flex-col">
      <CardHeader className="pb-3 border-b border-zinc-200/50 dark:border-zinc-800/50 flex-shrink-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          Interviewer Conversation Feed
        </CardTitle>
      </CardHeader>

      {/* Messages timeline viewport using ScrollArea */}
      <ScrollArea className="flex-1 p-6 pr-4 min-h-0">
        <div className="space-y-4 pr-3 pb-4">
          {messages.map((msg) => {
            const isInterviewer = msg.sender === "interviewer";
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3 max-w-[85%] text-xs leading-relaxed animate-in fade-in-50 duration-200",
                  isInterviewer ? "mr-auto text-left" : "ml-auto flex-row-reverse text-left"
                )}
              >
                {/* Avatar Icon */}
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 border",
                  isInterviewer
                    ? "bg-indigo-50 border-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:border-indigo-900/50 dark:text-indigo-400"
                    : "bg-zinc-100 border-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:border-zinc-800 dark:text-zinc-400"
                )}>
                  {isInterviewer ? <HelpCircle className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>

                {/* Message Bubble Container */}
                <div className="space-y-1">
                  <div className={cn(
                    "p-3 rounded-2xl border",
                    isInterviewer
                      ? "bg-white dark:bg-zinc-950/40 border-zinc-100 dark:border-zinc-800 rounded-tl-sm text-zinc-800 dark:text-zinc-200 shadow-sm"
                      : "bg-indigo-600 dark:bg-indigo-500 border-none rounded-tr-sm text-white shadow-sm font-medium"
                  )}>
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-zinc-400 dark:text-zinc-550 px-1 block">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Interviewer Thinking State */}
          {isInterviewerThinking && (
            <div className="flex gap-3 max-w-[85%] text-xs mr-auto items-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:border-indigo-900/50 dark:text-indigo-400 flex-shrink-0">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="p-3 bg-white dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800 rounded-2xl rounded-tl-sm text-zinc-400 dark:text-zinc-550 shadow-sm flex items-center gap-1.5 font-medium italic">
                AI Interviewer is analyzing response rubrics...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      {/* Input controls footer */}
      <CardFooter className="p-4 border-t border-zinc-200/50 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/30 flex flex-col gap-3 flex-shrink-0">
        {/* Voice recording overlay */}
        {isRecording && (
          <div className="w-full flex items-center justify-between p-3 rounded-lg border border-red-500/10 bg-red-500/5 text-xs text-red-600 dark:text-red-400 animate-pulse">
            <div className="flex items-center gap-3">
              <span className="flex h-2 w-2 rounded-full bg-red-500"></span>
              <span className="font-semibold">Recording Mic Input... {formatTime(recordingSeconds)}</span>
            </div>

            {/* Bouncing audio wave simulation */}
            <div className="flex items-center gap-0.5 h-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => (
                <span
                  key={bar}
                  className="w-[3px] bg-red-500 dark:bg-red-400 rounded-full"
                  style={{
                    height: `${Math.floor(Math.random() * 16) + 6}px`,
                    animationDelay: `${bar * 0.1}s`,
                    animationDuration: `${0.4 + Math.random() * 0.4}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex w-full gap-2 items-end">
          {/* Micro Recording Button */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleVoiceRecordToggle}
            className={cn(
              "w-11 h-11 rounded-xl flex-shrink-0 transition-colors border",
              isRecording
                ? "bg-red-500 border-red-500 text-white hover:bg-red-600"
                : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            )}
            title={isRecording ? "Stop Recording" : "Record with Voice"}
            aria-label={isRecording ? "Stop voice recording" : "Record answer with voice"}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>

          {/* Text input area */}
          <div className="flex-1 relative">
            <Textarea
              placeholder={isRecording ? "Speak now..." : "Type your answer here..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isRecording}
              aria-label="Your answer"
              className="min-h-[44px] max-h-[120px] py-2.5 px-3 pr-10 text-xs resize-none rounded-xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
          </div>

          {/* Submit Send Button */}
          <Button
            type="button"
            onClick={handleSend}
            disabled={!inputText.trim() || isRecording || isInterviewerThinking}
            aria-label="Send answer"
            className="w-11 h-11 rounded-xl bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 hover:shadow-md hover:shadow-indigo-500/20 active:scale-95 transition-all flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
