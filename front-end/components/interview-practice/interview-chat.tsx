"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Check, Loader2, Mic, MicOff, Pause, RotateCcw, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DeliveryEvidence, transcribeInterviewAudio } from "@/lib/interview-api";

export interface Message {
  id: string;
  sender: "interviewer" | "candidate";
  text: string;
  timestamp: Date;
}

interface InterviewChatProps {
  messages: Message[];
  onSendMessage: (text: string, delivery?: DeliveryEvidence) => void;
  isInterviewerThinking: boolean;
  interviewerName?: string;
  inactivityNotice?: string | null;
  onInputActivity?: () => void;
}

const FILLER_PATTERN = /\b(um+|uh+|erm+|hmm+|like|basically|actually|literally|you know|sort of|kind of)\b/gi;
const AUTO_SUBMIT_SECONDS = 3;
const SILENCE_STOP_MS = 4_000;
const SPEECH_LEVEL = 0.025;

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function deliveryFor(text: string, durationSeconds: number): DeliveryEvidence {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return {
    duration_seconds: Math.max(durationSeconds, 1),
    word_count: wordCount,
    words_per_minute: Math.min(400, Math.round((wordCount / Math.max(durationSeconds, 1)) * 60)),
    filler_words: (text.match(FILLER_PATTERN) || []).length,
    transcript_source: "groq_whisper",
  };
}

export function InterviewChat({
  messages,
  onSendMessage,
  isInterviewerThinking,
  interviewerName = "Alex Morgan",
  inactivityNotice,
  onInputActivity,
}: InterviewChatProps) {
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedDuration, setRecordedDuration] = useState<number | null>(null);
  const [autoSubmitSeconds, setAutoSubmitSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysisFrameRef = useRef<number | null>(null);
  const speechDetectedRef = useRef(false);
  const silenceStartedAtRef = useRef<number | null>(null);
  const submittedRef = useRef(false);

  const currentQuestion = useMemo(
    () => [...messages].reverse().find((message) => message.sender === "interviewer")?.text || "Preparing your next question...",
    [messages]
  );
  const answerNumber = messages.filter((message) => message.sender === "candidate").length + 1;
  const liveDelivery = transcript && recordedDuration ? deliveryFor(transcript, recordedDuration) : null;

  const releaseMicrophone = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (analysisFrameRef.current) cancelAnimationFrame(analysisFrameRef.current);
    analysisFrameRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  };

  useEffect(() => () => {
    recorderRef.current?.stop();
    releaseMicrophone();
  }, []);

  const resetAnswer = () => {
    setTranscript("");
    setRecordedDuration(null);
    setRecordingSeconds(0);
    setError(null);
    setAutoSubmitSeconds(null);
    submittedRef.current = false;
  };

  const monitorSilence = (stream: MediaStream, recorder: MediaRecorder) => {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = context;
    speechDetectedRef.current = false;
    silenceStartedAtRef.current = null;
    const samples = new Uint8Array(analyser.fftSize);
    const sample = () => {
      if (recorder.state !== "recording") return;
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const value of samples) {
        const normalized = (value - 128) / 128;
        energy += normalized * normalized;
      }
      const level = Math.sqrt(energy / samples.length);
      if (level >= SPEECH_LEVEL) {
        speechDetectedRef.current = true;
        silenceStartedAtRef.current = null;
      } else if (speechDetectedRef.current) {
        silenceStartedAtRef.current ??= Date.now();
        if (Date.now() - silenceStartedAtRef.current >= SILENCE_STOP_MS) {
          recorder.stop();
          return;
        }
      }
      analysisFrameRef.current = requestAnimationFrame(sample);
    };
    analysisFrameRef.current = requestAnimationFrame(sample);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record audio. Use current Chrome, Edge, or Safari, or type your answer below.");
      return;
    }
    try {
      setError(null);
      resetAnswer();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType: preferredType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        const elapsed = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType });
        releaseMicrophone();
        setIsRecording(false);
        setRecordedDuration(elapsed);
        setIsTranscribing(true);
        try {
          const result = await transcribeInterviewAudio(audio);
          setTranscript(result.text);
          if (result.duration_seconds) setRecordedDuration(Math.max(1, result.duration_seconds));
          setAutoSubmitSeconds(AUTO_SUBMIT_SECONDS);
          onInputActivity?.();
        } catch (transcriptionError) {
          setError(transcriptionError instanceof Error ? transcriptionError.message : "Groq Whisper could not transcribe this answer.");
        } finally {
          setIsTranscribing(false);
        }
      };
      startedAtRef.current = Date.now();
      recorder.start(1000);
      monitorSilence(stream, recorder);
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        setRecordingSeconds(seconds);
        if (seconds >= 300 && recorder.state === "recording") recorder.stop();
      }, 250);
    } catch {
      releaseMicrophone();
      setError("Microphone access was denied. Allow access in the browser address bar and try again.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const submitAnswer = () => {
    if (!transcript.trim() || submittedRef.current) return;
    submittedRef.current = true;
    setAutoSubmitSeconds(null);
    onSendMessage(transcript.trim(), liveDelivery || undefined);
    resetAnswer();
  };

  useEffect(() => {
    if (autoSubmitSeconds === null) return;
    const timeout = window.setTimeout(() => {
      if (autoSubmitSeconds <= 1) submitAnswer();
      else setAutoSubmitSeconds(autoSubmitSeconds - 1);
    }, 1_000);
    return () => window.clearTimeout(timeout);
  // The countdown deliberately submits the current transcript snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmitSeconds]);

  const submitStuckAnswer = () => {
    setAutoSubmitSeconds(null);
    onSendMessage("I’m not sure how to answer this question.");
    resetAnswer();
  };

  return (
    <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="min-h-0 overflow-hidden border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <CardContent className="flex h-full min-h-[560px] flex-col p-0">
          <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
                <UserRound className="h-5 w-5" />
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-zinc-900" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{interviewerName}</p>
                <p className="text-[11px] text-zinc-500">Technical interviewer · Live session</p>
              </div>
            </div>
            <div className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              Recording enabled
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center md:px-14">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-600">Question {answerNumber}</p>
            <h2 className="mt-4 max-w-3xl text-xl font-semibold leading-relaxed text-zinc-950 md:text-2xl dark:text-zinc-50">
              {currentQuestion}
            </h2>
            {isInterviewerThinking && (
              <div className="mt-6 flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Preparing the next question...</div>
            )}

            <div className="mt-10 flex min-h-28 flex-col items-center justify-center">
              {isRecording ? (
                <>
                  <button onClick={stopRecording} className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/25 transition hover:scale-105" aria-label="Stop recording">
                    <MicOff className="h-8 w-8" />
                  </button>
                  <p className="mt-4 font-mono text-xl font-bold text-zinc-900 dark:text-zinc-100">{formatTime(recordingSeconds)}</p>
                  <div className="mt-3 flex h-6 items-center gap-1" aria-hidden="true">
                    {[12, 22, 16, 28, 18, 25, 14, 21, 11].map((height, index) => <span key={index} className="w-1 animate-pulse rounded-full bg-red-500" style={{ height, animationDelay: `${index * 80}ms` }} />)}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">Answer naturally. Recording stops after four seconds of silence.</p>
                </>
              ) : isTranscribing ? (
                <div className="flex flex-col items-center text-zinc-600"><Loader2 className="h-10 w-10 animate-spin text-indigo-600" /><p className="mt-4 text-sm font-semibold">Groq Whisper is preparing your transcript...</p></div>
              ) : (
                <>
                  <button onClick={startRecording} disabled={isInterviewerThinking} className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 transition hover:scale-105 hover:bg-indigo-700 disabled:opacity-40" aria-label="Start recording answer">
                    <Mic className="h-8 w-8" />
                  </button>
                  <p className="mt-4 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Press to answer</p>
                  <p className="mt-1 text-xs text-zinc-500">Your audio is transcribed, evaluated, then discarded.</p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex min-h-0 flex-col gap-4">
        <Card className="border-zinc-200 shadow-none dark:border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2"><AudioLines className="h-4 w-4 text-indigo-600" /><h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Answer transcript</h3></div>
            <Textarea
              value={transcript}
              onChange={(event) => { setTranscript(event.target.value); setRecordedDuration(null); setAutoSubmitSeconds(null); onInputActivity?.(); }}
              placeholder="Record your answer, or type here if you cannot use a microphone."
              disabled={isRecording || isTranscribing || isInterviewerThinking}
              className="mt-3 min-h-48 resize-none text-sm leading-relaxed"
            />
            {error && <p role="alert" className="mt-3 text-xs leading-relaxed text-red-600">{error}</p>}
            {inactivityNotice && <p className="mt-3 text-xs leading-relaxed text-amber-700">{inactivityNotice}</p>}
            {autoSubmitSeconds !== null && (
              <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
                <div className="flex items-center justify-between gap-3"><span>Submitting in <strong>{autoSubmitSeconds}s</strong>...</span><button type="button" onClick={() => setAutoSubmitSeconds(null)} className="flex items-center gap-1 font-bold hover:underline"><Pause className="h-3.5 w-3.5" />Review first</button></div>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={resetAnswer} disabled={!transcript && !error}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Retake</Button>
              <Button size="sm" onClick={submitAnswer} disabled={!transcript.trim() || isRecording || isTranscribing || isInterviewerThinking} className="flex-1 bg-zinc-900 text-white hover:bg-zinc-800"><Send className="mr-1.5 h-3.5 w-3.5" />Submit answer</Button>
            </div>
            <button type="button" onClick={submitStuckAnswer} disabled={isRecording || isTranscribing || isInterviewerThinking} className="mt-3 w-full text-center text-xs font-semibold text-zinc-500 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">I’m not sure, help me</button>
          </CardContent>
        </Card>

        <Card className="flex-1 border-zinc-200 bg-zinc-50 shadow-none dark:border-zinc-800 dark:bg-zinc-900/50">
          <CardContent className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Live delivery check</h3>
            {liveDelivery ? (
              <div className="mt-4 space-y-3 text-xs">
                <Metric label="Answer length" value={`${Math.round(liveDelivery.duration_seconds)} sec`} good={liveDelivery.duration_seconds >= 30 && liveDelivery.duration_seconds <= 180} />
                <Metric label="Speaking pace" value={`${liveDelivery.words_per_minute} wpm`} good={liveDelivery.words_per_minute >= 110 && liveDelivery.words_per_minute <= 170} />
                <Metric label="Filler words" value={`${liveDelivery.filler_words}`} good={liveDelivery.filler_words <= 3} />
                <p className="border-t border-zinc-200 pt-3 leading-relaxed text-zinc-500 dark:border-zinc-800">These are observable coaching signals, not emotion or personality judgments.</p>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">Record an answer to measure duration, pace, and filler-word frequency.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <div className="flex items-center justify-between"><span className="text-zinc-500">{label}</span><span className={cn("flex items-center gap-1 font-bold", good ? "text-emerald-700" : "text-amber-700")}><Check className="h-3.5 w-3.5" />{value}</span></div>;
}
