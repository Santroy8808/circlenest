"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

const LOGIN_SYMBOL_IMAGE = "/branding/theta-login-main.png";

const thetaArtCoreStyle: CSSProperties = {
  backgroundImage: `url(${LOGIN_SYMBOL_IMAGE})`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center 69%",
  backgroundSize: "80% auto",
  opacity: 0.86,
  mixBlendMode: "screen",
  WebkitMaskImage:
    "radial-gradient(ellipse 76% 78% at 50% 66%, black 0%, black 58%, rgba(0,0,0,0.72) 74%, transparent 94%)",
  maskImage:
    "radial-gradient(ellipse 76% 78% at 50% 66%, black 0%, black 58%, rgba(0,0,0,0.72) 74%, transparent 94%)",
};

const thetaArtGlowStyle: CSSProperties = {
  backgroundImage: `url(${LOGIN_SYMBOL_IMAGE})`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "center 69%",
  backgroundSize: "84% auto",
  opacity: 0.24,
  filter: "blur(18px)",
  mixBlendMode: "screen",
  WebkitMaskImage:
    "radial-gradient(ellipse 84% 82% at 50% 67%, black 0%, rgba(0,0,0,0.78) 62%, transparent 94%)",
  maskImage:
    "radial-gradient(ellipse 84% 82% at 50% 67%, black 0%, rgba(0,0,0,0.78) 62%, transparent 94%)",
};

export function ThetaAuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050608]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(255,194,56,0.1)_0%,transparent_34%),radial-gradient(circle_at_86%_82%,rgba(255,194,56,0.06)_0%,transparent_40%),linear-gradient(160deg,#030406_0%,#090d14_45%,#030406_100%)]" />
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(to_bottom,rgba(255,255,255,0.07),transparent_28%),linear-gradient(115deg,rgba(255,255,255,0.04),transparent_42%)]" />

      <section className="relative mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 md:px-8">
        <div className="relative grid w-full gap-0 overflow-hidden rounded-3xl border border-[#b48a2c]/70 bg-[#07090f]/82 shadow-[0_34px_90px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-lg md:grid-cols-[1.05fr_1fr]">
          <div className="pointer-events-none absolute inset-y-10 left-[51.2%] hidden w-px bg-gradient-to-b from-transparent via-[#d4ab4c]/60 to-transparent md:block" />
          <div className="pointer-events-none absolute inset-y-20 left-[51.2%] hidden w-10 -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgba(226,178,62,0.24),transparent_74%)] blur-md md:block" />

          <div className="relative isolate min-h-[520px] overflow-hidden border-b border-[#b48a2c]/20 p-8 md:min-h-[560px] md:border-b-0 md:p-12">
            <LeftPanelAtmosphere />
            <div className="relative z-20">
              <p className="text-xs uppercase tracking-[0.22em] text-[#f0cb71]">Theta-Space</p>
              <h1 className="mt-4 text-3xl font-semibold text-[#f6e2af] md:text-4xl">{title}</h1>
              <p className="mt-3 max-w-md text-sm text-[#d7c79f]/95 md:text-base">{subtitle}</p>
            </div>
          </div>

          <div className="relative isolate p-8 md:p-12">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,transparent_26%)]" />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-[radial-gradient(ellipse_at_left,rgba(239,189,70,0.12)_0%,transparent_72%)]" />
            <div className="relative z-20">{children}</div>
            <div className="relative z-20 mt-6 border-t border-[#b48a2c]/30 pt-4 text-xs text-[#ccb78a]">
              {footer ?? (
                <p>
                  New here?{" "}
                  <Link href="/signup" className="underline underline-offset-2">
                    Create account
                  </Link>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function LeftPanelAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(175deg,rgba(255,255,255,0.07)_0%,transparent_30%),radial-gradient(circle_at_46%_74%,rgba(245,196,81,0.14)_0%,transparent_45%)]" />

      <div className="absolute inset-0" style={thetaArtGlowStyle} />
      <div className="absolute inset-0" style={thetaArtCoreStyle} />

      <div className="absolute bottom-[-3.1rem] left-1/2 h-[14rem] w-[28rem] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(236,184,70,0.26)_0%,rgba(236,184,70,0.08)_32%,transparent_72%)] blur-sm" />

      <div className="absolute inset-0">
        {THETA_PARTICLES.map((particle, idx) => (
          <span
            key={`${particle.left}-${particle.top}-${idx}`}
            className="theta-particle"
            style={{
              left: particle.left,
              top: particle.top,
              width: particle.size,
              height: particle.size,
              animationDelay: particle.delay,
              animationDuration: particle.duration,
              ["--theta-drift-x" as string]: particle.drift,
              ["--theta-max-opacity" as string]: particle.opacity,
            }}
          />
        ))}
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(5,7,12,0.18)_58%,rgba(5,7,12,0.76)_100%)]" />
      <div className="absolute left-0 top-0 h-[46%] w-[78%] bg-[linear-gradient(135deg,rgba(5,7,12,0.96)_0%,rgba(5,7,12,0.84)_42%,rgba(5,7,12,0.32)_72%,transparent_100%)]" />
      <div className="absolute inset-0 shadow-[inset_0_0_132px_46px_rgba(5,7,12,0.76)]" />
    </div>
  );
}

const THETA_PARTICLES = [
  { left: "48%", top: "24%", size: "3px", delay: "0s", duration: "8.8s", drift: "-12px", opacity: "0.58" },
  { left: "52%", top: "27%", size: "2px", delay: "1.1s", duration: "10.4s", drift: "10px", opacity: "0.54" },
  { left: "57%", top: "25%", size: "2px", delay: "0.7s", duration: "9.6s", drift: "-9px", opacity: "0.52" },
  { left: "44%", top: "31%", size: "2px", delay: "2.2s", duration: "11.1s", drift: "13px", opacity: "0.48" },
  { left: "54%", top: "33%", size: "3px", delay: "2.9s", duration: "11.5s", drift: "-8px", opacity: "0.56" },
  { left: "60%", top: "30%", size: "2px", delay: "3.5s", duration: "9.8s", drift: "9px", opacity: "0.46" },
  { left: "50%", top: "36%", size: "2px", delay: "1.8s", duration: "10.2s", drift: "-10px", opacity: "0.44" },
  { left: "55%", top: "38%", size: "2px", delay: "4.1s", duration: "12.2s", drift: "7px", opacity: "0.5" },
] as const;
