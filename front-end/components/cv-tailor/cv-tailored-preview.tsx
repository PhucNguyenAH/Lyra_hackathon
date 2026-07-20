"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MasterBullet {
  id: string;
  text: string;
  section: string;
}

export interface TailoredBullet {
  id: string;
  text: string;
  source_ref: string; // references MasterBullet.id
  requirement_ids: string[]; // references Requirement.id
  change_type: "REWORDED" | "REORDERED" | "EMPHASIZED" | "UNCHANGED" | "OMITTED";
  reasoning: string;
}

interface CVTailoredPreviewProps {
  masterBullets: MasterBullet[];
  tailoredBullets: TailoredBullet[];
  activeHoverId: string | null; // ID of the tailored bullet being hovered
  activeRequirementId: string | null; // ID of the requirement being hovered
  onHoverTailored: (id: string | null, sourceRef: string | null, reqIds: string[] | null) => void;
}

export function CVTailoredPreview({
  masterBullets,
  tailoredBullets,
  activeHoverId,
  activeRequirementId,
  onHoverTailored,
}: CVTailoredPreviewProps) {
  // Find which master bullet is currently highlighted (either directly or via the hovered tailored bullet)
  const currentHoveredTailored = tailoredBullets.find((b) => b.id === activeHoverId);
  const activeMasterRef = currentHoveredTailored?.source_ref || null;

  // Find which tailored bullets are highlighted because they target the active requirement
  const tailoredTargetingActiveReq = activeRequirementId
    ? tailoredBullets.filter((b) => b.requirement_ids.includes(activeRequirementId)).map((b) => b.id)
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full min-h-0 flex-1">
      {/* Original CV Column */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-white/30 dark:bg-zinc-900/20 backdrop-blur-md shadow-sm h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <FileText className="h-4 w-4" />
            Original CV Bullets
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400 dark:text-zinc-500">
            Your master resume content before tailoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto min-h-0 pr-2 space-y-4">
          {/* Group by section */}
          {["CloudCorp Experience", "DevShop Experience"].map((section) => {
            const sectionBullets = masterBullets.filter((b) => b.section === section);
            return (
              <div key={section} className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-1">
                  {section}
                </h4>
                <div className="space-y-2">
                  {sectionBullets.map((bullet) => {
                    const isTraced = activeMasterRef === bullet.id;
                    return (
                      <div
                        key={bullet.id}
                        className={cn(
                          "p-3 rounded-lg border transition-all duration-300 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400",
                          isTraced
                            ? "bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/40 dark:border-amber-500/30 text-zinc-900 dark:text-zinc-200 shadow-[0_0_12px_rgba(245,158,11,0.15)] scale-[1.005]"
                            : "bg-white/40 dark:bg-zinc-950/20 border-zinc-100/50 dark:border-zinc-800/50"
                        )}
                      >
                        {bullet.text}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Tailored CV Column */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/40 backdrop-blur-md shadow-sm h-full flex flex-col">
        <CardHeader className="pb-3 flex-shrink-0">
          <CardTitle className="text-base font-semibold flex items-center justify-between text-indigo-600 dark:text-indigo-400">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500 fill-amber-500/30" />
              Tailored CV Preview
            </span>
            <Badge variant="secondary" className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-none font-semibold">
              92% Match Score
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs text-zinc-400 dark:text-zinc-500">
            Hover bullets to trace improvements back to original CV and requirement targets.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto min-h-0 pr-2 space-y-4">
          {["CloudCorp Experience", "DevShop Experience"].map((section) => {
            const masterSectionBullets = masterBullets.filter((b) => b.section === section).map((b) => b.id);
            const sectionBullets = tailoredBullets.filter((b) => masterSectionBullets.includes(b.source_ref));

            return (
              <div key={section} className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider px-1">
                  {section} (AI-Tailored)
                </h4>
                <div className="space-y-2">
                  {sectionBullets.map((bullet) => {
                    const isHovered = activeHoverId === bullet.id;
                    const isTargetingActiveReq = tailoredTargetingActiveReq.includes(bullet.id);
                    const isHighlighted = isHovered || isTargetingActiveReq;

                    return (
                      <div
                        key={bullet.id}
                        onMouseEnter={() => onHoverTailored(bullet.id, bullet.source_ref, bullet.requirement_ids)}
                        onMouseLeave={() => onHoverTailored(null, null, null)}
                        className={cn(
                          "relative p-3 rounded-lg border text-xs leading-relaxed transition-all duration-300 cursor-help",
                          isHighlighted
                            ? "bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 dark:border-indigo-400 text-zinc-900 dark:text-zinc-100 shadow-[0_0_12px_rgba(99,102,241,0.15)] scale-[1.01]"
                            : "bg-white dark:bg-zinc-950/40 border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300"
                        )}
                      >
                        {bullet.text}

                        {/* Visual tag representing change category */}
                        <div className="flex justify-between items-center mt-2.5 pt-2 border-t border-dashed border-zinc-200 dark:border-zinc-800">
                          <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "text-[8px] font-bold px-1.5 py-0.5 rounded",
                              bullet.change_type === "EMPHASIZED" && "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400",
                              bullet.change_type === "REWORDED" && "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-400",
                              bullet.change_type === "REORDERED" && "bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-400",
                              bullet.change_type === "UNCHANGED" && "bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
                              bullet.change_type === "OMITTED" && "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-400"
                            )}>
                              {bullet.change_type}
                            </span>
                            <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-medium">
                              Targets: {bullet.requirement_ids.length} requirements
                            </span>
                          </div>

                          {isHovered && (
                            <span className="text-[9px] text-indigo-500 dark:text-indigo-400 flex items-center gap-1 font-semibold animate-pulse">
                              Tracing original
                              <ArrowRight className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </div>

                        {/* Reasoning Overlay Box shown on hover */}
                        {isHovered && bullet.reasoning && (
                          <div className="absolute top-full left-0 right-0 z-10 mt-1 p-2 bg-zinc-900 text-zinc-100 rounded-md shadow-lg text-[10px] border border-zinc-800 leading-normal animate-in fade-in-50 slide-in-from-top-1">
                            <strong className="text-amber-400 font-bold block mb-0.5">Optimization Insight:</strong>
                            {bullet.reasoning}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
