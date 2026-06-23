"use client";

import { ScientologyClassification } from "@prisma/client";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { scientologyProcessingStatuses, scientologyTrainingLevels } from "@/modules/my-scientology/types";

type ProfileDefaults = {
  email: string;
  displayName: string;
  tagline: string;
  bio: string;
  location: string;
};

type ScientologyDefaults = {
  classification: ScientologyClassification;
  orgName: string;
  lastServiceName: string;
  iasMembershipLast6: string;
  trainingLevel: string;
  processingStatus: string;
  educationNotes: string;
};

function OnboardingShell({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)]">
      <div className="mx-auto grid max-w-3xl gap-5">
        <section className="surface rounded-md p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
          <p className="mt-3 leading-7 text-[var(--muted)]">{description}</p>
        </section>
        {children}
      </div>
    </main>
  );
}

async function submitStep(body: Record<string, unknown>) {
  const response = await fetch("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => null)) as { error?: string; nextPath?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Could not save this step.");
  }

  return payload?.nextPath ?? "/home";
}

export function OnboardingProfileForm({ defaults }: { defaults: ProfileDefaults }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const nextPath = await submitStep({
          step: "profile",
          displayName: formData.get("displayName"),
          tagline: formData.get("tagline"),
          bio: formData.get("bio"),
          location: formData.get("location")
        });
        router.push(nextPath);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not save profile.");
      }
    });
  }

  function skipStep() {
    setError("");
    startTransition(async () => {
      try {
        const nextPath = await submitStep({ step: "profile-skip" });
        router.push(nextPath);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not skip this step.");
      }
    });
  }

  return (
    <OnboardingShell
      description="Start with the basics other members will recognize. This step is recommended, but you can skip it and finish your profile later."
      eyebrow="Step 1 of 4"
      title="Set up your profile"
    >
      <form className="surface grid gap-4 rounded-md p-5" onSubmit={handleSubmit}>
        <label className="grid gap-2">
          <span className="form-label">Email</span>
          <input className="form-field opacity-80" disabled value={defaults.email} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Full name</span>
          <input className="form-field" defaultValue={defaults.displayName} name="displayName" required />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Location</span>
          <input className="form-field" defaultValue={defaults.location} name="location" placeholder="City, State or general area" required />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Tagline</span>
          <input className="form-field" defaultValue={defaults.tagline} name="tagline" placeholder="One short line about you" />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Bio</span>
          <textarea className="form-field min-h-36" defaultValue={defaults.bio} name="bio" placeholder="A little about who you are." />
        </label>
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" disabled={isPending} type="submit">
            {isPending ? "Saving..." : "Continue"}
          </button>
          <button className="btn-secondary" disabled={isPending} onClick={skipStep} type="button">
            Skip for now
          </button>
        </div>
      </form>
    </OnboardingShell>
  );
}

export function OnboardingScientologyForm({ defaults }: { defaults: ScientologyDefaults }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const nextPath = await submitStep({
          step: "scientology",
          classification: formData.get("classification"),
          orgName: formData.get("orgName"),
          lastServiceName: formData.get("lastServiceName"),
          iasMembershipLast6: formData.get("iasMembershipLast6"),
          trainingLevel: formData.get("trainingLevel"),
          processingStatus: formData.get("processingStatus"),
          educationNotes: formData.get("educationNotes")
        });
        router.push(nextPath);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not save My Scientology.");
      }
    });
  }

  function skipStep() {
    setError("");
    startTransition(async () => {
      try {
        const nextPath = await submitStep({ step: "scientology-skip" });
        router.push(nextPath);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not skip this step.");
      }
    });
  }

  return (
    <OnboardingShell
      description="Theta-Space is private membership. These fields are recommended and stay private unless you later choose otherwise. You can skip this page and finish it later."
      eyebrow="Step 2 of 4"
      title="Fill in My Scientology"
    >
      <form className="surface grid gap-4 rounded-md p-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Classification</span>
            <select className="form-field" defaultValue={defaults.classification} name="classification">
              <option value={ScientologyClassification.PUBLIC}>Public</option>
              <option value={ScientologyClassification.STAFF}>Staff</option>
              <option value={ScientologyClassification.SEA_ORG}>Sea Org</option>
              <option value={ScientologyClassification.AUDITOR}>Auditor</option>
            </select>
          </label>
          <label className="grid gap-2">
            <span className="form-label">Last 6 of IAS membership number, optional</span>
            <input className="form-field" defaultValue={defaults.iasMembershipLast6} inputMode="numeric" maxLength={6} name="iasMembershipLast6" pattern="[0-9]{6}" placeholder="123456" />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Current org receiving services</span>
            <input className="form-field" defaultValue={defaults.orgName} name="orgName" required />
          </label>
          <label className="grid gap-2">
            <span className="form-label">Last service</span>
            <input className="form-field" defaultValue={defaults.lastServiceName} name="lastServiceName" required />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="form-label">Training level</span>
            <select className="form-field" defaultValue={defaults.trainingLevel} name="trainingLevel">
              {scientologyTrainingLevels.map((level) => (
                <option key={level || "blank"} value={level}>
                  {level || "Select training level"}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="form-label">Processing / Rundown</span>
            <select className="form-field" defaultValue={defaults.processingStatus} name="processingStatus">
              {scientologyProcessingStatuses.map((status) => (
                <option key={status || "blank"} value={status}>
                  {status || "Select processing level"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="grid gap-2">
          <span className="form-label">Notes, optional</span>
          <textarea className="form-field min-h-28" defaultValue={defaults.educationNotes} name="educationNotes" />
        </label>
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" disabled={isPending} type="submit">
            {isPending ? "Saving..." : "Continue"}
          </button>
          <button className="btn-secondary" disabled={isPending} onClick={skipStep} type="button">
            Skip for now
          </button>
        </div>
      </form>
    </OnboardingShell>
  );
}

export function OnboardingGoodStandingForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitGoodStanding(isInGoodStanding: boolean) {
    setError("");
    startTransition(async () => {
      try {
        const nextPath = await submitStep({
          step: "good-standing",
          isInGoodStanding
        });
        router.push(nextPath);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not save attestation.");
      }
    });
  }

  return (
    <OnboardingShell
      description="This confirmation is required before Terms of Service. If you cannot attest this, the application ends here."
      eyebrow="Step 3 of 4"
      title="Good-standing attestation"
    >
      <section className="surface grid gap-4 rounded-md p-5">
        <p className="leading-7 text-[var(--muted)]">I attest that I am currently active as a Scientologist and in good standing with the Church of Scientology.</p>
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" disabled={isPending} onClick={() => submitGoodStanding(true)} type="button">
            Yes, I attest
          </button>
          <button className="btn-secondary" disabled={isPending} onClick={() => submitGoodStanding(false)} type="button">
            No, I cannot attest this
          </button>
        </div>
      </section>
    </OnboardingShell>
  );
}

export function OnboardingTermsForm() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        const nextPath = await submitStep({
          step: "terms",
          accepted
        });
        router.push(nextPath);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not accept terms.");
      }
    });
  }

  return (
    <OnboardingShell
      description="This placeholder exists now so usage is gated correctly. Final legal text can replace it without changing the flow."
      eyebrow="Step 4 of 4"
      title="Terms of Service"
    >
      <form className="surface grid gap-4 rounded-md p-5" onSubmit={handleSubmit}>
        <section className="max-h-72 overflow-y-auto rounded-md border border-[var(--line)] bg-black/20 p-4 leading-7 text-[var(--muted)]">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Theta-Space Terms of Service</h2>
          <p className="mt-3">
            Final Terms of Service will be inserted here. By continuing, you agree to follow the private membership rules, community standards,
            account-security requirements, and platform policies for Theta-Space.
          </p>
        </section>
        <label className="flex items-start gap-3 text-sm text-[var(--muted)]">
          <input checked={accepted} className="mt-1" onChange={(event) => setAccepted(event.target.checked)} type="checkbox" />
          <span>I have read and agree to the Theta-Space Terms of Service.</span>
        </label>
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100">{error}</p> : null}
        <button className="btn-primary" disabled={isPending || !accepted} type="submit">
          {isPending ? "Activating..." : "Agree and enter Theta-Space"}
        </button>
      </form>
    </OnboardingShell>
  );
}

export function OnboardingApplicationComplete() {
  return (
    <OnboardingShell
      description="Your application cannot continue through automatic onboarding at this time."
      eyebrow="Application"
      title="Thank you for your application"
    >
      <section className="surface rounded-md p-5">
        <p className="leading-7 text-[var(--muted)]">Thank you for your application.</p>
      </section>
    </OnboardingShell>
  );
}
