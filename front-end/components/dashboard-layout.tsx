"use client";

import React, { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { FileText, MessageSquare, Briefcase, FolderKanban, Menu, PanelLeftClose, PanelLeftOpen, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConnectLinkedInPanel } from "@/components/connect-linkedin-panel";

type TabId = "drafts" | "cv-editor" | "interview";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  hideSidebar?: boolean;
}

export function DashboardLayout({
  children,
  activeTab,
  setActiveTab,
  hideSidebar = false,
}: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);

  const menuItems = [
    {
      id: "drafts" as TabId,
      name: "Overview",
      icon: FolderKanban,
    },
    {
      id: "cv-editor" as TabId,
      name: "CV Builder",
      icon: FileText,
    },
    {
      id: "interview" as TabId,
      name: "Interview Practice",
      icon: MessageSquare,
    },
  ];

  const activeTabName =
    activeTab === "drafts"
      ? "Athena Overview Hub"
      : activeTab === "cv-editor"
      ? "CV Builder & Editor"
      : "Interview Practice Simulator";

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  // Close the mobile drawer with Escape
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  const handleSelectTab = (id: TabId) => {
    setActiveTab(id);
    setMobileNavOpen(false);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 font-sans text-zinc-900 dark:text-zinc-550">
      {/* Mobile backdrop */}
      {mobileNavOpen && !hideSidebar && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: off-canvas drawer on mobile, static rail on lg+ */}
      {!hideSidebar && (
        <aside
          role="dialog"
          aria-modal={mobileNavOpen ? true : undefined}
          aria-label="Primary navigation"
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex flex-col flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 lg:bg-white lg:dark:bg-zinc-900/50 lg:backdrop-blur-xl transition-transform duration-300 ease-in-out lg:static lg:z-20 lg:translate-x-0 lg:transition-[width] lg:duration-300",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full",
            "w-72",
            sidebarOpen ? "lg:w-60" : "lg:w-16"
          )}
        >
          {/* Brand */}
          <div className={cn("flex h-14 items-center justify-between border-b border-zinc-200 px-3 dark:border-zinc-800 flex-shrink-0", !sidebarOpen && "lg:justify-center lg:px-2")}>
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm flex-shrink-0 dark:bg-indigo-500">
                <Briefcase className="h-4 w-4" />
              </div>
              {(sidebarOpen || mobileNavOpen) && (
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                    Athena
                  </span>
                  <span className="truncate text-[9px] font-medium text-zinc-400 dark:text-zinc-500">
                    Job search workspace
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Close navigation menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Items */}
          <div className={cn("flex-1 space-y-1 overflow-y-auto py-3", sidebarOpen ? "px-2.5" : "px-2")}>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectTab(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition-colors duration-150",
                    !sidebarOpen && "lg:justify-center lg:px-0",
                    isActive
                      ? "bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 shadow-sm"
                      : "text-zinc-650 dark:text-zinc-400 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150 flex-shrink-0",
                      isActive
                        ? "bg-indigo-600 text-white dark:bg-indigo-500 shadow-md"
                        : "text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  {(sidebarOpen || mobileNavOpen) && (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold tracking-tight">
                          {item.name}
                        </p>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sidebar Footer */}
          <div className={cn("flex-shrink-0 border-t border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/30", !sidebarOpen && "lg:px-2")}>
            <div className={cn("flex min-w-0 items-center gap-2.5", !sidebarOpen && "lg:justify-center")}>
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                KN
              </div>
              {(sidebarOpen || mobileNavOpen) && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-350 truncate">
                    Kian Nguyen
                  </p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                    Job seeker
                  </p>
                </div>
              )}
            </div>
            {/* Account settings / Connect LinkedIn — see front-end/docs/ai/2026-07-22-account-settings-linkedin-entry.md */}
            <button
              type="button"
              onClick={() => setAccountSettingsOpen(true)}
              className={cn(
                "group relative mt-2 flex w-full items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left text-zinc-650 transition-colors duration-150 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
                !sidebarOpen && "lg:justify-center lg:px-0"
              )}
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors duration-150 group-hover:text-zinc-700 dark:group-hover:text-zinc-300">
                <Settings className="h-4 w-4" />
              </div>
              {(sidebarOpen || mobileNavOpen) && (
                <p className="truncate text-xs font-semibold tracking-tight">
                  Account settings
                </p>
              )}
            </button>
          </div>
        </aside>
      )}

      {/* Account settings / Connect LinkedIn — see front-end/docs/ai/2026-07-22-account-settings-linkedin-entry.md */}
      <Dialog open={accountSettingsOpen} onOpenChange={setAccountSettingsOpen}>
        <DialogContent className="flex h-[min(90dvh,820px)] max-h-[90dvh] flex-col gap-0 overflow-y-auto p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-zinc-100 px-6 py-5 pr-12 dark:border-zinc-800">
            <DialogTitle>Account settings</DialogTitle>
            <DialogDescription>Connect LinkedIn to let Athena scrape jobs on your behalf.</DialogDescription>
          </DialogHeader>
          <ConnectLinkedInPanel />
        </DialogContent>
      </Dialog>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        {!hideSidebar && (
          <header className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/20 backdrop-blur-xl flex-shrink-0">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              {/* Mobile hamburger */}
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              {/* Desktop rail collapse toggle */}
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hidden lg:flex flex-shrink-0 h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300"
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
              </button>
              <h2 className="text-sm sm:text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 min-w-0">
                <span className="hidden sm:inline text-zinc-400 font-normal">Workspace</span>
                <span className="hidden sm:inline text-zinc-400">/</span>
                <span className="text-indigo-600 dark:text-indigo-400 truncate">
                  {activeTabName}
                </span>
              </h2>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              {/* Simulation API Connection Indicator */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full border border-green-500/20 bg-green-500/5 text-green-600 dark:text-green-400 text-xs font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Live Pipeline Simulation
              </div>

              <ThemeToggle />
            </div>
          </header>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8 print:p-0 print:bg-white print:overflow-visible">
          <div className="max-w-7xl mx-auto h-full flex flex-col print:max-w-none print:h-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
