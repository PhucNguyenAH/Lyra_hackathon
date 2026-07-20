"use client";

import React, { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { FileText, MessageSquare, Briefcase, Sparkles, FolderKanban, ClipboardList, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "drafts" | "cv-editor" | "jobs" | "interview";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

export function DashboardLayout({
  children,
  activeTab,
  setActiveTab,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const menuItems = [
    {
      id: "drafts" as TabId,
      name: "Overview Hub",
      description: "Manage resumes and track applications",
      icon: FolderKanban,
      badge: "Local",
    },
    {
      id: "cv-editor" as TabId,
      name: "CV Editor & Builder",
      description: "Edit resume details and styles",
      icon: FileText,
      badge: "Interactive",
    },
    {
      id: "jobs" as TabId,
      name: "Jobs Board",
      description: "Classify jobs and match score",
      icon: ClipboardList,
      badge: "Match",
    },
    {
      id: "interview" as TabId,
      name: "Interview Simulator",
      description: "Interactive mock interviews by role",
      icon: MessageSquare,
      badge: "Real-time",
    },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-50">
      {/* Sidebar */}
      <aside
        className={cn(
          "relative z-20 flex flex-col flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 backdrop-blur-xl transition-all duration-300",
          sidebarOpen ? "w-80" : "w-20"
        )}
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 dark:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30">
              <Briefcase className="h-5 w-5" />
            </div>
            {sidebarOpen && (
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent dark:from-indigo-400 dark:to-violet-300">
                  Athena Dashboard
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                  CV Enhancement & Practice
                </span>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              v1.0
            </span>
          )}
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "group relative w-full flex items-center gap-4 rounded-xl p-3 text-left transition-all duration-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60",
                  isActive
                    ? "bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/50 dark:border-zinc-700/50 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 border border-transparent"
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-200",
                    isActive
                      ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                {sidebarOpen && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold tracking-tight">
                        {item.name}
                      </p>
                      {item.badge && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                            isActive
                              ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 group-hover:bg-zinc-200"
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                      {item.description}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-400">
              ME
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 truncate">
                  Engineering Lead
                </p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                  Athena Hackathon Slice
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between px-8 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/20 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              aria-label="Toggle Sidebar"
            >
              <Activity className="h-5 w-5" />
            </button>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>Workspace</span>
              <span className="text-zinc-400">/</span>
              <span className="text-indigo-600 dark:text-indigo-400">
                {activeTab === "drafts" && "Athena Overview Hub"}
                {activeTab === "cv-editor" && "CV Builder & Editor"}
                {activeTab === "jobs" && "Classified Jobs Board"}
                {activeTab === "interview" && "Interview Practice Simulator"}
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-4">
            {/* Simulation API Connection Indicator */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full border border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
              Live Pipeline Simulation
            </div>

            <ThemeToggle />
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950 p-8 print:p-0 print:bg-white print:overflow-visible">
          <div className="max-w-7xl mx-auto h-full flex flex-col print:max-w-none print:h-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
