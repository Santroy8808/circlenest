"use client";

import { ScientologyClassification } from "@prisma/client";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { CityLocationAutocomplete } from "@/components/location/city-location-autocomplete";
import { ScientologyOrgSearchField } from "@/components/profile/scientology-org-search-field";
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

type TermsDefaults = {
  defaultName: string;
  defaultEmail: string;
  termsVersion: string;
  effectiveDateLabel: string;
  termsHref: string;
  termsPdfHref: string;
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
  const [location, setLocation] = useState(defaults.location);
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
      description="This profile step is optional. Add a few details now, or skip it and finish your profile later in settings."
      eyebrow="Step 1 of 4 · Optional"
      title="Set up your profile (optional)"
    >
      <form className="surface grid gap-4 rounded-md p-5" onSubmit={handleSubmit}>
        <label className="grid gap-2">
          <span className="form-label">Email</span>
          <input aria-readonly="true" className="form-field" readOnly value={defaults.email} />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Full name</span>
          <input autoComplete="name" className="form-field" defaultValue={defaults.displayName} name="displayName" required />
        </label>
        <CityLocationAutocomplete
          helperText="Select the closest city-level match. Street addresses are not used."
          label="Location"
          name="location"
          onChange={setLocation}
          placeholder="Start typing your city..."
          required
          value={location}
        />
        <label className="grid gap-2">
          <span className="form-label">Tagline</span>
          <input className="form-field" defaultValue={defaults.tagline} name="tagline" placeholder="One short line about you" />
        </label>
        <label className="grid gap-2">
          <span className="form-label">Bio</span>
          <textarea className="form-field min-h-36" defaultValue={defaults.bio} name="bio" placeholder="A little about who you are." />
        </label>
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" disabled={isPending} type="submit">
            {isPending ? "Saving..." : "Save and continue"}
          </button>
          <button className="btn-secondary" disabled={isPending} onClick={skipStep} type="button">
            Skip this optional step
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
      description="This step is optional. Details stay private unless you later change their visibility, and you can add them after onboarding."
      eyebrow="Step 2 of 4 · Optional"
      title="Add Scientology details (optional)"
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
          <ScientologyOrgSearchField
            defaultValue={defaults.orgName}
            helperText="Search by org name, AO abbreviation, city, or country. Select the closest listed org when possible."
            label="Current org receiving services"
            required
          />
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
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" disabled={isPending} type="submit">
            {isPending ? "Saving..." : "Save and continue"}
          </button>
          <button className="btn-secondary" disabled={isPending} onClick={skipStep} type="button">
            Skip this optional step
          </button>
        </div>
      </form>
    </OnboardingShell>
  );
}

export function OnboardingGoodStandingForm() {
  const router = useRouter();
  const [answer, setAnswer] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitGoodStanding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (answer === null) {
      setError("Choose Yes or No to continue.");
      return;
    }

    startTransition(async () => {
      try {
        const nextPath = await submitStep({
          step: "good-standing",
          isInGoodStanding: answer
        });
        router.push(nextPath);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not save attestation.");
      }
    });
  }

  return (
    <OnboardingShell
      description="This confirmation is required to activate membership. If you select No, automatic account activation ends."
      eyebrow="Step 3 of 4 · Required"
      title="Confirm good standing"
    >
      <form className="surface grid gap-5 rounded-md p-5" onSubmit={submitGoodStanding}>
        <fieldset aria-describedby="good-standing-help" className="grid gap-3">
          <legend className="font-semibold leading-7">
            I attest that I am currently active as a Scientologist and in good standing with the Church of Scientology.
          </legend>
          <p className="text-sm leading-6 text-[var(--muted)]" id="good-standing-help">
            Choose the truthful answer. You will review your choice before it is submitted.
          </p>
          <label className="flex items-start gap-3 rounded-md border border-[var(--line)] p-3">
            <input
              checked={answer === true}
              className="mt-1"
              name="goodStanding"
              onChange={() => setAnswer(true)}
              type="radio"
              value="yes"
            />
            <span>Yes, I can make this attestation.</span>
          </label>
          <label className="flex items-start gap-3 rounded-md border border-[var(--line)] p-3">
            <input
              checked={answer === false}
              className="mt-1"
              name="goodStanding"
              onChange={() => setAnswer(false)}
              type="radio"
              value="no"
            />
            <span>No, I cannot make this attestation.</span>
          </label>
        </fieldset>
        {answer === false ? (
          <p className="rounded-md border border-[var(--line)] bg-black/20 p-3 text-sm leading-6 text-[var(--muted)]">
            Submitting No ends automatic activation for this account.
          </p>
        ) : null}
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
        <button className="btn-primary" disabled={isPending || answer === null} type="submit">
          {isPending ? "Submitting..." : answer === false ? "Submit No and end activation" : "Continue to terms"}
        </button>
      </form>
    </OnboardingShell>
  );
}

export function OnboardingTermsForm({
  defaultName,
  defaultEmail,
  termsVersion,
  effectiveDateLabel,
  termsHref,
  termsPdfHref
}: TermsDefaults) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const nextPath = await submitStep({
          step: "terms",
          accepted,
          signerName: formData.get("signerName"),
          signerEmail: formData.get("signerEmail"),
          termsVersion
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
      description="Review the required membership agreement, then accept it to activate your account."
      eyebrow="Step 4 of 4 · Required"
      title="Review and accept the Terms of Service"
    >
      <form className="surface grid gap-4 rounded-md p-5" onSubmit={handleSubmit}>
        <section className="rounded-md border border-[var(--line)] bg-black/20 p-4 leading-7 text-[var(--muted)]" id="onboarding-terms-summary">
          <h2 className="text-xl font-semibold text-[var(--gold)]">Theta-Space Terms of Service</h2>
          <p className="mt-3">Effective {effectiveDateLabel}. Open the full Terms in a new tab, or download the PDF before accepting.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a className="btn-secondary" href={termsHref} target="_blank" rel="noopener noreferrer">
              View full Terms
            </a>
            <a className="btn-secondary" download href={termsPdfHref}>
              Download PDF
            </a>
          </div>
        </section>

        <label className="grid gap-2">
          <span className="form-label">Full legal name</span>
          <input autoComplete="name" className="form-field" defaultValue={defaultName} maxLength={120} name="signerName" required />
        </label>

        <label className="grid gap-2">
          <span className="form-label">Account email</span>
          <input autoComplete="email" className="form-field" defaultValue={defaultEmail} maxLength={180} name="signerEmail" required type="email" />
        </label>

        <label className="flex items-start gap-3 text-sm leading-6 text-[var(--muted)]">
          <input
            aria-describedby="onboarding-terms-summary"
            checked={accepted}
            className="mt-1"
            name="accepted"
            onChange={(event) => setAccepted(event.target.checked)}
            required
            type="checkbox"
          />
          <span>I have read and agree to the Theta-Space Terms of Service version {termsVersion}.</span>
        </label>
        <p className="text-sm leading-6 text-[var(--muted)]">
          After acceptance, Theta-Space will email the Terms PDF to this account email and log the delivery result.
        </p>
        {error ? <p className="rounded-md border border-red-400/40 bg-red-950/30 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
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
      description="Automatic account activation has ended because the required attestation was not confirmed."
      eyebrow="Application"
      title="Application complete"
    >
      <section className="surface grid gap-4 rounded-md p-5">
        <p className="leading-7 text-[var(--muted)]">
          This account cannot enter member areas through automatic onboarding. You can safely log out below.
        </p>
        <div>
          <LogoutButton />
        </div>
      </section>
    </OnboardingShell>
  );
}
