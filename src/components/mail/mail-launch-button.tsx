"use client";

export function MailLaunchButton({ unreadCount = 0 }: { unreadCount?: number }) {
  return (
    <button
      type="button"
      title="Unread mail"
      aria-label={`${unreadCount} unread mail`}
      className="hover:underline"
      onClick={() => window.dispatchEvent(new Event("theta-mail-open"))}
    >
      Mail {unreadCount}
    </button>
  );
}
