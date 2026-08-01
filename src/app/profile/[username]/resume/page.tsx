import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ScientologyReferenceNotice } from "@/components/legal/scientology-reference-notice";
import { AppShell } from "@/components/platform/app-shell";
import { PrintButton } from "@/components/profile/print-button";
import { getPublicResumeByUsername } from "@/modules/profile-resume/profile-resume.service";

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function contactUrlLabel(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function ResumeList({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) return null;

  return (
    <section className="resume-section">
      <h2>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default async function PublicResumePage(props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const session = await auth();

  if (!session?.user || session.user.revoked) {
    redirect(`/login?callbackUrl=/profile/${params.username}/resume`);
  }

  const view = await getPublicResumeByUsername(params.username, session.user.id);

  if (!view) {
    return (
      <AppShell>
        <section className="surface rounded-md p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">My Resume</p>
          <h1 className="mt-3 text-3xl font-semibold">Resume unavailable</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">This member has not published a resume.</p>
          <Link className="btn-secondary mt-5 inline-flex" href={`/profile/${params.username}`}>
            Back to profile
          </Link>
        </section>
      </AppShell>
    );
  }

  const { resume, scientology, user } = view;
  const contactItems = [
    resume.location,
    resume.email,
    resume.phone,
    resume.website ? contactUrlLabel(resume.website) : ""
  ].filter(hasText);
  const hasSidebar = resume.coreSkills.length > 0 || resume.credentials.length > 0 || resume.education.length > 0;

  return (
    <AppShell>
      <div className="resume-toolbar no-print">
        <Link className="btn-secondary" href={`/profile/${params.username}`}>
          Back to profile
        </Link>
        <PrintButton />
      </div>
      <article className="resume-document executive-resume-document">
        <section className="resume-page executive-resume-page">
          <header className="executive-resume-header">
            <div>
              <p className="resume-kicker">Executive Resume</p>
              <h1>{user.displayName}</h1>
              {resume.headline ? <p className="resume-headline">{resume.headline}</p> : null}
            </div>
            {contactItems.length > 0 ? (
              <address className="resume-contact-row">
                {contactItems.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </address>
            ) : null}
          </header>

          <div className={hasSidebar ? "executive-resume-layout" : "executive-resume-layout executive-resume-layout-full"}>
            <main className="executive-resume-main">
              {resume.executiveSummary ? (
                <section className="resume-section executive-summary-section">
                  <h2>Executive Profile</h2>
                  <p>{resume.executiveSummary}</p>
                </section>
              ) : null}
              <ResumeList items={resume.achievements} title="Selected Impact" />
              {resume.experience.length > 0 ? (
                <section className="resume-section">
                  <h2>Leadership Experience</h2>
                  {resume.experience.map((item, index) => (
                    <div className="resume-experience" key={`${item.title}-${item.organization}-${index}`}>
                      <div className="resume-experience-heading">
                        <div>
                          <h3>{item.title || item.organization || "Experience"}</h3>
                          <p>{[item.organization, item.location].filter(Boolean).join(" | ")}</p>
                        </div>
                        {item.dates ? <span>{item.dates}</span> : null}
                      </div>
                      {item.bullets.length > 0 ? (
                        <ul>
                          {item.bullets.map((bullet) => (
                            <li key={bullet}>{bullet}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </section>
              ) : null}
              {resume.additionalNotes ? (
                <section className="resume-section">
                  <h2>Additional Notes</h2>
                  <p>{resume.additionalNotes}</p>
                </section>
              ) : null}
              {resume.uploadedResumeUrl ? (
                <section className="resume-section no-print">
                  <h2>Uploaded Resume File</h2>
                  <a className="resume-upload-link" href={resume.uploadedResumeUrl} rel="noreferrer" target="_blank">
                    {resume.uploadedResumeName || "Uploaded resume"}
                  </a>
                </section>
              ) : null}
            </main>

            {hasSidebar ? (
              <aside className="executive-resume-sidebar">
                <ResumeList items={resume.coreSkills} title="Core Strengths" />
                <ResumeList items={resume.credentials} title="Credentials" />
                {resume.education.length > 0 ? (
                  <section className="resume-section">
                    <h2>Education</h2>
                    {resume.education.map((item, index) => (
                      <div className="resume-education" key={`${item.credential}-${item.institution}-${index}`}>
                        <strong>{item.credential || item.institution}</strong>
                        <span>{[item.institution, item.dates].filter(Boolean).join(" | ")}</span>
                        {item.details ? <p>{item.details}</p> : null}
                      </div>
                    ))}
                  </section>
                ) : null}
              </aside>
            ) : null}
          </div>
        </section>

        {scientology ? (
          <section className="resume-page resume-scientology-page">
            <p className="resume-kicker">Theta-Space Member Summary</p>
            <h2>My Scientology</h2>
            <ScientologyReferenceNotice compact />
            <div className="resume-scientology-grid">
              <span>Classification</span>
              <strong>{scientology.classification}</strong>
              {scientology.orgName ? (
                <>
                  <span>Org</span>
                  <strong>{scientology.orgName}</strong>
                </>
              ) : null}
              {scientology.trainingLevel ? (
                <>
                  <span>Training</span>
                  <strong>{scientology.trainingLevel}</strong>
                </>
              ) : null}
              {scientology.processingStatus ? (
                <>
                  <span>Processing</span>
                  <strong>{scientology.processingStatus}</strong>
                </>
              ) : null}
            </div>
            <ResumeList items={scientology.selections.courseCompletions} title="Course Completions" />
            <ResumeList items={scientology.selections.technicalCourses} title="Technical Courses" />
            <ResumeList items={scientology.selections.specialistCourses} title="Specialist Courses" />
            <ResumeList items={scientology.selections.additionalProcessing} title="Additional Processing" />
            {scientology.educationNotes ? (
              <section className="resume-section">
                <h2>Education Notes</h2>
                <p>{scientology.educationNotes}</p>
              </section>
            ) : null}
          </section>
        ) : null}
      </article>
    </AppShell>
  );
}
