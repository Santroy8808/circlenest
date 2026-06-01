"use client";

import { useMemo, useState } from "react";
import { uploadFile, uploadImageWithCompression } from "@/lib/media/image-upload.client";

type Story = { title: string; body: string; attachments: string[] };

type InitialListing = {
  id: string;
  displayName: string;
  classLevel: string;
  location: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  travels: boolean;
  lookingForPcs: boolean;
  trainedAt: string | null;
  credentials: string | null;
  specialtyCourses: string | null;
  bio: string | null;
  services: string | null;
  successStoriesJson: string | null;
  media: Array<{ id: string; url: string; caption: string | null }>;
};

function parseStories(raw: string | null | undefined): Story[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        title: String((item as { title?: string })?.title ?? "").trim(),
        body: String((item as { body?: string })?.body ?? "").trim(),
        attachments: Array.isArray((item as { attachments?: unknown[] })?.attachments)
          ? (item as { attachments?: unknown[] }).attachments!.map((v) => String(v)).filter(Boolean)
          : [],
      }))
      .filter((item) => item.title || item.body || item.attachments.length);
  } catch {
    return [];
  }
}

export function AuditorListingFormClient({ initialListing }: { initialListing: InitialListing | null }) {
  const [status, setStatus] = useState("");
  const [profile, setProfile] = useState({
    displayName: initialListing?.displayName ?? "",
    classLevel: initialListing?.classLevel ?? "",
    country: initialListing?.country ?? "",
    state: initialListing?.state ?? "",
    city: initialListing?.city ?? "",
    location: initialListing?.location ?? "",
    trainedAt: initialListing?.trainedAt ?? "",
    credentials: initialListing?.credentials ?? "",
    specialtyCourses: initialListing?.specialtyCourses ?? "",
    services: initialListing?.services ?? "",
    bio: initialListing?.bio ?? "",
    travels: initialListing?.travels ?? false,
    lookingForPcs: initialListing?.lookingForPcs ?? true,
  });
  const [storyTitle, setStoryTitle] = useState("");
  const [storyBody, setStoryBody] = useState("");
  const [storyAttachments, setStoryAttachments] = useState<string[]>([]);
  const [stories, setStories] = useState<Story[]>(parseStories(initialListing?.successStoriesJson));
  const [galleryUrls, setGalleryUrls] = useState<string[]>(
    (initialListing?.media ?? []).map((item) => item.url).slice(0, 10),
  );

  const storyCount = useMemo(() => stories.length, [stories]);

  async function uploadStoryFiles(files: FileList | null) {
    if (!files?.length) return;
    setStatus("Uploading success-story attachments...");
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/");
      const uploaded = isImage
        ? await uploadImageWithCompression(file, { purpose: "auditor-attachment" })
        : await uploadFile(file, { purpose: "auditor-attachment" });
      if (uploaded.url) urls.push(uploaded.url);
    }
    setStoryAttachments((prev) => [...prev, ...urls]);
    setStatus(urls.length ? `Uploaded ${urls.length} file(s).` : "Could not upload attachments.");
  }

  async function uploadListingMedia(files: FileList | null) {
    if (!files?.length) return;
    setStatus("Uploading listing media...");
    const urls: string[] = [];
    for (const file of Array.from(files).slice(0, 10)) {
      const uploaded = await uploadImageWithCompression(file, { purpose: "auditor-attachment" });
      if (uploaded.url) urls.push(uploaded.url);
    }
    setGalleryUrls((prev) => [...prev, ...urls].slice(0, 10));
    setStatus(urls.length ? `Uploaded ${urls.length} image(s).` : "Could not upload listing media.");
  }

  async function saveProfile() {
    if (!profile.displayName.trim() || !profile.classLevel.trim()) {
      setStatus("Display name and class level are required.");
      return;
    }
    setStatus("Saving auditor listing...");
    const res = await fetch("/api/auditors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...profile,
        successStoriesJson: JSON.stringify(stories),
        media: galleryUrls.map((url) => ({ url })),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus(body?.error ?? "Could not save listing.");
      return;
    }
    setStatus("Auditor listing saved.");
  }

  return (
    <section className="card space-y-4 p-4">
      <h1 className="text-xl font-semibold">I&apos;m an Auditor</h1>
      <p className="text-sm text-slate-300">Post your auditor listing so people can find you.</p>

      <h2 className="text-lg font-semibold">Post a Listing as an Auditor</h2>
      <div className="grid gap-2 md:grid-cols-2">
        <input value={profile.displayName} onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))} placeholder="Display name" className="rounded border px-3 py-2" />
        <input value={profile.classLevel} onChange={(e) => setProfile((p) => ({ ...p, classLevel: e.target.value }))} placeholder="Auditor class level" className="rounded border px-3 py-2" />
        <input value={profile.country} onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))} placeholder="Country" className="rounded border px-3 py-2" />
        <input value={profile.state} onChange={(e) => setProfile((p) => ({ ...p, state: e.target.value }))} placeholder="State" className="rounded border px-3 py-2" />
        <input value={profile.city} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} placeholder="City" className="rounded border px-3 py-2" />
        <input value={profile.location} onChange={(e) => setProfile((p) => ({ ...p, location: e.target.value }))} placeholder="Location text (optional)" className="rounded border px-3 py-2" />
        <textarea value={profile.trainedAt} onChange={(e) => setProfile((p) => ({ ...p, trainedAt: e.target.value }))} placeholder="Where trained" className="rounded border px-3 py-2 md:col-span-2" />
        <textarea value={profile.credentials} onChange={(e) => setProfile((p) => ({ ...p, credentials: e.target.value }))} placeholder="Credentials" className="rounded border px-3 py-2 md:col-span-2" />
        <textarea value={profile.specialtyCourses} onChange={(e) => setProfile((p) => ({ ...p, specialtyCourses: e.target.value }))} placeholder="Specialty courses" className="rounded border px-3 py-2 md:col-span-2" />
        <textarea value={profile.services} onChange={(e) => setProfile((p) => ({ ...p, services: e.target.value }))} placeholder="What you deliver" className="rounded border px-3 py-2 md:col-span-2" />
        <textarea value={profile.bio} onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))} placeholder="Bio / description" className="rounded border px-3 py-2 md:col-span-2" />
        <label className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm"><input type="checkbox" checked={profile.travels} onChange={(e) => setProfile((p) => ({ ...p, travels: e.target.checked }))} /> I travel</label>
        <label className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm"><input type="checkbox" checked={profile.lookingForPcs} onChange={(e) => setProfile((p) => ({ ...p, lookingForPcs: e.target.checked }))} /> Looking for PCs</label>
      </div>

      <div className="space-y-2 rounded border border-[var(--border)] p-3">
        <p className="font-medium">Success Stories (individual entries)</p>
        <input value={storyTitle} onChange={(e) => setStoryTitle(e.target.value)} placeholder="Story title" className="w-full rounded border px-3 py-2" />
        <textarea value={storyBody} onChange={(e) => setStoryBody(e.target.value)} placeholder="Story text" className="w-full rounded border px-3 py-2" />
        <input type="file" multiple onChange={(e) => void uploadStoryFiles(e.currentTarget.files)} />
        {storyAttachments.length ? <p className="text-xs text-slate-400">{storyAttachments.length} attachment(s) ready</p> : null}
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm"
          onClick={() => {
            const next = { title: storyTitle.trim(), body: storyBody.trim(), attachments: storyAttachments };
            if (!next.title && !next.body && !next.attachments.length) return;
            setStories((prev) => [...prev, next]);
            setStoryTitle("");
            setStoryBody("");
            setStoryAttachments([]);
          }}
        >
          Add success story
        </button>
        <p className="text-xs text-slate-400">{storyCount} stories added</p>
      </div>

      <div className="space-y-2 rounded border border-[var(--border)] p-3">
        <p className="font-medium">Profile pictures (up to 10)</p>
        <input type="file" accept="image/*" multiple onChange={(e) => void uploadListingMedia(e.currentTarget.files)} />
        <p className="text-xs text-slate-400">{galleryUrls.length}/10 uploaded</p>
      </div>

      <button type="button" onClick={() => void saveProfile()} className="rounded bg-slate-900 px-3 py-2 text-white">
        Save auditor profile
      </button>
      {status ? <p className="text-sm text-slate-300">{status}</p> : null}
    </section>
  );
}

