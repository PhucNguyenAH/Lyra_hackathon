"use client";

import { useRouter } from "next/navigation";

import { DashboardLayout } from "@/components/dashboard-layout";
import { ProfileWorkspace } from "@/components/profile/profile-workspace";


type WorkspaceTab = "drafts" | "applications" | "cv-editor" | "interview";

const TAB_ROUTES: Record<WorkspaceTab, string> = {
  drafts: "/",
  applications: "/applications",
  "cv-editor": "/cv-builder",
  interview: "/interviews",
};


export default function ProfilePage() {
  const router = useRouter();

  return (
    <DashboardLayout
      activeTab="drafts"
      setActiveTab={(tab) => router.push(TAB_ROUTES[tab])}
    >
      <ProfileWorkspace />
    </DashboardLayout>
  );
}
