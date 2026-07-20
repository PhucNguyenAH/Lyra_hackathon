"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Sparkles, Trash2, GripVertical, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SkillCategory {
  id: string;
  name: string;
  items: string[];
}

interface SkillsTagEditorProps {
  categories: SkillCategory[];
  onChange: (updated: SkillCategory[]) => void;
}

export function SkillsTagEditor({ categories, onChange }: SkillsTagEditorProps) {
  const [newSkillText, setNewSkillText] = useState<{ [catId: string]: string }>({});
  const [activeInputCatId, setActiveInputCatId] = useState<string | null>(null);

  const handleAddCategory = () => {
    const newCat: SkillCategory = {
      id: `cat-${Date.now()}`,
      name: "New Category",
      items: [],
    };
    onChange([...categories, newCat]);
  };

  const handleDeleteCategory = (catId: string) => {
    onChange(categories.filter((c) => c.id !== catId));
  };

  const handleCategoryNameChange = (catId: string, name: string) => {
    onChange(
      categories.map((c) => (c.id === catId ? { ...c, name } : c))
    );
  };

  const handleRemoveSkill = (catId: string, itemToRemove: string) => {
    onChange(
      categories.map((c) => {
        if (c.id === catId) {
          return {
            ...c,
            items: c.items.filter((item) => item !== itemToRemove),
          };
        }
        return c;
      })
    );
  };

  const handleAddSkillSubmit = (catId: string) => {
    const skill = newSkillText[catId]?.trim();
    if (skill) {
      onChange(
        categories.map((c) => {
          if (c.id === catId) {
            // Avoid duplicate tags
            if (c.items.includes(skill)) return c;
            return {
              ...c,
              items: [...c.items, skill],
            };
          }
          return c;
        })
      );
      setNewSkillText((prev) => ({ ...prev, [catId]: "" }));
      setActiveInputCatId(null);
    }
  };

  const handleSuggestSkills = () => {
    // Simulated AI skill suggestions based on Next.js/Tailwind v4 roles
    const suggestions: SkillCategory[] = [
      {
        id: "cat-prog",
        name: "Programming Languages",
        items: ["Java", "Python", "JavaScript", "TypeScript", "C++", "SQL"],
      },
      {
        id: "cat-frame",
        name: "Frameworks & Tools",
        items: [
          "Spring Boot",
          "Spring Security",
          "React.js",
          "Next.js",
          "FastAPI",
          "LangChain",
          "LangGraph",
          "Prisma",
          "Supabase",
          "PostgreSQL",
          "ChromaDB",
          "MongoDB",
          "PyTorch",
          "TailwindCSS",
          "Docker",
          "Git",
          "Postman",
          "GitHub Actions",
        ],
      },
      {
        id: "cat-cloud",
        name: "Cloud & DevOps",
        items: ["AWS (EC2, RDS, Amplify, S3, IAM)", "Docker", "CI/CD", "GitHub Actions"],
      },
    ];
    onChange(suggestions);
  };

  return (
    <div className="space-y-6">
      {/* Skills Panel Header matching Image 2 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
          Skills Profile
        </h3>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSuggestSkills}
            className="h-8 text-xs flex items-center gap-1 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-500 fill-indigo-500/25" />
            Suggest skills
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddCategory}
            className="h-8 text-xs flex items-center gap-1 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Add category
          </Button>
        </div>
      </div>

      {/* Categories stack matching Image 2 */}
      <div className="space-y-4">
        {categories.map((category) => (
          <div
            key={category.id}
            className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-sm space-y-4"
          >
            {/* Category header title input + edit controls */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <GripVertical className="h-4 w-4 text-zinc-400 dark:text-zinc-650 cursor-grab active:cursor-grabbing flex-shrink-0" />
                <Input
                  value={category.name}
                  onChange={(e) => handleCategoryNameChange(category.id, e.target.value)}
                  className="font-bold text-xs h-8 bg-transparent border-transparent hover:border-zinc-200 focus-visible:border-indigo-500 p-1 flex-1 focus-visible:ring-0 shadow-none focus-visible:bg-white dark:focus-visible:bg-zinc-950"
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleDeleteCategory(category.id)}
                className="h-8 w-8 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                title="Delete Category"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Tag bubbles list */}
            <div className="flex flex-wrap gap-2 items-center">
              {category.items.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300 border border-zinc-200/50 dark:border-zinc-750/50"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(category.id, item)}
                    className="rounded-full p-0.5 text-zinc-450 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-100 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}

              {/* Add tag trigger bubble */}
              {activeInputCatId === category.id ? (
                <div className="inline-flex items-center gap-1 text-xs">
                  <Input
                    placeholder="Enter skill tag..."
                    value={newSkillText[category.id] || ""}
                    onChange={(e) =>
                      setNewSkillText((prev) => ({ ...prev, [category.id]: e.target.value }))
                    }
                    className="h-7 text-xs w-28 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 focus-visible:ring-indigo-500 py-0.5 px-2"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSkillSubmit(category.id);
                      }
                    }}
                    autoFocus
                  />
                  <Button
                    type="button"
                    onClick={() => handleAddSkillSubmit(category.id)}
                    className="h-7 w-7 rounded bg-indigo-600 hover:bg-indigo-700 text-white p-0 flex items-center justify-center flex-shrink-0"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveInputCatId(null)}
                    className="h-7 w-7 rounded p-0 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveInputCatId(category.id)}
                  className="h-7 px-3 text-[11px] rounded-full border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1 text-zinc-550 border-dashed"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
