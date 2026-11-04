"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";

type TagInputProps = {
  name: string;
  defaultTags?: string[];
  label?: string;
};

// Generische Tag-Eingabe (Chips + Text) - kennt nichts von Company/Contact.
// Übermittelt jeden Tag als eigenes verstecktes Input-Feld, damit die
// Server Action per `formData.getAll(name)` die vollständige Liste erhält.
export function TagInput({ name, defaultTags = [], label = "Tags" }: TagInputProps) {
  const [tags, setTags] = useState<string[]>(defaultTags);
  const [draft, setDraft] = useState("");

  function addTag() {
    const value = draft.trim();
    if (value && !tags.includes(value)) {
      setTags([...tags, value]);
    }
    setDraft("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${name}-input`} className="text-xs font-medium text-secondary">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-black/15 bg-white p-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="neutral" className="gap-1">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Tag ${tag} entfernen`}
              className="text-muted hover:text-black"
            >
              ×
            </button>
            <input type="hidden" name={name} value={tag} />
          </Badge>
        ))}
        <input
          id={`${name}-input`}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder="Tag eingeben und Enter drücken..."
          className="min-w-32 flex-1 border-none p-1 text-sm outline-none"
        />
      </div>
    </div>
  );
}
