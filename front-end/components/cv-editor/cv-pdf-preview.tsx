"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ZoomIn, ZoomOut, Maximize2, Mail, Phone, MapPin, Globe, Link } from "lucide-react";
import { SkillCategory } from "./skills-tag-editor";

export interface CVData {
  fullName: string;
  headline?: string;
  email: string;
  phone: string;
  location: string;
  github: string;
  linkedin: string;
  summary: string;
  skills: SkillCategory[];
  experience: {
    company: string;
    role: string;
    location: string;
    date: string;
    bullets: string[];
  }[];
  projects?: {
    id: string;
    name: string;
    meta: string;
    description: string;
    bullets: string[];
  }[];
  educationList?: {
    id: string;
    school: string;
    degree: string;
    location: string;
    dateRange: string;
    wam?: string;
    coursework?: string[];
    honoursAwards?: string[];
    details: string[];
  }[];
  achievements?: string[];
  awards?: string[];
  sectionOrder?: CVSectionKey[];
}

export type CVSectionKey = "summary" | "skills" | "experience" | "projects" | "education" | "achievements" | "awards";

const DEFAULT_SECTION_ORDER: CVSectionKey[] = ["summary", "skills", "experience", "projects", "education", "achievements", "awards"];

interface CVPDFPreviewProps {
  cvData: CVData;
  onExport?: () => void;
}

const MIN_ZOOM = 50;
const MAX_ZOOM = 150;
const ZOOM_STEP = 10;

export function CVPDFPreview({ cvData, onExport }: CVPDFPreviewProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const [zoomLevel, setZoomLevel] = useState(100);
  const [autoFitScale, setAutoFitScale] = useState(1);
  const [sheetSize, setSheetSize] = useState<{ width: number; height: number } | null>(null);
  const [pageCount, setPageCount] = useState(1);

  // Recompute the shrink-to-fit scale whenever the viewport or CV content size changes,
  // so the fixed-size A4 sheet never forces the page to scroll horizontally on mobile.
  useEffect(() => {
    const scrollEl = scrollAreaRef.current;
    const sheetEl = sheetRef.current;
    if (!scrollEl || !sheetEl) return;

    const recompute = () => {
      const styles = getComputedStyle(scrollEl);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const availableWidth = scrollEl.clientWidth - paddingX;
      const naturalWidth = sheetEl.offsetWidth;
      const naturalHeight = sheetEl.scrollHeight;
      setSheetSize({ width: naturalWidth, height: naturalHeight });
      setPageCount(Math.max(1, Math.ceil(naturalHeight / (11 * 96))));
      if (naturalWidth > 0 && availableWidth > 0) {
        setAutoFitScale(Math.min(1, availableWidth / naturalWidth));
      }
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(scrollEl);
    observer.observe(sheetEl);
    return () => observer.disconnect();
  }, [cvData]);

  const effectiveScale = autoFitScale * (zoomLevel / 100);
  const sectionOrder = cvData.sectionOrder ?? DEFAULT_SECTION_ORDER;
  const orderFor = (section: CVSectionKey) => {
    const index = sectionOrder.indexOf(section);
    return index === -1 ? DEFAULT_SECTION_ORDER.indexOf(section) + 1 : index + 1;
  };

  const handleZoomOut = () => setZoomLevel((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  const handleZoomIn = () => setZoomLevel((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  const handleResetZoom = () => setZoomLevel(100);

  const handleExportPDF = () => {
    const previousTitle = document.title;
    const safeName = (cvData.fullName || "resume").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    document.title = `${safeName || "resume"}-CV`;
    const style = document.createElement("style");
    style.innerHTML = `
      @page {
        size: Letter portrait;
        margin: 0;
      }
      @media print {
        html, body {
          width: 215.9mm !important;
          min-height: 279.4mm !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body * {
          visibility: hidden;
        }
        #printable-resume-sheet, #printable-resume-sheet * {
          visibility: visible;
        }
        .cv-scale-wrapper {
          position: static !important;
          width: auto !important;
          height: auto !important;
        }
        #printable-resume-sheet {
          position: absolute;
          left: 0;
          top: 0;
          display: flex !important;
          flex-direction: column !important;
          width: 215.9mm !important;
          min-height: 279.4mm !important;
          box-sizing: border-box !important;
          transform: none !important;
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          padding: 10mm 12mm !important;
          margin: 0 !important;
          overflow: visible !important;
        }
        #printable-resume-sheet > div,
        #printable-resume-sheet li {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        a {
          color: inherit !important;
          text-decoration: none !important;
        }
      }
    `;
    document.head.appendChild(style);
    const cleanup = () => {
      document.title = previousTitle;
      style.remove();
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    onExport?.();
    window.print();
    window.setTimeout(() => {
      if (style.isConnected) cleanup();
    }, 2000);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/10 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Live Preview top bar controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-12 px-3 sm:px-6 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            LIVE PREVIEW
          </span>
          <Badge variant="outline" className="text-[9px] border-amber-500/20 bg-amber-500/5 text-amber-600 font-semibold px-2 py-0.5">
            {pageCount} {pageCount === 1 ? "page" : "pages"}
          </Badge>
        </div>

        {/* Zoom & Export Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 border border-zinc-200/50 dark:border-zinc-700/50">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoomLevel <= MIN_ZOOM}
              aria-label="Zoom out"
              title="Zoom out"
              className="h-7 w-7 rounded-md text-zinc-500"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[10px] font-semibold px-1 text-zinc-600 dark:text-zinc-400 tabular-nums w-8 text-center">
              {zoomLevel}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoomLevel >= MAX_ZOOM}
              aria-label="Zoom in"
              title="Zoom in"
              className="h-7 w-7 rounded-md text-zinc-500"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleResetZoom}
            aria-label="Reset zoom to fit width"
            title="Reset zoom to fit width"
            className="h-8 w-8 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg border border-zinc-200/50 dark:border-zinc-800"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>

          <Button
            onClick={handleExportPDF}
            aria-label="Export PDF"
            className="h-8 px-3 rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-500/20 hover:bg-indigo-700 flex items-center gap-1"
          >
            <Download className="h-3 w-3" />
            <span className="hidden sm:inline">Export PDF</span>
          </Button>
        </div>
      </div>

      {/* A4 Sheet Container - scales to fit narrow viewports so it never forces page-level horizontal scroll */}
      <div ref={scrollAreaRef} className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center bg-zinc-100/50 dark:bg-zinc-950/20 print:p-0">
        <div
          className="cv-scale-wrapper relative flex-shrink-0"
          style={{
            width: sheetSize ? sheetSize.width * effectiveScale : undefined,
            height: sheetSize ? sheetSize.height * effectiveScale : undefined,
          }}
        >
          <div
            ref={sheetRef}
            id="printable-resume-sheet"
            className="absolute top-0 left-0 w-[8.5in] min-h-[11in] bg-white text-black p-[0.48in] border border-zinc-200 shadow-xl rounded-sm text-left flex flex-col font-sans leading-tight print:border-none print:shadow-none"
            style={{ fontSize: "13px", transform: `scale(${effectiveScale})`, transformOrigin: "top left" }}
          >
            {/* Header Contact Block */}
            <div className="order-0 space-y-0.5 pb-2 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 leading-none">
                {cvData.fullName || "Your Name"}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 text-[12px] font-medium text-zinc-700">
                {cvData.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {cvData.email}
                  </span>
                )}
                {cvData.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {cvData.phone}
                  </span>
                )}
                {cvData.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {cvData.location}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-center gap-4 text-[12px] font-medium text-zinc-700">
                {cvData.github && (
                  <a href={cvData.github} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                    <Globe className="h-3 w-3" />
                    {cvData.github.replace(/^https?:\/\//, "")}
                  </a>
                )}
                {cvData.linkedin && (
                  <a href={cvData.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                    <Link className="h-3 w-3" />
                    {cvData.linkedin.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            </div>

            {/* Summary Section */}
            {cvData.summary && (
              <div className="mt-2 space-y-1" style={{ order: orderFor("summary") }}>
                <h3 className="border-b border-zinc-800 pb-0.5 text-[14px] font-bold text-zinc-900">
                  Summary
                </h3>
                <p className="text-zinc-600 leading-relaxed">
                  {cvData.summary}
                </p>
              </div>
            )}

            {/* Skills Section */}
            {cvData.skills.length > 0 && (
              <div className="mt-2 space-y-1" style={{ order: orderFor("skills") }}>
                <h3 className="border-b border-zinc-800 pb-0.5 text-[14px] font-bold text-zinc-900">
                  Skills
                </h3>
                <div className="space-y-1 text-zinc-600">
                  {cvData.skills.map((category) => (
                    <p key={category.id} className="leading-relaxed">
                      <strong className="font-bold text-zinc-800">{category.name}:</strong>{" "}
                      {category.items.join(", ")}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Experience Section */}
            {cvData.experience.length > 0 && (
              <div className="mt-2 space-y-1" style={{ order: orderFor("experience") }}>
                <h3 className="border-b border-zinc-800 pb-0.5 text-[14px] font-bold text-zinc-900">
                  Experience
                </h3>
                <div className="space-y-2">
                  {cvData.experience.map((exp, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <strong className="font-bold text-zinc-900">{exp.company}</strong>
                          <span className="text-zinc-400 mx-1.5">|</span>
                          <span className="text-zinc-600 italic">{exp.role}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-400 font-medium text-[11.5px]">
                          <span>{exp.location}</span>
                          <span>•</span>
                          <span>{exp.date}</span>
                        </div>
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-zinc-600 leading-relaxed">
                        {exp.bullets.map((b, bIdx) => (
                          <li key={bIdx}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Projects Section */}
            {cvData.projects && cvData.projects.length > 0 && (
              <div className="mt-2 space-y-1" style={{ order: orderFor("projects") }}>
                <h3 className="border-b border-zinc-800 pb-0.5 text-[14px] font-bold text-zinc-900">
                  Projects
                </h3>
                <div className="space-y-2">
                  {cvData.projects.map((proj) => (
                    <div key={proj.id} className="space-y-0.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <strong className="font-bold text-zinc-900">{proj.name}</strong>
                          <span className="text-zinc-400 mx-1.5">|</span>
                          <span className="text-zinc-600 italic">{proj.meta}</span>
                        </div>
                      </div>
                      {proj.description && (
                        <p className="text-[12.5px] text-zinc-500 italic pl-1 leading-normal">
                          {proj.description}
                        </p>
                      )}
                      <ul className="list-disc pl-4 space-y-0.5 text-zinc-600 leading-relaxed">
                        {proj.bullets.map((b, bIdx) => (
                          <li key={bIdx}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education Section */}
            {cvData.educationList && cvData.educationList.length > 0 && (
              <div className="mt-2 space-y-1" style={{ order: orderFor("education") }}>
                <h3 className="border-b border-zinc-800 pb-0.5 text-[14px] font-bold text-zinc-900">
                  Education
                </h3>
                <div className="space-y-2">
                  {cvData.educationList.map((edu) => (
                    <div key={edu.id} className="space-y-0.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <strong className="font-bold text-zinc-900">{edu.school}</strong>
                          <span className="text-zinc-400 mx-1.5">|</span>
                          <span className="text-zinc-600 italic">{edu.degree}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-400 font-medium text-[11.5px]">
                          <span>{edu.location}</span>
                          <span>•</span>
                          <span>{edu.dateRange}</span>
                        </div>
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-zinc-600 leading-relaxed">
                        {edu.wam && <li>WAM: {edu.wam}</li>}
                        {edu.coursework && edu.coursework.length > 0 && <li>Relevant Coursework: {edu.coursework.join(", ")}</li>}
                        {edu.honoursAwards && edu.honoursAwards.length > 0 && <li>Honours &amp; Awards: {edu.honoursAwards.join(", ")}</li>}
                        {edu.details.map((detail, dIdx) => (
                          <li key={dIdx}>{detail}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cvData.achievements && cvData.achievements.length > 0 && (
              <div className="mt-2 space-y-1" style={{ order: orderFor("achievements") }}>
                <h3 className="border-b border-zinc-800 pb-0.5 text-[14px] font-bold text-zinc-900">Achievements</h3>
                <ul className="list-disc space-y-0.5 pl-4 leading-relaxed text-zinc-600">{cvData.achievements.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </div>
            )}

            {cvData.awards && cvData.awards.length > 0 && (
              <div className="mt-2 space-y-1" style={{ order: orderFor("awards") }}>
                <h3 className="border-b border-zinc-800 pb-0.5 text-[14px] font-bold text-zinc-900">Awards</h3>
                <ul className="list-disc space-y-0.5 pl-4 leading-relaxed text-zinc-600">{cvData.awards.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
