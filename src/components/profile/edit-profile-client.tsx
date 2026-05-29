"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { uploadImageWithCompression } from "@/lib/media/image-upload.client";

type InitialProfile = {
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  backupEmail: string;
  interests: string;
  relationshipStatus: string;
  detailedBioJson: string;
};

const INTEREST_OPTIONS = [
  "Technology",
  "Business",
  "Finance",
  "Science",
  "Health",
  "Fitness",
  "Family",
  "Travel",
  "Gaming",
  "Books",
  "Writing",
  "Music",
  "Art",
  "Photography",
  "Food",
  "Faith",
  "Politics",
  "Community",
];

async function uploadImage(file: File): Promise<string | null> {
  const result = await uploadImageWithCompression(file);
  return result.url;
}

function parseDetailedBio(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      ageRange: String(parsed.ageRange ?? ""),
      siblings: String(parsed.siblings ?? ""),
      children: String(parsed.children ?? ""),
      occupation: String(parsed.occupation ?? ""),
      education: String(parsed.education ?? ""),
      beliefs: String(parsed.beliefs ?? ""),
      hobbies: String(parsed.hobbies ?? ""),
      lifeGoals: String(parsed.lifeGoals ?? ""),
    };
  } catch {
    return {
      ageRange: "",
      siblings: "",
      children: "",
      occupation: "",
      education: "",
      beliefs: "",
      hobbies: "",
      lifeGoals: "",
    };
  }
}

export function EditProfileClient({ initial }: { initial: InitialProfile }) {
  const [status, setStatus] = useState<string>("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    initial.interests
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
  const [customInterest, setCustomInterest] = useState("");
  const detailedDefaults = useMemo(() => parseDetailedBio(initial.detailedBioJson), [initial.detailedBioJson]);

  function toggleInterest(value: string) {
    setSelectedInterests((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  return (
    <div className="card p-3">
      <h1 className="text-lg font-semibold text-[var(--text-strong)]">Edit Profile</h1>
      <div className="mb-3 mt-1 flex flex-wrap gap-3 text-xs">
        <Link href="/profile/scientology" className="underline">My Scientology</Link>
        <Link href="/profile/resume" className="underline">Resume</Link>
      </div>
      <form
        className="grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setStatus("Saving...");
          const form = new FormData(e.currentTarget);

          const avatarFile = form.get("avatar") as File | null;
          const bannerFile = form.get("banner") as File | null;
          const avatarUrl = avatarFile && avatarFile.size > 0 ? await uploadImage(avatarFile) : undefined;
          const bannerUrl = bannerFile && bannerFile.size > 0 ? await uploadImage(bannerFile) : undefined;

          const fullInterests = [...selectedInterests, customInterest.trim()].filter(Boolean);
          const payload: Record<string, unknown> = {
            displayName: form.get("displayName"),
            headline: form.get("headline"),
            bio: form.get("bio"),
            location: form.get("location"),
            backupEmail: form.get("backupEmail"),
            interests: fullInterests.join(", "),
            relationshipStatus: form.get("relationshipStatus"),
            detailedBio: {
              ageRange: form.get("ageRange"),
              siblings: form.get("siblings"),
              children: form.get("children"),
              occupation: form.get("occupation"),
              education: form.get("education"),
              beliefs: form.get("beliefs"),
              hobbies: form.get("hobbies"),
              lifeGoals: form.get("lifeGoals"),
            },
          };
          if (avatarUrl) payload.avatarUrl = avatarUrl;
          if (bannerUrl) payload.bannerUrl = bannerUrl;

          const res = await fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          setStatus(res.ok ? "Saved." : "Failed to save.");
        }}
      >
        <input name="displayName" defaultValue={initial.displayName} placeholder="Display name" className="rounded-md border px-2 py-1.5 text-sm" />
        <input name="headline" defaultValue={initial.headline} placeholder="Profile headline (one-liner)" className="rounded-md border px-2 py-1.5 text-sm" />
        <textarea name="bio" defaultValue={initial.bio} placeholder="Bio" className="rounded-md border px-2 py-1.5 text-sm" rows={4} />
        <div className="grid gap-2 md:grid-cols-2">
          <input name="location" defaultValue={initial.location} placeholder="Location" className="rounded-md border px-2 py-1.5 text-sm" />
          <input name="backupEmail" defaultValue={initial.backupEmail} type="email" placeholder="Backup email (for account recovery)" className="rounded-md border px-2 py-1.5 text-sm" />

          <div className="rounded-md border border-[var(--border)] p-2 md:col-span-1">
            <p className="mb-1 text-xs font-semibold text-[var(--text-strong)]">Interests (dropdown selectable)</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {INTEREST_OPTIONS.map((interest) => (
                <label key={interest} className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedInterests.includes(interest)} onChange={() => toggleInterest(interest)} />
                  <span>{interest}</span>
                </label>
              ))}
            </div>
            <input
              value={customInterest}
              onChange={(e) => setCustomInterest(e.target.value)}
              placeholder="Custom interest (optional)"
              className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm"
            />
          </div>

          <select name="relationshipStatus" defaultValue={initial.relationshipStatus} className="rounded-md border px-2 py-1.5 text-sm md:self-start">
            <option value="">Relationship status</option>
            <option value="None">None</option>
            <option value="Single">Single</option>
            <option value="In a Relationship">In a relationship</option>
            <option value="Married">Married</option>
            <option value="Looking">Looking</option>
            <option value="Not Looking">Not Looking</option>
            <option value="Widow">Widow</option>
          </select>
        </div>
        <div className="mt-1 rounded-md border border-[var(--border)] p-2">
          <p className="mb-2 text-xs font-semibold text-[var(--text-strong)]">Detailed Bio</p>
          <div className="grid gap-2 md:grid-cols-2">
            <input name="ageRange" defaultValue={detailedDefaults.ageRange} placeholder="Age range (ex: 30-39)" className="rounded-md border px-2 py-1.5 text-sm" />
            <input name="siblings" defaultValue={detailedDefaults.siblings} placeholder="Siblings" className="rounded-md border px-2 py-1.5 text-sm" />
            <input name="children" defaultValue={detailedDefaults.children} placeholder="Children" className="rounded-md border px-2 py-1.5 text-sm" />
            <input name="occupation" defaultValue={detailedDefaults.occupation} placeholder="Occupation" className="rounded-md border px-2 py-1.5 text-sm" />
            <input name="education" defaultValue={detailedDefaults.education} placeholder="Education" className="rounded-md border px-2 py-1.5 text-sm" />
            <input name="hobbies" defaultValue={detailedDefaults.hobbies} placeholder="Hobbies" className="rounded-md border px-2 py-1.5 text-sm" />
          </div>
          <textarea name="beliefs" defaultValue={detailedDefaults.beliefs} placeholder="Beliefs / values" className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm" rows={2} />
          <textarea name="lifeGoals" defaultValue={detailedDefaults.lifeGoals} placeholder="Life goals" className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm" rows={2} />
        </div>
        <label className="text-xs text-slate-300">Avatar image</label>
        <input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" className="rounded-md border px-2 py-1 text-sm file:mr-2 file:rounded file:border-0 file:bg-transparent file:text-[13px] file:underline" />
        <label className="text-xs text-slate-300">Banner image</label>
        <input name="banner" type="file" accept="image/png,image/jpeg,image/webp" className="rounded-md border px-2 py-1 text-sm file:mr-2 file:rounded file:border-0 file:bg-transparent file:text-[13px] file:underline" />
        <button type="submit" className="rounded-md border border-[var(--border)] bg-[#8f7228] px-3 py-1.5 text-sm text-black">Save</button>
        {status ? <p className="text-xs text-slate-300">{status}</p> : null}
      </form>
    </div>
  );
}
