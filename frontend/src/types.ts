export interface RiskItem {
  level: "high" | "medium" | "low";
  message: string;
}

export interface ChangedFile {
  filename: string;
  riskLevel: "high" | "medium" | "low" | "none";
  content: string;
}

export interface SuggestionItem {
  file: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  originalCode: string;
  revisedCode: string;
  explanation: string;
}

export interface ScoreBreakdown {
  overall: number;
  security: number;
  performance: number;
  quality: number;
  verdict: string;
  verdictReason: string;
}

export interface PRReviewData {
  title: string;
  repo: string;
  author: string;
  authorAvatar?: string;
  filesCount: number;
  summary: string;
  risks: RiskItem[];
  changedFiles: ChangedFile[];
  suggestions: SuggestionItem[];
  score?: ScoreBreakdown;
  report?: string;
}

export interface SandboxTemplate {
  name: string;
  description: string;
  files: { filename: string; content: string }[];
}
