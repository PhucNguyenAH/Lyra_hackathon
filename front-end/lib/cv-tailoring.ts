import type { CVData } from "@/components/cv-editor/cv-pdf-preview";
import type { CVVariant, ProfileRecord } from "@/lib/profile-api";

export function buildTailoredCV(
  profile: ProfileRecord,
  variant: CVVariant,
  targetRole: string,
  fallback: CVData,
): CVData {
  const experiencesById = new Map(profile.master.experiences.map((item) => [item.id, item]));
  const projectsById = new Map(profile.master.projects.map((item) => [item.id, item]));

  const experience = [...variant.selected_experiences]
    .sort((left, right) => left.order - right.order)
    .flatMap((selection) => {
      const source = experiencesById.get(selection.item_id);
      if (!source) return [];
      return [{
        company: source.org,
        role: source.role,
        location: "",
        date: source.period ?? "",
        bullets: selection.kept_bullets,
      }];
    });

  const projects = [...variant.selected_projects]
    .sort((left, right) => left.order - right.order)
    .flatMap((selection) => {
      const source = projectsById.get(selection.item_id);
      if (!source) return [];
      return [{
        id: source.id,
        name: source.name,
        meta: source.tech.join(", "),
        description: source.description,
        bullets: selection.kept_bullets,
      }];
    });

  return {
    ...fallback,
    fullName: profile.preferences.display_name || fallback.fullName,
    email: profile.preferences.email || fallback.email,
    location: profile.preferences.current_location || fallback.location,
    headline: targetRole,
    summary: variant.target_summary,
    skills: [{
      id: "tailored-skills",
      name: "Relevant Skills",
      items: variant.emphasized_skills,
    }],
    experience,
    projects,
    educationList: profile.master.education.map((education, index) => ({
      id: `master-education-${index}`,
      school: education,
      degree: "",
      location: "",
      dateRange: "",
      details: [],
    })),
    sectionOrder: ["summary", "skills", "experience", "projects", "education", "achievements", "awards"],
  };
}
