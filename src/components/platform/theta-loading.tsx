import type { ReactNode } from "react";

type ThetaLoadingProps = {
  className?: string;
  detail?: ReactNode;
  inline?: boolean;
  label?: ReactNode;
  size?: "sm" | "md" | "lg";
};

export function ThetaLoading({
  className,
  detail,
  inline = false,
  label = "Loading",
  size = "md"
}: ThetaLoadingProps) {
  const classes = [
    "theta-loading",
    inline ? "is-inline" : "is-block",
    `is-${size}`,
    className
  ].filter(Boolean).join(" ");
  const hasCopy = Boolean(label || detail);

  return (
    <span aria-live="polite" className={classes} role={inline ? undefined : "status"}>
      <span aria-hidden="true" className="theta-loading-mark">
        <span className="theta-loading-symbol">Θ</span>
      </span>
      {hasCopy ? (
        <span className="theta-loading-copy">
          {label ? <span className="theta-loading-label">{label}</span> : null}
          {detail ? <span className="theta-loading-detail">{detail}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
