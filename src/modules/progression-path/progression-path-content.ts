export type ProgressionStatus = "available" | "testing" | "in-progress" | "planned";

export type ProgressionNodeKind = "feature" | "tier";

export type ProgressionNode = {
  id: string;
  title: string;
  summary: string;
  details: string[];
  kind: ProgressionNodeKind;
  status: ProgressionStatus;
  tier: "Free" | "Contributor";
  column: number;
  row: number;
};

export type ProgressionLink = {
  from: ProgressionNode["id"];
  to: ProgressionNode["id"];
};

export const progressionStatusLabels: Record<ProgressionStatus, string> = {
  available: "Available",
  testing: "Beta testing",
  "in-progress": "In progress",
  planned: "Planned"
};

export const progressionNodes: ProgressionNode[] = [
  {
    id: "profiles",
    title: "Profiles & privacy",
    summary: "Build your identity and choose what other members can see.",
    details: ["Personal profile", "Privacy controls", "Gallery and profile pictures"],
    kind: "feature",
    status: "available",
    tier: "Free",
    column: 0,
    row: 1
  },
  {
    id: "stream",
    title: "Stream conversations",
    summary: "Post, reply, react, quote, share, and include pictures.",
    details: ["Public chronological stream", "Threaded replies", "Picture posts"],
    kind: "feature",
    status: "testing",
    tier: "Free",
    column: 1,
    row: 0
  },
  {
    id: "connections",
    title: "People & groups",
    summary: "Connect with members and participate in shared spaces.",
    details: ["Connections", "Groups", "Group moderation for group creators"],
    kind: "feature",
    status: "testing",
    tier: "Free",
    column: 2,
    row: 2
  },
  {
    id: "free",
    title: "Free",
    summary: "The complete core community experience.",
    details: ["Core social access", "200 MB personal storage", "One active personal Market listing"],
    kind: "tier",
    status: "testing",
    tier: "Free",
    column: 3,
    row: 1
  },
  {
    id: "messages",
    title: "Richer messaging",
    summary: "Keep direct conversations clear and easy to follow.",
    details: ["Message reactions", "Replies and quote replies", "Picture sharing"],
    kind: "feature",
    status: "testing",
    tier: "Contributor",
    column: 4,
    row: 0
  },
  {
    id: "writers-corner",
    title: "Writers Corner",
    summary: "Publish longer work and build a subscribed readership.",
    details: ["Manuscripts and chapters", "Reader subscriptions", "New-chapter notifications"],
    kind: "feature",
    status: "testing",
    tier: "Contributor",
    column: 5,
    row: 2
  },
  {
    id: "contributor-tools",
    title: "Contributor tools",
    summary: "Expanded creative and community capacity.",
    details: ["Expanded storage", "Expanded Market allowance", "Additional Stream controls"],
    kind: "feature",
    status: "in-progress",
    tier: "Contributor",
    column: 6,
    row: 0
  },
  {
    id: "contributor",
    title: "Contributor",
    summary: "The next step for members who create and participate more deeply.",
    details: ["Includes Free features", "Writers Corner", "Expanded limits and tools"],
    kind: "tier",
    status: "testing",
    tier: "Contributor",
    column: 7,
    row: 1
  }
];

export const progressionLinks: ProgressionLink[] = progressionNodes.slice(1).map((node, index) => ({
  from: progressionNodes[index].id,
  to: node.id
}));
