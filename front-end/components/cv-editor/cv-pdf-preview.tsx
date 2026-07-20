"use client";

import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ZoomIn, ZoomOut, Maximize2, Mail, Phone, MapPin, Globe, Link, ExternalLink } from "lucide-react";
import { SkillCategory } from "./skills-tag-editor";

export interface CVData {
  fullName: string;
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
    details: string[];
  }[];
}

interface CVPDFPreviewProps {
  cvData: CVData;
}

export function CVPDFPreview({ cvData }: CVPDFPreviewProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  const handleExportPDF = () => {
    const style = document.createElement("style");
    style.innerHTML = `
      @media print {
        body * {
          visibility: hidden;
        }
        #printable-resume-sheet, #printable-resume-sheet * {
          visibility: visible;
        }
        #printable-resume-sheet {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          margin: 0 !important;
        }
      }
    `;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => {
      document.head.removeChild(style);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/10 dark:bg-black/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Live Preview top bar controls matching Image 1 */}
      <div className="flex h-12 items-center justify-between px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            LIVE PREVIEW
          </span>
          <Badge variant="outline" className="text-[9px] border-amber-500/20 bg-amber-500/5 text-amber-600 font-semibold px-2 py-0.5">
            2 pages
          </Badge>
        </div>

        {/* Zoom & Export Actions */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 border border-zinc-200/50 dark:border-zinc-700/50">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-zinc-500">
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[10px] font-semibold px-1 text-zinc-600 dark:text-zinc-400">100%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-zinc-500">
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg border border-zinc-200/50 dark:border-zinc-800"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>

          <Button
            onClick={handleExportPDF}
            className="h-8 px-3 rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-500/20 hover:bg-indigo-700 flex items-center gap-1"
          >
            <Download className="h-3 w-3" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* A4 Sheet Container */}
      <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-zinc-100/50 dark:bg-zinc-950/20 print:p-0">
        <div
          ref={printAreaRef}
          id="printable-resume-sheet"
          className="w-[8.27in] min-h-[11.69in] bg-white text-black p-[0.75in] border border-zinc-200 shadow-xl rounded-sm text-left flex flex-col font-sans leading-normal print:border-none print:shadow-none"
          style={{ fontSize: "10.5px" }}
        >
          {/* Header Contact Block */}
          <div className="text-center space-y-2 border-b border-zinc-200 pb-5">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 leading-none">
              {cvData.fullName || "Your Name"}
            </h1>
            <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1 text-zinc-500 text-[10px] font-medium mt-1">
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
            <div className="flex justify-center items-center gap-4 text-zinc-500 text-[9px] font-medium">
              {cvData.github && (
                <a href={cvData.github} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                  <Globe className="h-3 w-3" />
                  GitHub Profile
                </a>
              )}
              {cvData.linkedin && (
                <a href={cvData.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                  <Link className="h-3 w-3" />
                  LinkedIn Profile
                </a>
              )}
            </div>
          </div>

          {/* Summary Section */}
          {cvData.summary && (
            <div className="mt-4 space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-150 pb-0.5">
                Summary
              </h3>
              <p className="text-zinc-655 leading-relaxed">
                {cvData.summary}
              </p>
            </div>
          )}

          {/* Skills Section */}
          {cvData.skills.length > 0 && (
            <div className="mt-4 space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-150 pb-0.5">
                Skills
              </h3>
              <div className="space-y-1 text-zinc-655">
                {cvData.skills.map((category) => (
                  <p key={category.id} className="leading-relaxed">
                    <strong className="font-bold text-zinc-850">{category.name}:</strong>{" "}
                    {category.items.join(", ")}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Experience Section */}
          {cvData.experience.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-150 pb-0.5">
                Experience
              </h3>
              <div className="space-y-3">
                {cvData.experience.map((exp, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <strong className="font-bold text-zinc-900">{exp.company}</strong>
                        <span className="text-zinc-450 mx-1.5">|</span>
                        <span className="text-zinc-600 italic">{exp.role}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-zinc-450 font-medium text-[9px]">
                        <span>{exp.location}</span>
                        <span>•</span>
                        <span>{exp.date}</span>
                      </div>
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-zinc-655 leading-relaxed">
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
            <div className="mt-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-150 pb-0.5">
                Projects
              </h3>
              <div className="space-y-3">
                {cvData.projects.map((proj) => (
                  <div key={proj.id} className="space-y-0.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <strong className="font-bold text-zinc-900">{proj.name}</strong>
                        <span className="text-zinc-450 mx-1.5">|</span>
                        <span className="text-zinc-600 italic">{proj.meta}</span>
                      </div>
                    </div>
                    {proj.description && (
                      <p className="text-[10px] text-zinc-500 italic pl-1 leading-normal">
                        {proj.description}
                      </p>
                    )}
                    <ul className="list-disc pl-4 space-y-0.5 text-zinc-655 leading-relaxed">
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
            <div className="mt-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 border-b border-zinc-150 pb-0.5">
                Education
              </h3>
              <div className="space-y-3">
                {cvData.educationList.map((edu) => (
                  <div key={edu.id} className="space-y-0.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <strong className="font-bold text-zinc-900">{edu.school}</strong>
                        <span className="text-zinc-455 mx-1.5">|</span>
                        <span className="text-zinc-600 italic">{edu.degree}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-zinc-455 font-medium text-[9px]">
                        <span>{edu.location}</span>
                        <span>•</span>
                        <span>{edu.dateRange}</span>
                      </div>
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-zinc-655 leading-relaxed">
                      {edu.details.map((detail, dIdx) => (
                        <li key={dIdx}>{detail}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
