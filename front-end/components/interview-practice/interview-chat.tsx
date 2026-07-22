"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Send, HelpCircle, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface Message {
  id: string;
  sender: "interviewer" | "candidate";
  text: string;
  timestamp: Date;
}

interface InterviewChatProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isInterviewerThinking: boolean;
  interviewerName?: string;
  inactivityNotice?: string | null;
  onInputActivity?: () => void;
}

interface SpeechRecognitionResultEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function InterviewChat({
  messages,
  onSendMessage,
  isInterviewerThinking,
  interviewerName = "Alex — Technical Interviewer",
  inactivityNotice,
  onInputActivity,
}: InterviewChatProps) {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechNotice, setSpeechNotice] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptBeforeRecordingRef = useRef("");
  const currentRecognitionTranscriptRef = useRef("");
  const manualStopRef = useRef(false);
  const isRecordingRef = useRef(false);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isInterviewerThinking]);

  // Recording Timer Effect
  useEffect(() => {
    if (isRecording) {
      let elapsedSeconds = 0;
      recordingTimer.current = setInterval(() => {
        elapsedSeconds += 1;
        setRecordingSeconds(elapsedSeconds);

        if (elapsedSeconds >= 300) {
          // Set these before stop() so onend knows this was intentional and does not restart.
          manualStopRef.current = true;
          isRecordingRef.current = false;
          recognitionRef.current?.stop();
          setIsRecording(false);
          setSpeechNotice("Voice recording reached the 5-minute limit. Your transcript has been saved.");
        }
      }, 1000);
    } else {
      if (recordingTimer.current) clearInterval(recordingTimer.current);
    }

    return () => {
      if (recordingTimer.current) clearInterval(recordingTimer.current);
    };
  }, [isRecording]);

  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      isRecordingRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  const handleSend = () => {
    if (inputText.trim()) {
      onSendMessage(inputText);
      setInputText("");
    }
  };

  const startVoiceRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechError(
        "Voice typing is not supported in this browser. Try Chrome or Edge, or type your answer."
      );
      return;
    }

    setSpeechError(null);
    setSpeechNotice(null);
    transcriptBeforeRecordingRef.current = inputText.trim();
    currentRecognitionTranscriptRef.current = "";
    manualStopRef.current = false;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-AU";

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript ?? "";
        if (event.results[index].isFinal) finalTranscript += transcript;
        else interimTranscript += transcript;
      }

      const combinedTranscript = [
        transcriptBeforeRecordingRef.current,
        finalTranscript.trim(),
        interimTranscript.trim(),
      ]
        .filter(Boolean)
        .join(" ");

      currentRecognitionTranscriptRef.current = [
        finalTranscript.trim(),
        interimTranscript.trim(),
      ]
        .filter(Boolean)
        .join(" ");
      onInputActivity?.();
      setInputText(combinedTranscript);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;

      const message =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was denied. Allow microphone access in your browser settings and try again."
          : `Voice typing stopped (${event.error}). Please try again.`;
      manualStopRef.current = true;
      isRecordingRef.current = false;
      setSpeechError(message);
      setIsRecording(false);
    };

    recognition.onend = () => {
      if (currentRecognitionTranscriptRef.current) {
        transcriptBeforeRecordingRef.current = [
          transcriptBeforeRecordingRef.current,
          currentRecognitionTranscriptRef.current,
        ]
          .filter(Boolean)
          .join(" ");
        currentRecognitionTranscriptRef.current = "";
        setInputText(transcriptBeforeRecordingRef.current);
      }

      if (!manualStopRef.current && isRecordingRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          setSpeechError("Voice typing could not restart. Please click the microphone to continue.");
        }
      }

      isRecordingRef.current = false;
      setIsRecording(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
      setRecordingSeconds(0);
      isRecordingRef.current = true;
      setIsRecording(true);
    } catch {
      recognitionRef.current = null;
      setSpeechError("Voice typing could not start. Please try again.");
    }
  };

  const handleVoiceRecordToggle = () => {
    if (isRecording) {
      manualStopRef.current = true;
      isRecordingRef.current = false;
      recognitionRef.current?.stop();
      setRecordingSeconds(0);
      setIsRecording(false);
    } else {
      startVoiceRecognition();
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
          {interviewerName}
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
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500 px-1 block">
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
              <div className="p-3 bg-white dark:bg-zinc-950/40 border border-zinc-100 dark:border-zinc-800 rounded-2xl rounded-tl-sm text-zinc-400 dark:text-zinc-500 shadow-sm flex items-center gap-1.5 font-medium italic">
                Interviewer is thinking...
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
              {[10, 17, 13, 21, 15, 19, 11, 16].map((height, index) => (
                <span
                  key={index}
                  className="w-[3px] bg-red-500 dark:bg-red-400 rounded-full animate-bounce"
                  style={{
                    height: `${height}px`,
                    animationDelay: `${index * 0.1}s`,
                    animationDuration: `${0.45 + (index % 4) * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {speechError && (
          <p role="alert" className="w-full text-xs text-red-600 dark:text-red-400">
            {speechError}
          </p>
        )}

        {speechNotice && (
          <p role="status" className="w-full text-xs text-indigo-600 dark:text-indigo-400">
            {speechNotice}
          </p>
        )}

        {inactivityNotice && (
          <p role="status" className="w-full text-xs text-amber-700 dark:text-amber-300">
            {inactivityNotice}
          </p>
        )}

        <div className="flex w-full gap-2 items-end">
          {/* Micro Recording Button */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleVoiceRecordToggle}
            disabled={isInterviewerThinking}
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
              onChange={(e) => {
                setInputText(e.target.value);
                onInputActivity?.();
              }}
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
