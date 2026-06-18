export type CutoverGateStatus = "required" | "manual" | "automated";

export type CutoverGate = {
  title: string;
  status: CutoverGateStatus;
  detail: string;
  command?: string;
};

export type SmokeRoute = {
  area: string;
  path: string;
  expected: string;
  requiresLogin: boolean;
};

export type CutoverDashboardView = {
  gates: CutoverGate[];
  smokeRoutes: SmokeRoute[];
  rollbackSteps: string[];
  nonGoals: string[];
};
