export type Language = "en" | "es";

export type BodyRegion =
  | "head"
  | "chest"
  | "abdomen"
  | "back"
  | "leftArm"
  | "rightArm"
  | "leftLeg"
  | "rightLeg";

export type Symptom = {
  id: string;
  region?: BodyRegion;
  label: string;
  severity?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  duration?: string;
  notes?: string;
};

export type TimelineEvent = {
  id: string;
  time: string;
  label: string;
};

export type RedFlag = {
  id: string;
  label: string;
  level: "urgent" | "emergency";
  matchedText?: string;
};

export type BodyRegionSelection = {
  region: BodyRegion;
  label: string;
  severity?: number;
};

export type CaseGraph = {
  mode: "demo";
  language: Language;
  checkStatus?: "idle" | "active" | "review-ready";
  questionCount?: number;
  currentQuestion?: string;
  scenarioId?: string;
  scenarioTitle?: string;
  chiefConcern?: string;
  userNarrative?: string;
  medicalHistory: string[];
  medications: string[];
  allergies: string[];
  bodyRegions: BodyRegionSelection[];
  symptoms: Symptom[];
  timeline: TimelineEvent[];
  relevantPositives: string[];
  relevantNegatives: string[];
  missingInfo: string[];
  redFlags: RedFlag[];
  summaryDraft?: string;
  howAppHelps?: string[];
  sources?: Array<{
    label: string;
    url: string;
  }>;
};

export type CheckRecord = {
  id: string;
  createdAt: string;
  language: Language;
  title: string;
  safetyLevel: "none" | "urgent" | "emergency";
  symptomCount: number;
  missingCount: number;
  bodyAreas: string[];
  importantSymptoms: string[];
  summary: string;
  snapshot: CaseGraph;
};
