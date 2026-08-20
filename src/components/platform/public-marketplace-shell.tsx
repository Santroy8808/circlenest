import Image from "next/image";
import Link from "next/link";
import { LogIn } from "lucide-react";

export function PublicMarketplaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-marketplace-shell">
      <header className="public-marketplace-header">
        <div className="public-marketplace-header-inner">
          <Link aria-label="Theta-Space Marketplace" className="public-marketplace-brand" href="/marketplace">
            <Image alt="" aria-hidden="true" height={38} priority src="/assets/theta-send-logo.png" width={50} />
            <span>
              <strong>Theta-Space</strong>
              <small>Marketplace</small>
            </span>
          </Link>
          <Link className="public-marketplace-login" href="/login?callbackUrl=/home/default">
            <LogIn aria-hidden="true" />
            Log in
          </Link>
        </div>
      </header>
      <main aria-label="Marketplace" className="public-marketplace-main" tabIndex={0}>
        {children}
      </main>
    </div>
  );
}
