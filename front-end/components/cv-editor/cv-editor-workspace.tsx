"use client";

import React, { useState } from "react";
import { CVPDFPreview, CVData } from "./cv-pdf-preview";
import { SkillsTagEditor, SkillCategory } from "./skills-tag-editor";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Sparkles, Save, ShieldCheck, ChevronDown, ChevronUp, Plus, Trash2, ArrowUp, ArrowDown, Settings, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CVEditorWorkspaceProps {
  initialData: CVData;
  onBack: () => void;
  onSave: (data: CVData) => void;
}

// Extend CVData structure for Projects and Education
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
  initialData,
  onBack,
  onSave,
}: CVEditorWorkspaceProps) {
  // Convert basic CVData to Extended CVData
  const initialExtended: CVDataExtended = {
    ...initialData,
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
            text: "Developed and verified unit test suites with JUnit 5 and Mockito achieving 95% coverage, securing service layers against concurrent transaction hazards.",
            scoreBoost: 8,
            reason: "Emphasizes technical metrics ('95% coverage') and concurrency safety which maps closer to Senior roles.",
          },
        },
      },
    ],
    educationList: [
      {
        id: "edu-1",
        school: "Macquarie University",
        degree: "Bachelor of Information Technology (Major in Software Technology)",
        location: "Sydney, Australia",
        dateRange: "Feb 2025 - Present",
        details: [
          "Relevant Coursework: Fundamentals of Computer Science, Data Structure & Algorithms, Networking and Cloud Computing, Database Systems, Artificial Intelligence for Text and Vision, Project Management",
          "Honours & Awards: 1st Place in Faculty of Science and Engineering Showcase (Macquarie Uni), Dean's List 2026, People's Choice Poster Award, 2nd Prize in City Computer Science Competition (DSA), UNICEF Hackathon Award, Vice-Chancellor Scholarship.",
        ],
      },
    ],
  };

  const [cvData, setCvData] = useState<CVDataExtended>(initialExtended);
  const [activeSection, setActiveSection] = useState<string | null>("experience");
  const [roleTitle, setRoleTitle] = useState("Backend Engineer");
  const [seniority, setSeniority] = useState("Junior (0-2 years)");
  const [isSaving, setIsSaving] = useState(false);
  const [matchScore, setMatchScore] = useState(87);

  // Suggested enhancement overlay state
  const [activeSuggestion, setActiveSuggestion] = useState<{
    section: "experience" | "project";
    itemIdx: number;
    bulletIdx: number;
    text: string;
    scoreBoost: number;
    reason: string;
  } | null>(null);

  const toggleSection = (section: string) => {
    setActiveSection(activeSection === section ? null : section);
  };

  // State swappers for re-ordering experiences
  const moveExperience = (index: number, direction: "up" | "down") => {
    const list = [...cvData.experience];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    // Swap elements
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;

    setCvData((prev) => ({ ...prev, experience: list }));
  };

  // State swappers for re-ordering projects
  const moveProject = (index: number, direction: "up" | "down") => {
    const list = [...cvData.projects];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    // Swap elements
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;

    setCvData((prev) => ({ ...prev, projects: list }));
  };

  // State swappers for re-ordering education
  const moveEducation = (index: number, direction: "up" | "down") => {
    const list = [...cvData.educationList];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    // Swap elements
    const temp = list[index];
    list[index] = list[targetIdx];
    list[targetIdx] = temp;

    setCvData((prev) => ({ ...prev, educationList: list }));
  };

  // Reorder experience bullets
  const moveExperienceBullet = (expIndex: number, bulletIndex: number, direction: "up" | "down") => {
    const bullets = [...cvData.experience[expIndex].bullets];
    const targetIdx = direction === "up" ? bulletIndex - 1 : bulletIndex + 1;
    if (targetIdx < 0 || targetIdx >= bullets.length) return;

    const temp = bullets[bulletIndex];
    bullets[bulletIndex] = bullets[targetIdx];
    bullets[targetIdx] = temp;

    setCvData((prev) => {
      const experience = [...prev.experience];
      experience[expIndex] = { ...experience[expIndex], bullets };
      return { ...prev, experience };
    });
  };

  // Reorder project bullets
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

  // Dynamic add handlers
  const handleAddExperience = () => {
    const newExp = {
      company: "New Company",
      role: "Software Engineer",
      location: "Sydney, Australia",
      date: "Jan 2026 - Present",
      bullets: ["Developed frontend structures using React 19.", "Tested core modules."],
    };
    setCvData((prev) => ({ ...prev, experience: [...prev.experience, newExp] }));
  };

  const handleAddProject = () => {
    const newProj: ProjectItem = {
      id: `proj-${Date.now()}`,
      name: "New Project",
      meta: "React, Node.js, CSS",
      description: "Project description details.",
      bullets: ["Wrote unit testing cases.", "Built custom components."],
    };
    setCvData((prev) => ({ ...prev, projects: [...prev.projects, newProj] }));
  };

  const handleAddEducation = () => {
    const newEdu: EducationItem = {
      id: `edu-${Date.now()}`,
      school: "Stanford University",
      degree: "Computer Science Specialization",
      location: "Stanford, CA",
      dateRange: "2026",
      details: ["Specialized course study loops."],
    };
    setCvData((prev) => ({ ...prev, educationList: [...prev.educationList, newEdu] }));
  };

  const handleContactChange = (field: keyof CVDataExtended, value: string) => {
    setCvData((prev) => ({ ...prev, [field]: value }));
  };

  const handleExperienceChange = (
    index: number,
    field: "company" | "role" | "location" | "date",
    value: string
  ) => {
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

  return (
    <div className="flex flex-col flex-1 min-h-0 space-y-6">
      {/* Stepper bar name change to Athena */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="h-9 px-3 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Overview
          </Button>

          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-zinc-900 dark:text-zinc-300">{cvData.fullName}</span>
            <span className="text-zinc-350 dark:text-zinc-700">/</span>
            <select
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              className="bg-transparent font-semibold border-none text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer text-xs"
            >
              <option value="Backend Engineer">Backend Engineer</option>
              <option value="Senior Frontend Architect">Senior Frontend Architect</option>
            </select>
            <span className="text-zinc-350 dark:text-zinc-700">/</span>
            <select
              value={seniority}
              onChange={(e) => setSeniority(e.target.value)}
              className="bg-transparent text-zinc-550 border-none focus:outline-none cursor-pointer text-xs"
            >
              <option value="Junior (0-2 years)">Junior (0-2 years)</option>
              <option value="Senior (5+ years)">Senior (5+ years)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Match Score Indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-indigo-500/25 bg-indigo-500/5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
            {matchScore} / 100 match
          </div>

          <Button
            variant="outline"
            onClick={handleSaveClick => {
              setIsSaving(true);
              setTimeout(() => {
                setIsSaving(false);
                onSave(cvData);
              }, 800);
            }}
            disabled={isSaving}
            className="h-9 px-4 border-zinc-200 dark:border-zinc-800 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? "Saving..." : "Save Draft"}
          </Button>
        </div>
      </div>

      {/* Main Workspace splits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[500px]">
        {/* Left Forms */}
        <div className="space-y-4 overflow-y-auto pr-2 max-h-[750px] relative">
          
          {/* Active Suggestion Overlay Card */}
          {activeSuggestion && (
            <div className="p-4 rounded-xl border border-indigo-500 bg-indigo-500/10 text-xs leading-normal space-y-3 shadow-md animate-in slide-in-from-top-2 duration-200">
              <div>
                <h4 className="font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1">
                  <Sparkles className="h-4 w-4" />
                  Athena AI Enhancement Suggestion
                </h4>
                <p className="text-[10px] text-zinc-500 mt-0.5">Reason: {activeSuggestion.reason}</p>
              </div>
              <p className="p-2.5 rounded bg-white dark:bg-zinc-950 border border-indigo-150 font-mono text-[10.5px]">
                {activeSuggestion.text}
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveSuggestion(null)}
                  className="h-8 text-[11px] border-zinc-200 dark:border-zinc-800"
                >
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  onClick={handleApplySuggestion}
                  className="h-8 text-[11px] bg-indigo-600 dark:bg-indigo-500 text-white hover:bg-indigo-700 flex items-center gap-1"
                >
                  <Check className="h-3.5 w-3.5" />
                  Apply (+{activeSuggestion.scoreBoost}% match)
                </Button>
              </div>
            </div>
          )}

          {/* Contact Details Card */}
          <Card className="border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md shadow-sm">
            <button
              onClick={() => toggleSection("contact")}
              className="w-full flex items-center justify-between p-4 text-left font-bold text-xs uppercase tracking-wider text-zinc-500 select-none"
            >
              <span>Contact Details</span>
              {activeSection === "contact" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {activeSection === "contact" && (
              <CardContent className="pt-0 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-zinc-500">Full Name</label>
                    <Input value={cvData.fullName} onChange={(e) => handleContactChange("fullName", e.target.value)} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-zinc-500">Email</label>
                    <Input value={cvData.email} onChange={(e) => handleContactChange("email", e.target.value)} className="h-9 text-xs" />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Experience list with re-ordering & add items matching Image 1 */}
          <Card className="border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md shadow-sm">
            <div className="flex justify-between items-center p-4 border-b border-zinc-150/20 dark:border-zinc-800/20">
              <span className="font-bold text-xs uppercase tracking-wider text-zinc-500">Experience</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddExperience}
                className="h-8 text-xs flex items-center gap-1 border-zinc-250 dark:border-zinc-800"
              >
                <Plus className="h-3.5 w-3.5" />
                Add experience
              </Button>
            </div>
            {activeSection === "experience" && (
              <CardContent className="pt-4 space-y-6 text-xs">
                {cvData.experience.map((exp, expIdx) => (
                  <div key={expIdx} className="space-y-4 p-4 rounded-xl border border-zinc-200/50 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 relative">
                    {/* Reorder Experience handles */}
                    <div className="absolute right-4 top-4 flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => moveExperience(expIdx, "up")} className="h-7 w-7 text-zinc-400">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => moveExperience(expIdx, "down")} className="h-7 w-7 text-zinc-400">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="font-semibold text-zinc-500">Company</label>
                        <Input value={exp.company} onChange={(e) => handleExperienceChange(expIdx, "company", e.target.value)} className="h-9 text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="font-semibold text-zinc-500">Title</label>
                        <Input value={exp.role} onChange={(e) => handleExperienceChange(expIdx, "role", e.target.value)} className="h-9 text-xs" />
                      </div>
                    </div>

                    {/* Bullets stack with edit toolbars */}
                    <div className="space-y-2">
                      <label className="font-bold text-zinc-500">Bullets</label>
                      {exp.bullets.map((bullet, bIdx) => (
                        <div key={bIdx} className="flex gap-2 items-start group">
                          {/* Mock Drag Handle */}
                          <div className="flex flex-col gap-0.5 mt-2 flex-shrink-0 cursor-row-resize">
                            <Button size="icon" variant="ghost" onClick={() => moveExperienceBullet(expIdx, bIdx, "up")} className="h-4 w-4 p-0 text-zinc-400 hover:text-zinc-650">
                              <ArrowUp className="h-2.5 w-2.5" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => moveExperienceBullet(expIdx, bIdx, "down")} className="h-4 w-4 p-0 text-zinc-400 hover:text-zinc-650">
                              <ArrowDown className="h-2.5 w-2.5" />
                            </Button>
                          </div>

                          <Textarea value={bullet} className="text-xs leading-relaxed py-1.5 px-3 min-h-[45px] resize-none flex-1 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>

          {/* Projects list matching Image 2 */}
          <Card className="border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md shadow-sm">
            <div className="flex justify-between items-center p-4 border-b border-zinc-150/20 dark:border-zinc-800/20">
              <span className="font-bold text-xs uppercase tracking-wider text-zinc-500">Projects</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddProject}
                className="h-8 text-xs flex items-center gap-1 border-zinc-250 dark:border-zinc-800"
              >
                <Plus className="h-3.5 w-3.5" />
                Add project
              </Button>
            </div>
            <CardContent className="pt-4 space-y-6 text-xs">
              {cvData.projects.map((proj, projIdx) => (
                <div key={proj.id} className="space-y-4 p-4 rounded-xl border border-zinc-200/50 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 relative">
                  {/* Reorder handlers */}
                  <div className="absolute right-4 top-4 flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => moveProject(projIdx, "up")} className="h-7 w-7 text-zinc-400">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => moveProject(projIdx, "down")} className="h-7 w-7 text-zinc-400">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-semibold text-zinc-500">Name</label>
                      <Input value={proj.name} onChange={(e) => handleProjectChange(projIdx, "name", e.target.value)} className="h-9 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-semibold text-zinc-500">Meta (year / stack)</label>
                      <Input value={proj.meta} onChange={(e) => handleProjectChange(projIdx, "meta", e.target.value)} className="h-9 text-xs" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-zinc-500">Short description (optional)</label>
                    <Input value={proj.description} onChange={(e) => handleProjectChange(projIdx, "description", e.target.value)} className="h-9 text-xs" />
                  </div>

                  {/* Project Bullets with colored match indicators */}
                  <div className="space-y-2">
                    <label className="font-bold text-zinc-500">Bullets</label>
                    {proj.bullets.map((bullet, bIdx) => {
                      const hasSuggestion = proj.suggestions && proj.suggestions[bIdx];
                      return (
                        <div key={bIdx} className="flex gap-2 items-start group relative">
                          {/* Drag swapper handles */}
                          <div className="flex flex-col gap-0.5 mt-2 flex-shrink-0 cursor-row-resize">
                            <Button size="icon" variant="ghost" onClick={() => moveProjectBullet(projIdx, bIdx, "up")} className="h-4 w-4 p-0 text-zinc-400">
                              <ArrowUp className="h-2.5 w-2.5" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => moveProjectBullet(projIdx, bIdx, "down")} className="h-4 w-4 p-0 text-zinc-400">
                              <ArrowDown className="h-2.5 w-2.5" />
                            </Button>
                          </div>

                          {/* AI Suggestion Indicator Dot matching Image 2 */}
                          {hasSuggestion && (
                            <button
                              type="button"
                              onClick={() =>
                                setActiveSuggestion({
                                  section: "project",
                                  itemIdx: projIdx,
                                  bulletIdx: bIdx,
                                  text: proj.suggestions![bIdx].text,
                                  scoreBoost: proj.suggestions![bIdx].scoreBoost,
                                  reason: proj.suggestions![bIdx].reason,
                                })
                              }
                              className="h-2 w-2 rounded-full bg-amber-500 mt-3.5 flex-shrink-0 animate-ping border border-amber-500"
                              title="Click to view suggestion"
                            />
                          )}

                          <Textarea
                            value={bullet}
                            onChange={(e) => {
                              const updated = [...cvData.projects];
                              updated[projIdx].bullets[bIdx] = e.target.value;
                              setCvData((prev) => ({ ...prev, projects: updated }));
                            }}
                            className="text-xs leading-relaxed py-1.5 px-3 min-h-[55px] resize-none flex-1 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Education list matching Image 3 */}
          <Card className="border-zinc-200/50 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md shadow-sm">
            <div className="flex justify-between items-center p-4 border-b border-zinc-150/20 dark:border-zinc-800/20">
              <span className="font-bold text-xs uppercase tracking-wider text-zinc-500">Education</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddEducation}
                className="h-8 text-xs flex items-center gap-1 border-zinc-250 dark:border-zinc-800"
              >
                <Plus className="h-3.5 w-3.5" />
                Add education
              </Button>
            </div>
            <CardContent className="pt-4 space-y-6 text-xs">
              {cvData.educationList.map((edu, eduIdx) => (
                <div key={edu.id} className="space-y-4 p-4 rounded-xl border border-zinc-200/50 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 relative">
                  {/* Reorder controls */}
                  <div className="absolute right-4 top-4 flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => moveEducation(eduIdx, "up")} className="h-7 w-7 text-zinc-400">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => moveEducation(eduIdx, "down")} className="h-7 w-7 text-zinc-400">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-semibold text-zinc-500">School</label>
                      <Input value={edu.school} onChange={(e) => handleEducationChange(eduIdx, "school", e.target.value)} className="h-9 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-semibold text-zinc-500">Degree</label>
                      <Input value={edu.degree} onChange={(e) => handleEducationChange(eduIdx, "degree", e.target.value)} className="h-9 text-xs" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-semibold text-zinc-500">Location</label>
                      <Input value={edu.location} onChange={(e) => handleEducationChange(eduIdx, "location", e.target.value)} className="h-9 text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-semibold text-zinc-500">Dates Range</label>
                      <Input value={edu.dateRange} onChange={(e) => handleEducationChange(eduIdx, "dateRange", e.target.value)} className="h-9 text-xs" />
                    </div>
                  </div>

                  {/* Details bullet points */}
                  <div className="space-y-2">
                    <label className="font-bold text-zinc-500">Details</label>
                    {edu.details.map((detail, dIdx) => (
                      <div key={dIdx} className="flex gap-2 items-center">
                        <Textarea
                          value={detail}
                          onChange={(e) => {
                            const updated = [...cvData.educationList];
                            updated[eduIdx].details[dIdx] = e.target.value;
                            setCvData((prev) => ({ ...prev, educationList: updated }));
                          }}
                          className="text-xs leading-relaxed py-1.5 px-3 min-h-[50px] resize-none flex-1 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live PDF view updated to show projects and education */}
        <div className="h-full min-h-0 print:col-span-2">
          <CVPDFPreview cvData={cvData} />
        </div>
      </div>
    </div>
  );
}
