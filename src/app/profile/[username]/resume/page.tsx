import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/platform/app-shell";
import { PrintButton } from "@/components/profile/print-button";
import { getPublicResumeByUsername } from "@/modules/profile-resume/profile-resume.service";

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

export default async function PublicResumePage({ params }: { params: { username: string } }) {
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

  return (
    <AppShell>
      <div className="resume-toolbar no-print">
        <Link className="btn-secondary" href={`/profile/${params.username}`}>
          Back to profile
        </Link>
        <PrintButton />
      </div>
      <article className="resume-document">
        <section className="resume-cover-page">
          <p className="resume-kicker">Professional Resume</p>
          <h1>{user.displayName}</h1>
          {resume.headline ? <p className="resume-headline">{resume.headline}</p> : null}
          <div className="resume-contact-row">
            {resume.location ? <span>{resume.location}</span> : null}
            {resume.email ? <span>{resume.email}</span> : null}
            {resume.phone ? <span>{resume.phone}</span> : null}
            {resume.website ? <span>{resume.website}</span> : null}
          </div>
          {resume.executiveSummary ? <p className="resume-cover-summary">{resume.executiveSummary}</p> : null}
          {resume.uploadedResumeUrl ? (
            <a className="resume-upload-link" href={resume.uploadedResumeUrl} rel="noreferrer" target="_blank">
              {resume.uploadedResumeName || "Uploaded resume"}
            </a>
          ) : null}
        </section>

        <section className="resume-page">
          <ResumeList items={resume.coreSkills} title="Core Strengths" />
          <ResumeList items={resume.achievements} title="Selected Achievements" />
          {resume.experience.length > 0 ? (
            <section className="resume-section">
              <h2>Professional Experience</h2>
              {resume.experience.map((item, index) => (
                <div className="resume-experience" key={`${item.title}-${item.organization}-${index}`}>
                  <div>
                    <h3>{item.title || item.organization || "Experience"}</h3>
                    <p>
                      {[item.organization, item.location, item.dates].filter(Boolean).join(" | ")}
                    </p>
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
          <ResumeList items={resume.credentials} title="Credentials" />
          {resume.additionalNotes ? (
            <section className="resume-section">
              <h2>Additional Notes</h2>
              <p>{resume.additionalNotes}</p>
            </section>
          ) : null}
        </section>

        {scientology ? (
          <section className="resume-page resume-scientology-page">
            <p className="resume-kicker">Theta-Space Member Summary</p>
            <h2>My Scientology</h2>
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
