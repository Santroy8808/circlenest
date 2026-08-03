type ShellCounts = {
  alerts: number;
  mail: number;
  messages: number;
  notifications: number;
};

export function chatBadgeCount(counts: ShellCounts) {
  return counts.messages;
}
