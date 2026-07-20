"use client";

import React, { useState } from "react";
import { CVPDFPreview, CVData, CVSectionKey } from "./cv-pdf-preview";
import { SkillsTagEditor } from "./skills-tag-editor";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Save, ChevronDown, Plus, ArrowUp, ArrowDown, FileText, MoreHorizontal, Trash2, Search, UploadCloud, RefreshCw, GripVertical, Trophy, Award } from "lucide-react";
import { CVDraft } from "../drafts-dashboard";

import { cn } from "@/lib/utils";

interface CVEditorWorkspaceProps {
  drafts: CVDraft[];
  selectedDraftId: string;
  onSelectDraft: (id: string) => void;
  onImportCV: (name: string, role: string, level: string) => void;
  onDeleteDraft: (id: string) => void;
  initialData: CVData;
  onBack: () => void;
  onSave: (data: CVData, matchScore: number) => void;
  onExport: () => void;
}

export interface ProjectItem {
  id: string;
  name: string;
  meta: string;
  description: string;
  bullets: string[];
  suggestions?: {
    [bulletIdx: number]: { text: string; scoreBoost: number; reason: string };
  };
}

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  location: string;
  dateRange: string;
  details: string[];
}

export interface CVDataExtended extends CVData {
  projects: ProjectItem[];
  educationList: EducationItem[];
}

export function CVEditorWorkspace({
  drafts,
  selectedDraftId,
  onSelectDraft,
  onImportCV,
  onDeleteDraft,
  initialData,
  onSave,
  onExport,
}: CVEditorWorkspaceProps) {
  // Shared States
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  // PDF Parsing states
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);

  // Extend data states
  const initialExtended: CVDataExtended = {
    ...initialData,
    achievements: initialData.achievements ?? [],
    awards: initialData.awards ?? [],
    sectionOrder: initialData.sectionOrder ?? ["summary", "skills", "experience", "projects", "education", "achievements", "awards"],
    projects: [
      {
        id: "proj-1",
        name: "BankFlow",
        meta: "Java, Spring Boot, Spring Security, PostgreSQL",
        description: "Open-source LLM chat interface used by 1k+ developers.",
        bullets: [
          "Built a production-style banking REST API with JWT-based security, implementing idempotency keys to prevent duplicate transactions and optimistic locking to prevent race conditions on concurrent balance updates.",
          "Wrote comprehensive unit tests with JUnit 5 and Mockito covering service logic, exception handling, and duplicate request detection.",
          "Containerised with a multi-stage Docker build, deployed to AWS EC2 with RDS PostgreSQL, and automated via a GitHub Actions CI/CD pipeline.",
        ],
        suggestions: {
          1: {
            text: "Developed robust Spring Boot unit test validations using JUnit 5 and Mockito, securing 98% code coverage across core financial logic layers.",
            scoreBoost: 8,
            reason: "Adding exact coverage metrics (98%) and logic layers makes this project bullet significantly more technical."
          }
        }
      }
    ],
    educationList: [
      {
        id: "edu-1",
        school: "Macquarie University",
        degree: "Bachelor of Information Technology (Cybersecurity & Software)",
        location: "Sydney, NSW",
        dateRange: "2023 - 2026",
        details: ["Specialized coursework in advanced algorithms, database engines, and networking architecture."],
      }
    ]
  };

  const [cvData, setCvData] = useState<CVDataExtended>(initialExtended);

  // Collapsible accordion panels status
  const [openSections, setOpenSections] = useState({
    sectionOrder: false,
    contact: false,
    summary: false,
    experience: false,
    projects: false,
    education: false,
    skills: false,
    achievements: false,
    awards: false,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [matchScore, setMatchScore] = useState(() => drafts.find((draft) => draft.id === selectedDraftId)?.matchScore ?? 70);
  const activeDraft = drafts.find((draft) => draft.id === selectedDraftId);
  const [showSuggestedCV, setShowSuggestedCV] = useState(() => !activeDraft?.sourcePdfUrl);
  const [isGeneratingCV, setIsGeneratingCV] = useState(false);
  const [draggedSection, setDraggedSection] = useState<CVSectionKey | null>(null);
  const [reviewedSuggestions, setReviewedSuggestions] = useState<string[]>([]);
  const [selectedMatchSuggestion, setSelectedMatchSuggestion] = useState<NonNullable<CVDraft["matchSuggestions"]>[number] | null>(null);

  const sectionLabels: Record<CVSectionKey, string> = {
    summary: "Summary",
    skills: "Skills",
    experience: "Experience",
    projects: "Projects",
    education: "Education",
    achievements: "Achievements",
    awards: "Awards",
  };

  const moveCVSection = (source: CVSectionKey, target: CVSectionKey) => {
    if (source === target) return;
    setCvData((prev) => {
      const order = [...(prev.sectionOrder ?? [])];
      const sourceIndex = order.indexOf(source);
      const targetIndex = order.indexOf(target);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      order.splice(sourceIndex, 1);
      order.splice(targetIndex, 0, source);
      return { ...prev, sectionOrder: order };
    });
  };

  const addOptionalItem = (field: "achievements" | "awards") => setCvData((prev) => ({ ...prev, [field]: [...(prev[field] ?? []), ""] }));
  const updateOptionalItem = (field: "achievements" | "awards", index: number, value: string) => setCvData((prev) => ({ ...prev, [field]: (prev[field] ?? []).map((item, itemIndex) => itemIndex === index ? value : item) }));
  const removeOptionalItem = (field: "achievements" | "awards", index: number) => setCvData((prev) => ({ ...prev, [field]: (prev[field] ?? []).filter((_, itemIndex) => itemIndex !== index) }));
  const reviewMatchSuggestion = (suggestion: NonNullable<CVDraft["matchSuggestions"]>[number]) => {
    setShowSuggestedCV(true);
    setOpenSections((current) => ({ ...current, [suggestion.action]: true }));
    setReviewedSuggestions((current) => current.includes(suggestion.id) ? current : [...current, suggestion.id]);
    setSelectedMatchSuggestion(null);
    window.setTimeout(() => document.getElementById(`cv-section-${suggestion.action}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const comparisonContent = selectedMatchSuggestion ? {
    current: selectedMatchSuggestion.action === "summary"
      ? cvData.summary || "No professional summary is currently included."
      : selectedMatchSuggestion.action === "skills"
        ? cvData.skills.map((category) => `${category.name}: ${category.items.join(", ")}`).join("\n") || "No targeted skills are currently included."
        : cvData.experience.flatMap((experience) => experience.bullets).slice(0, 3).join("\n") || "No experience evidence is currently included.",
    job: [
      activeDraft?.role ? `Target role: ${activeDraft.role}` : "",
      activeDraft?.missingSkills?.length ? `JD requirements to address: ${activeDraft.missingSkills.join(", ")}` : "",
      activeDraft?.matchedSkills?.length ? `Relevant requirements already matched: ${activeDraft.matchedSkills.join(", ")}` : "",
    ].filter(Boolean).join("\n") || "No job-description requirements are available for this draft.",
    ai: selectedMatchSuggestion.detail,
  } : null;
  const generateSuggestedCV = async () => {
    setIsGeneratingCV(true);
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    setShowSuggestedCV(true);
    setIsGeneratingCV(false);
  };

  // Suggested enhancement overlay state
  const [activeSuggestion, setActiveSuggestion] = useState<{
    section: "experience" | "project";
    itemIdx: number;
    bulletIdx: number;
    text: string;
    scoreBoost: number;
    reason: string;
  } | null>(null);

  const toggleSection = (section: "sectionOrder" | "contact" | "summary" | "experience" | "projects" | "education" | "skills" | "achievements" | "awards") => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const moveExperience = (index: number, direction: "up" | "down") => {
    const list = [...cvData.experience];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
    setCvData((prev) => ({ ...prev, experience: list }));
  };

  const moveProject = (index: number, direction: "up" | "down") => {
    const list = [...cvData.projects];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
    setCvData((prev) => ({ ...prev, projects: list }));
  };

  const moveEducation = (index: number, direction: "up" | "down") => {
    const list = [...cvData.educationList];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;
    setCvData((prev) => ({ ...prev, educationList: list }));
  };

  const moveProjectBullet = (projIndex: number, bulletIndex: number, direction: "up" | "down") => {
    const bullets = [...cvData.projects[projIndex].bullets];
    const targetIdx = direction === "up" ? bulletIndex - 1 : bulletIndex + 1;
    if (targetIdx < 0 || targetIdx >= bullets.length) return;

    const temp = bullets[bulletIndex];
    bullets[bulletIndex] = bullets[targetIdx];
    bullets[targetIdx] = temp;

    setCvData((prev) => {
      const projects = [...prev.projects];
      projects[projIndex] = { ...projects[projIndex], bullets };
      return { ...prev, projects };
    });
  };

  const handleAddExperience = () => {
    const newExp = {
      company: "New Company",
      role: "Software Engineer",
      location: "Sydney, Australia",
      date: "Jan 2026 - Present",
      bullets: ["Developed scalable frontend layouts.", "Integrated REST client components."],
    };
    setCvData((prev) => ({ ...prev, experience: [...prev.experience, newExp] }));
  };

  const handleAddProject = () => {
    const newProj: ProjectItem = {
      id: `proj-${Date.now()}`,
      name: "New Project",
      meta: "React, Node.js",
      description: "Custom project description.",
      bullets: ["Developed web interface workflows."],
    };
    setCvData((prev) => ({ ...prev, projects: [...prev.projects, newProj] }));
  };

  const handleAddEducation = () => {
    const newEdu: EducationItem = {
      id: `edu-${Date.now()}`,
      school: "New School",
      degree: "Computer Science Degree",
      location: "Sydney, NSW",
      dateRange: "2024 - 2026",
      details: ["Specialized coursework in advanced algorithms."],
    };
    setCvData((prev) => ({ ...prev, educationList: [...prev.educationList, newEdu] }));
  };

  const handleContactChange = (field: keyof CVDataExtended, value: string) => {
    setCvData((prev) => ({ ...prev, [field]: value }));
  };

  const handleExperienceChange = (index: number, field: "company" | "role" | "location" | "date", value: string) => {
    setCvData((prev) => {
      const updated = [...prev.experience];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, experience: updated };
    });
  };

  const handleProjectChange = (index: number, field: "name" | "meta" | "description", value: string) => {
    setCvData((prev) => {
      const updated = [...prev.projects];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, projects: updated };
    });
  };

  const handleEducationChange = (index: number, field: "school" | "degree" | "location" | "dateRange", value: string) => {
    setCvData((prev) => {
      const updated = [...prev.educationList];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, educationList: updated };
    });
  };

  const handleApplySuggestion = () => {
    if (!activeSuggestion) return;
    const { section, itemIdx, bulletIdx, text, scoreBoost } = activeSuggestion;

    if (section === "project") {
      setCvData((prev) => {
        const projects = [...prev.projects];
        const bullets = [...projects[itemIdx].bullets];
        bullets[bulletIdx] = text;
        projects[itemIdx] = { ...projects[itemIdx], bullets };
        return { ...prev, projects };
      });
    }

    setMatchScore((prev) => Math.min(100, prev + scoreBoost));
    setActiveSuggestion(null);
  };

  // 1. LANDING VERSION HUB VIEW (when selectedDraftId === "")
  if (selectedDraftId === "") {
    const filteredDrafts = drafts.filter(
      (d) =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.role.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleProcessPDFFile = (file: File) => {
      if (!file.name.endsWith(".pdf")) {
        toast.error("Only PDF format files can be imported.");
        return;
      }

      setIsParsing(true);
      setParseProgress(10);

      const interval = setInterval(() => {
        setParseProgress((prev) => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 25;
        });
      }, 300);

      setTimeout(() => {
        clearInterval(interval);
        setParseProgress(100);
        setTimeout(() => {
          setIsParsing(false);
          setParseProgress(0);
          toast.success(`Successfully parsed "${file.name}"! Created new CV profile.`);
          onImportCV(
            file.name.replace(".pdf", ""),
            "Senior Frontend Architect",
            "Senior (5+ years)"
          );
        }, 300);
      }, 1500);
    };

    return (
      <div className="space-y-6 animate-in fade-in duration-300 text-xs max-w-5xl mx-auto w-full">
        
        {/* Header */}
        <div className="pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Resume Version Control Hub
          </h1>
          <p className="text-xs text-zinc-550 mt-1">
            Manage your CV drafts, upload new PDF resume files, or select a version to edit and customize.
          </p>
        </div>

        {/* Resumes Dashboard list card */}
        <Card className="border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md shadow-none">
          <CardHeader className="pb-3 border-b border-zinc-200/20 dark:border-zinc-800/20">
            <CardTitle className="text-xs font-bold text-zinc-450 dark:text-zinc-500 uppercase tracking-wider">
              YOUR SAVED CV PROFILES
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            
            {/* Inline mini search and browse control toolbar */}
            <div className="p-4 flex items-center justify-between gap-4 border-b border-zinc-200/20 dark:border-zinc-800/20">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                <Input
                  placeholder="Search CV profiles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs h-9 bg-zinc-100/30 dark:bg-zinc-955/30 border-zinc-200 dark:border-zinc-850 rounded-xl shadow-none"
                />
              </div>

              {/* Compact PDF CV Uploader Button */}
              <div className="relative shrink-0">
                <input
                  id="compact-pdf-input-hub"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      handleProcessPDFFile(files[0]);
                    }
                  }}
                />
                <Button
                  onClick={() => document.getElementById("compact-pdf-input-hub")?.click()}
                  disabled={isParsing}
                  variant="outline"
                  className="h-9 px-3 text-xs font-semibold border-zinc-250 hover:bg-zinc-100 flex items-center gap-1.5 rounded-xl shadow-none"
                >
                  {isParsing ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                      <span>Parsing {parseProgress}%...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="h-3.5 w-3.5 text-zinc-450" />
                      <span>Upload PDF</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* List Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200/20 dark:border-zinc-800/20 text-zinc-400 dark:text-zinc-555">
                    <th className="p-4 font-bold tracking-wider">CV NAME</th>
                    <th className="p-4 font-bold tracking-wider">TARGET ROLE</th>
                    <th className="p-4 font-bold tracking-wider">MATCH</th>
                    <th className="p-4 font-bold tracking-wider">LAST UPDATED</th>
                    <th className="p-4 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrafts.map((draft) => (
                    <tr
                      key={draft.id}
                      className="group border-b border-zinc-200/20 dark:border-zinc-800/20 hover:bg-zinc-150/10 dark:hover:bg-zinc-850/10 cursor-pointer"
                      onClick={() => onSelectDraft(draft.id)}
                    >
                      <td className="p-4 font-semibold text-zinc-850 dark:text-zinc-200 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                        <span>{draft.title}</span>
                      </td>
                      <td className="p-4 text-zinc-550 dark:text-zinc-400">{draft.role}</td>
                      <td className="p-4"><Badge className={cn("border px-2 py-0.5 text-[10px] shadow-none", (draft.matchScore ?? 0) >= 80 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : draft.matchScore ? "border-amber-200 bg-amber-50 text-amber-700" : "border-zinc-200 bg-zinc-50 text-zinc-500")}>{draft.matchScore ? `${draft.matchScore}%` : "Not scored"}</Badge></td>
                      <td className="p-4 text-zinc-450 dark:text-zinc-500">{draft.updated}</td>
                      <td className="p-4 w-12 relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setActiveMenuId(activeMenuId === draft.id ? null : draft.id)}
                          className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-850 text-zinc-400 hover:text-zinc-755"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        
                        {activeMenuId === draft.id && (
                          <div className="absolute right-4 top-10 z-20 w-32 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-850 dark:bg-zinc-955">
                            <button
                              onClick={() => {
                                onDeleteDraft(draft.id);
                                setActiveMenuId(null);
                                toast.success("Draft deleted successfully.");
                              }}
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-955/20 font-medium"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete CV
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredDrafts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-zinc-450">
                        No resume profiles found. Select Upload PDF or tailor a job from the Overview Hub to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </CardContent>
        </Card>

      </div>
    );
  }

  // 2. ACTIVE EDITOR FORM WORKSPACE VIEW
  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-6">
      <Dialog open={Boolean(selectedMatchSuggestion)} onOpenChange={(open) => { if (!open) setSelectedMatchSuggestion(null); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              <div>
                <DialogTitle>{selectedMatchSuggestion?.title || "Review suggestion"}</DialogTitle>
                <DialogDescription className="mt-1">Compare the evidence before accepting any AI-assisted change.</DialogDescription>
              </div>
              {selectedMatchSuggestion && selectedMatchSuggestion.scoreBoost > 0 && <Badge className="border-0 bg-indigo-50 text-indigo-700">Potential +{selectedMatchSuggestion.scoreBoost}</Badge>}
            </div>
          </DialogHeader>

          {comparisonContent && <div className="grid gap-3 py-2 md:grid-cols-3">
            <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-200"><FileText className="h-4 w-4 text-zinc-400" />What is in your CV</div>
              <p className="whitespace-pre-line text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{comparisonContent.current}</p>
            </section>
            <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300"><Search className="h-4 w-4" />What the JD asks for</div>
              <p className="whitespace-pre-line text-xs leading-relaxed text-amber-900/75 dark:text-amber-200/70">{comparisonContent.job}</p>
            </section>
            <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-indigo-800 dark:text-indigo-300"><Sparkles className="h-4 w-4" />AI suggestion</div>
              <p className="text-xs leading-relaxed text-indigo-900/75 dark:text-indigo-200/70">{comparisonContent.ai}</p>
              <p className="mt-3 text-[10px] leading-relaxed text-indigo-600 dark:text-indigo-400">Only use claims supported by your original CV. Review the wording before saving.</p>
            </section>
          </div>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelectedMatchSuggestion(null)}>Not now</Button>
            {selectedMatchSuggestion && <Button type="button" onClick={() => reviewMatchSuggestion(selectedMatchSuggestion)} className="bg-indigo-600 text-white hover:bg-indigo-700">{showSuggestedCV ? "Open CV section" : "Open suggested CV & edit"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Draft context and back action */}
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSelectDraft("")}
            className="h-9 px-3 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs shadow-none"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Resumes
          </Button>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{activeDraft?.title || cvData.fullName}</span>
              <span className="hidden text-zinc-300 sm:inline">/</span>
              <span className="hidden truncate text-sm font-medium text-indigo-600 sm:inline dark:text-indigo-400">{activeDraft?.role || "General CV"}</span>
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500 sm:hidden">{activeDraft?.role || "General CV"} · {activeDraft?.level || "No level set"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {activeDraft?.level && <Badge variant="secondary" className="hidden whitespace-nowrap text-[10px] font-medium md:inline-flex">{activeDraft.level}</Badge>}
          {/* Match Score Indicator using soft muted green */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            {matchScore} / 100 match
          </div>

          <Button
            variant="outline"
            onClick={() => {
              setIsSaving(true);
              setTimeout(() => {
                setIsSaving(false);
                onSave(cvData, matchScore);
              }, 800);
            }}
            disabled={isSaving}
            className="h-9 px-4 border-zinc-200 dark:border-zinc-800 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1.5 shadow-none"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? "Saving..." : "Save Draft"}
          </Button>
        </div>
      </div>

      {/* Grid splits: Left = minimalist Forms, Right = A4 Preview */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 flex-1 min-h-[500px]">
        
        {/* Left Columns Forms */}
        <div className="lg:col-span-4 space-y-3 overflow-y-auto pr-1 max-h-[850px] relative">

          {activeDraft && (
            <section className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-indigo-900/60 dark:bg-zinc-900/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-600">Match analysis</p><h3 className="mt-0.5 truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">{activeDraft.targetCompany ? `${activeDraft.role} · ${activeDraft.targetCompany}` : activeDraft.role}</h3><p className="mt-0.5 truncate text-[10px] text-zinc-500">Source: {activeDraft.source}</p></div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-emerald-100 bg-emerald-50 text-sm font-extrabold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">{matchScore}</div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-emerald-50 p-2.5 dark:bg-emerald-950/20"><p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{activeDraft.matchedSkills?.length ?? 0}</p><p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">Matched skills</p></div>
                <div className="rounded-lg bg-amber-50 p-2.5 dark:bg-amber-950/20"><p className="text-lg font-bold text-amber-700 dark:text-amber-400">{activeDraft.missingSkills?.length ?? 0}</p><p className="text-[10px] text-amber-700/80 dark:text-amber-400/80">Gaps to review</p></div>
              </div>

              {(activeDraft.matchedSkills?.length ?? 0) > 0 && <div className="mt-3 flex flex-wrap gap-1">{activeDraft.matchedSkills?.map((skill) => <Badge key={skill} variant="secondary" className="px-1.5 py-0.5 text-[9px] font-medium">{skill}</Badge>)}</div>}

              {activeDraft.sourcePdfUrl && (
                <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <Button type="button" onClick={showSuggestedCV ? () => setShowSuggestedCV(false) : generateSuggestedCV} disabled={isGeneratingCV} className="h-9 w-full bg-indigo-600 text-xs text-white hover:bg-indigo-700">
                    {isGeneratingCV ? <><RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />Creating suggested CV…</> : showSuggestedCV ? <><FileText className="mr-1.5 h-3.5 w-3.5" />View uploaded PDF</> : <><Sparkles className="mr-1.5 h-3.5 w-3.5" />Create suggested CV</>}
                  </Button>
                  <p className="mt-2 text-center text-[10px] text-zinc-500">Your uploaded PDF stays unchanged.</p>
                </div>
              )}

              {(activeDraft.matchSuggestions?.length ?? 0) > 0 && (
                <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <div className="flex items-center justify-between"><h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Suggestions to improve match</h4><span className="text-[9px] text-zinc-400">Review, then edit</span></div>
                  {activeDraft.matchSuggestions?.map((suggestion) => {
                    const reviewed = reviewedSuggestions.includes(suggestion.id);
                    return <div key={suggestion.id} className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800"><div className="flex items-start justify-between gap-2"><div><p className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">{suggestion.title}</p><p className="mt-0.5 text-[10px] leading-relaxed text-zinc-500">{suggestion.detail}</p></div>{suggestion.scoreBoost > 0 && <Badge className="shrink-0 border-0 bg-indigo-50 px-1.5 text-[9px] text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400">+{suggestion.scoreBoost}</Badge>}</div><button type="button" onClick={() => setSelectedMatchSuggestion(suggestion)} className="mt-2 text-[10px] font-semibold text-indigo-600 hover:underline">{reviewed ? "Review comparison again" : "Review comparison"}</button></div>;
                  })}
                </div>
              )}
            </section>
          )}

          {/* Suggestion popover alert block */}
          {activeSuggestion && (
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-50/50 text-xs leading-normal space-y-3 shadow-none animate-in slide-in-from-top-2 duration-200 dark:bg-amber-955/20 dark:text-amber-400">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1">
                  <Sparkles className="h-4 w-4" />
                  Athena AI Tailoring Recommendation
                </h4>
                <Badge variant="secondary" className="text-[9px] bg-amber-500/20 text-amber-800 font-bold border-none px-2 py-0.5 shadow-none dark:bg-amber-900/30 dark:text-amber-400">
                  +{activeSuggestion.scoreBoost}% Score boost
                </Badge>
              </div>
              
              <div className="space-y-1 bg-white/40 p-2.5 rounded-lg border border-amber-500/10 dark:bg-zinc-950/30">
                <p className="text-[9.5px] font-semibold text-zinc-500 uppercase tracking-wide">Suggested Rewrite:</p>
                <p className="text-zinc-800 dark:text-zinc-200 mt-1 font-medium">{activeSuggestion.text}</p>
              </div>
              
              <p className="text-[10px] text-zinc-600 dark:text-zinc-400 leading-relaxed italic">{activeSuggestion.reason}</p>
              
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={() => setActiveSuggestion(null)} className="h-8 text-[11px] text-zinc-500 shadow-none border-none">
                  Dismiss
                </Button>
                <Button size="sm" onClick={handleApplySuggestion} className="h-8 text-[11px] bg-zinc-900 hover:bg-zinc-800 text-white shadow-none border-none">
                  Apply Suggestion
                </Button>
              </div>
            </div>
          )}

          {/* Form Modules Accordion */}
          {(!activeDraft?.sourcePdfUrl || showSuggestedCV) && <div className="space-y-2">

            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/25">
              <button type="button" onClick={() => toggleSection("sectionOrder")} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/30"><span><span className="block text-xs font-bold text-zinc-800 dark:text-zinc-200">Section order</span><span className="mt-0.5 block text-[10px] text-zinc-500">Drag sections to change their order in the CV.</span></span><ChevronDown className={cn("h-4 w-4 transition-transform", openSections.sectionOrder && "rotate-180")} /></button>
              {openSections.sectionOrder && <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 p-3 dark:border-zinc-800">
                {(cvData.sectionOrder ?? []).map((section) => (
                  <button
                    key={section}
                    type="button"
                    draggable
                    onDragStart={() => setDraggedSection(section)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => { if (draggedSection) moveCVSection(draggedSection, section); setDraggedSection(null); }}
                    onDragEnd={() => setDraggedSection(null)}
                    className={cn("flex cursor-grab items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[10px] font-semibold text-zinc-600 active:cursor-grabbing dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300", draggedSection === section && "opacity-40")}
                  >
                    <GripVertical className="h-3 w-3 text-zinc-400" />{sectionLabels[section]}
                  </button>
                ))}
              </div>}
            </div>
            
            {/* Contact details */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white/40 dark:bg-zinc-900/25">
              <button onClick={() => toggleSection("contact")} className="w-full px-4 py-3 flex items-center justify-between font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-850/30">
                <span>Contact & Links</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.contact && "rotate-180")} />
              </button>
              {openSections.contact && (
                <div className="p-4 border-t border-zinc-150/60 dark:border-zinc-800/40 grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-450 uppercase">Full Name</label>
                      <Input value={cvData.fullName} onChange={(e) => handleContactChange("fullName", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-455 uppercase">Email Address</label>
                      <Input value={cvData.email} onChange={(e) => handleContactChange("email", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-455 uppercase">Phone Number</label>
                      <Input value={cvData.phone} onChange={(e) => handleContactChange("phone", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-455 uppercase">Location</label>
                      <Input value={cvData.location} onChange={(e) => handleContactChange("location", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-455 uppercase">GitHub Link</label>
                      <Input value={cvData.github} onChange={(e) => handleContactChange("github", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-zinc-455 uppercase">LinkedIn Link</label>
                      <Input value={cvData.linkedin} onChange={(e) => handleContactChange("linkedin", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Summary */}
            <div id="cv-section-summary" className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white/40 dark:bg-zinc-900/25">
              <button onClick={() => toggleSection("summary")} className="w-full px-4 py-3 flex items-center justify-between font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-850/30">
                <span>Professional Summary</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.summary && "rotate-180")} />
              </button>
              {openSections.summary && (
                <div className="p-4 border-t border-zinc-150/60 dark:border-zinc-800/40 space-y-1">
                  <label className="text-[10px] font-bold text-zinc-455 uppercase">Summary Statement</label>
                  <Textarea value={cvData.summary} onChange={(e) => handleContactChange("summary", e.target.value)} rows={4} className="text-xs bg-white border border-zinc-250 rounded-lg leading-relaxed shadow-none" />
                </div>
              )}
            </div>

            {/* Experience Block */}
            <div id="cv-section-experience" className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white/40 dark:bg-zinc-900/25">
              <button onClick={() => toggleSection("experience")} className="w-full px-4 py-3 flex items-center justify-between font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-850/30">
                <span>Professional Experience ({cvData.experience.length})</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.experience && "rotate-180")} />
              </button>
              {openSections.experience && (
                <div className="p-4 border-t border-zinc-150/60 dark:border-zinc-800/40 space-y-4">
                  {cvData.experience.map((exp, expIdx) => (
                    <div key={expIdx} className="p-3 border border-zinc-150 rounded-xl bg-white/30 dark:bg-zinc-950/10 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-[10px] text-zinc-400">ROLE #{expIdx + 1}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => moveExperience(expIdx, "up")} className="p-1 text-zinc-450 hover:text-zinc-800"><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => moveExperience(expIdx, "down")} className="p-1 text-zinc-450 hover:text-zinc-800"><ArrowDown className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-455">Company</label>
                          <Input value={exp.company} onChange={(e) => handleExperienceChange(expIdx, "company", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-455">Role</label>
                          <Input value={exp.role} onChange={(e) => handleExperienceChange(expIdx, "role", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-455">Location</label>
                          <Input value={exp.location} onChange={(e) => handleExperienceChange(expIdx, "location", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-455">Date Range</label>
                          <Input value={exp.date} onChange={(e) => handleExperienceChange(expIdx, "date", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button type="button" onClick={handleAddExperience} variant="outline" className="w-full h-9 rounded-lg border-zinc-200 border-dashed text-xs text-zinc-600 hover:bg-zinc-100 flex items-center justify-center gap-1.5 shadow-none">
                    <Plus className="h-4 w-4" /> Add Experience Role
                  </Button>
                </div>
              )}
            </div>

            {/* Projects Block with inline Sparkles suggestions indicators */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white/40 dark:bg-zinc-900/25">
              <button onClick={() => toggleSection("projects")} className="w-full px-4 py-3 flex items-center justify-between font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-850/30">
                <span>Projects & Libraries ({cvData.projects.length})</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.projects && "rotate-180")} />
              </button>
              {openSections.projects && (
                <div className="p-4 border-t border-zinc-150/60 dark:border-zinc-800/40 space-y-4">
                  {cvData.projects.map((proj, projIdx) => (
                    <div key={proj.id} className="p-3 border border-zinc-150 rounded-xl bg-white/30 dark:bg-zinc-955/10 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-[10px] text-zinc-400">PROJECT #{projIdx + 1}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => moveProject(projIdx, "up")} className="p-1 text-zinc-450 hover:text-zinc-800"><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => moveProject(projIdx, "down")} className="p-1 text-zinc-450 hover:text-zinc-800"><ArrowDown className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-455">Project Title</label>
                          <Input value={proj.name} onChange={(e) => handleProjectChange(projIdx, "name", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-455">Technologies Meta</label>
                          <Input value={proj.meta} onChange={(e) => handleProjectChange(projIdx, "meta", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                        </div>
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-455">Overview Description</label>
                        <Input value={proj.description} onChange={(e) => handleProjectChange(projIdx, "description", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                      </div>

                      <div className="space-y-2 pt-2 border-t border-zinc-150/40">
                        <label className="text-[10px] font-bold text-zinc-455 uppercase tracking-wider block">Description Details</label>
                        {proj.bullets.map((bullet, bIdx) => {
                          const suggestion = proj.suggestions?.[bIdx];
                          return (
                            <div key={bIdx} className="space-y-1">
                              <div className="flex gap-2">
                                <Textarea
                                  value={bullet}
                                  onChange={(e) => {
                                    const bullets = [...proj.bullets];
                                    bullets[bIdx] = e.target.value;
                                    setCvData((prev) => {
                                      const projects = [...prev.projects];
                                      projects[projIdx] = { ...projects[projIdx], bullets };
                                      return { ...prev, projects };
                                    });
                                  }}
                                  rows={2}
                                  className="text-xs bg-white border border-zinc-250 rounded-lg flex-1 leading-normal shadow-none"
                                />
                                
                                <div className="flex flex-col gap-1 shrink-0">
                                  <button type="button" onClick={() => moveProjectBullet(projIdx, bIdx, "up")} className="text-zinc-400 hover:text-zinc-700"><ArrowUp className="h-3 w-3" /></button>
                                  <button type="button" onClick={() => moveProjectBullet(projIdx, bIdx, "down")} className="text-zinc-400 hover:text-zinc-700"><ArrowDown className="h-3 w-3" /></button>
                                </div>
                              </div>

                              {suggestion && (
                                <button
                                  type="button"
                                  onClick={() => setActiveSuggestion({
                                    section: "project",
                                    itemIdx: projIdx,
                                    bulletIdx: bIdx,
                                    text: suggestion.text,
                                    scoreBoost: suggestion.scoreBoost,
                                    reason: suggestion.reason
                                  })}
                                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-[10px] text-amber-700 border border-amber-200/50 transition-colors w-full font-bold shadow-none"
                                >
                                  <Sparkles className="h-3 w-3 text-amber-600 animate-bounce" />
                                  <span>Athena tailoring suggestion available (+{suggestion.scoreBoost}% boost)</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <Button type="button" onClick={handleAddProject} variant="outline" className="w-full h-9 rounded-lg border-zinc-200 border-dashed text-xs text-zinc-600 hover:bg-zinc-100 flex items-center justify-center gap-1.5 shadow-none">
                    <Plus className="h-4 w-4" /> Add Project Section
                  </Button>
                </div>
              )}
            </div>

            {/* Education Block */}
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-white/40 dark:bg-zinc-900/25">
              <button onClick={() => toggleSection("education")} className="w-full px-4 py-3 flex items-center justify-between font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-850/30">
                <span>Education Details ({cvData.educationList.length})</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.education && "rotate-180")} />
              </button>
              {openSections.education && (
                <div className="p-4 border-t border-zinc-150/60 dark:border-zinc-800/40 space-y-4">
                  {cvData.educationList.map((edu, eduIdx) => (
                    <div key={edu.id} className="p-3 border border-zinc-150 rounded-xl bg-white/30 dark:bg-zinc-950/10 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-[10px] text-zinc-400 font-mono">EDU #{eduIdx + 1}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => moveEducation(eduIdx, "up")} className="p-1 text-zinc-450 hover:text-zinc-805"><ArrowUp className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => moveEducation(eduIdx, "down")} className="p-1 text-zinc-450 hover:text-zinc-805"><ArrowDown className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-455">School/University</label>
                          <Input value={edu.school} onChange={(e) => handleEducationChange(eduIdx, "school", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-455">Degree Title</label>
                          <Input value={edu.degree} onChange={(e) => handleEducationChange(eduIdx, "degree", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-455">Location</label>
                          <Input value={edu.location} onChange={(e) => handleEducationChange(eduIdx, "location", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-455">Date Range</label>
                          <Input value={edu.dateRange} onChange={(e) => handleEducationChange(eduIdx, "dateRange", e.target.value)} className="h-9 text-xs bg-white border border-zinc-250 rounded-lg shadow-none" />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button type="button" onClick={handleAddEducation} variant="outline" className="w-full h-9 rounded-lg border-zinc-200 border-dashed text-xs text-zinc-600 hover:bg-zinc-100 flex items-center justify-center gap-1.5 shadow-none">
                    <Plus className="h-4 w-4" /> Add Education Row
                  </Button>
                </div>
              )}
            </div>

            {/* Optional sections */}
            {(["achievements", "awards"] as const).map((field) => {
              const Icon = field === "achievements" ? Trophy : Award;
              const label = field === "achievements" ? "Achievements" : "Awards";
              const items = cvData[field] ?? [];
              return (
                <div key={field} className="overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-white/40 dark:border-zinc-700 dark:bg-zinc-900/25">
                  <button onClick={() => toggleSection(field)} className="flex w-full items-center justify-between px-4 py-3 font-bold text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/30">
                    <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-zinc-400" />Optional: {label} ({items.length})</span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", openSections[field] && "rotate-180")} />
                  </button>
                  {openSections[field] && (
                    <div className="space-y-2 border-t border-zinc-150/60 p-4 dark:border-zinc-800/40">
                      {items.map((item, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <Textarea value={item} onChange={(event) => updateOptionalItem(field, index, event.target.value)} rows={2} placeholder={field === "achievements" ? "e.g. Increased API throughput by 40%" : "e.g. Winner, 2026 University Hackathon"} className="min-h-16 flex-1 bg-white text-xs shadow-none" />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeOptionalItem(field, index)} aria-label={`Remove ${label.toLowerCase()} item`} className="h-8 w-8 text-zinc-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" onClick={() => addOptionalItem(field)} className="h-9 w-full border-dashed text-xs shadow-none"><Plus className="mr-1.5 h-3.5 w-3.5" />Add {label.slice(0, -1)}</Button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Custom Skills Tag editors */}
            <div id="cv-section-skills" className="overflow-hidden rounded-xl border border-zinc-200 bg-white/40 dark:border-zinc-800 dark:bg-zinc-900/25">
              <button type="button" onClick={() => toggleSection("skills")} className="flex w-full items-center justify-between px-4 py-3 font-bold text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/30"><span>Targeted Key Skills</span><ChevronDown className={cn("h-4 w-4 transition-transform", openSections.skills && "rotate-180")} /></button>
              {openSections.skills && <div className="border-t border-zinc-100 p-4 dark:border-zinc-800"><SkillsTagEditor categories={cvData.skills} onChange={(skills) => setCvData((prev) => ({ ...prev, skills }))} /></div>}
            </div>

          </div>}
        </div>

        {/* Right Columns A4 Page preview sheets */}
        <div className="lg:col-span-8 flex min-h-[600px] flex-col">
          {activeDraft?.sourcePdfUrl && !showSuggestedCV ? (
            <div className="flex h-full min-h-[700px] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex min-h-14 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                <div><p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Your uploaded CV</p><p className="text-[10px] text-zinc-500">Shown exactly as uploaded · your original remains unchanged</p></div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="text-[9px]">Original</Badge>
                  <Button type="button" size="sm" onClick={generateSuggestedCV} disabled={isGeneratingCV} className="h-8 bg-indigo-600 px-3 text-[11px] text-white hover:bg-indigo-700">
                    {isGeneratingCV ? <><RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />Creating…</> : <><Sparkles className="mr-1.5 h-3.5 w-3.5" />Create suggested CV</>}
                  </Button>
                </div>
              </div>
              <iframe title="Original uploaded CV" src={`${activeDraft.sourcePdfUrl}#toolbar=1&navpanes=0&view=FitH`} className="min-h-0 flex-1 bg-white" />
            </div>
          ) : (
            <CVPDFPreview cvData={cvData} onExport={onExport} />
          )}
        </div>

      </div>

    </div>
  );
}
