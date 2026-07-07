import Link from "next/link";
import { AuditorHelpClient } from "@/components/auditor-help/auditor-help-client";

export default function GetHelpPage() {
  return (
    <main className="gethelp-surface">
      <div className="gethelp-shell">
        <header className="gethelp-top">
          <Link className="text-sm font-semibold text-[var(--gold)]" href="/">
            Theta-Space
          </Link>
          <div className="flex flex-wrap gap-3">
            <Link className="btn-secondary" href="/auditors">
              Find an auditor
            </Link>
            <Link className="btn-secondary" href="/login?callbackUrl=/auditors">
              Log in
            </Link>
          </div>
        </header>
        <AuditorHelpClient />
      </div>
    </main>
  );
}
