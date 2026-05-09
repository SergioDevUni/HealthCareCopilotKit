import { NextResponse } from "next/server";

type IntakeUiKind =
  | "body_locator"
  | "severity_scale"
  | "timeline"
  | "red_flags"
  | "medication_history";

type IntakeUiPayload = {
  language?: "en" | "es";
  latestAnswer?: string;
  userNarrative?: string;
  currentQuestion?: string;
  questionCount?: number;
  caseGraph?: unknown;
};

const MAX_QUESTIONS = 15;

type IntakeUiResult = {
  source: "gemini" | "fallback";
  assistantMessage: string;
  nextQuestion: string;
  isComplete: boolean;
  ui: {
    type: IntakeUiKind;
    title: string;
    summary: string;
    priority: "routine" | "watch" | "urgent";
    facts: Array<{ label: string; value: string }>;
    choices: string[];
    actions: string[];
  };
  assessment?: {
    condition: string;
    confidence: number;
    rationale: string;
    nextSteps: Array<{ title: string; description: string; cta: string }>;
    correlations: Array<{ label: string; match: "High Match" | "Moderate Match" | "Low Match"; score: number }>;
    careInstructions: string[];
    urgentCare: string[];
  };
};

export async function POST(request: Request) {
  const payload = (await request.json()) as IntakeUiPayload;
  const language = payload.language ?? "en";

  if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_API_KEY) {
    return NextResponse.json(fallbackUi(payload, language, "fallback"));
  }

  try {
    const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite-preview";
    const response = await fetch(
      `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY}`,
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildPrompt(payload, language) }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.28,
        },
      }),
      },
    );

    if (!response.ok) {
      return NextResponse.json(fallbackUi(payload, language, "fallback"));
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = normalizeUi(parseJson(text));
    if (parsed && (payload.questionCount ?? 0) >= MAX_QUESTIONS) {
      parsed.isComplete = true;
      parsed.assessment = parsed.assessment ?? fallbackUi(payload, language, "fallback").assessment;
    }

    return NextResponse.json(parsed ?? fallbackUi(payload, language, "fallback"));
  } catch {
    return NextResponse.json(fallbackUi(payload, language, "fallback"));
  }
}

function buildPrompt(payload: IntakeUiPayload, language: "en" | "es") {
  const outputLanguage = language === "en" ? "English" : "Spanish";
  return `You are Atrium's intake guidance service.

You are given the patient's latest intake answer and current case graph. Decide the next patient-facing question and response options.

Return strict JSON only with this shape:
{
  "source": "gemini",
  "assistantMessage": "short response to the user",
  "nextQuestion": "one focused question that references the user's answer",
  "isComplete": false,
  "ui": {
    "type": "body_locator" | "severity_scale" | "timeline" | "red_flags" | "medication_history",
    "title": "UI title",
    "summary": "why this UI appears",
    "priority": "routine" | "watch" | "urgent",
    "facts": [{"label":"...", "value":"..."}],
    "choices": ["exactly 4 short multiple-choice answers; the UI will always add Other as option 5 and None / No as option 6"],
    "actions": ["short next-step labels"]
  },
  "assessment": {
    "condition": "most probable condition name, only when isComplete is true",
    "confidence": 0,
    "rationale": "brief reason",
    "nextSteps": [{"title":"...", "description":"...", "cta":"..."}],
    "correlations": [{"label":"...", "match":"High Match" | "Moderate Match" | "Low Match", "score": 0}],
    "careInstructions": ["..."],
    "urgentCare": ["..."]
  }
}

Routing guidelines:
- If the answer mentions a location or body part, prefer body_locator.
- If it includes pain/intensity or vague severity, prefer severity_scale.
- If timing/onset/change is unclear, prefer timeline.
- If it mentions chest pain, breathing trouble, fainting, neurologic symptoms, heavy bleeding, allergic reaction, severe headache/neck stiffness, or rapidly worsening symptoms, prefer red_flags.
- If it mentions medicines, allergies, chronic conditions, pregnancy/postpartum, surgery, or asks about history, prefer medication_history.
- If there is enough information to provide a primary assessment, set isComplete true and include assessment.
- The first answer should decide the next UI and question.
- Ask at most ${MAX_QUESTIONS} total questions. If questionCount is ${MAX_QUESTIONS} or higher, set isComplete true.
- Never ask if the user wants to save a summary, start a new check, review a summary, or prepare a review.
- Do not use summary_review during active intake.
- Every active-intake question must include exactly 4 multiple-choice choices. Do not include "Other", "None", or "No"; the UI adds Other as option 5 with a detail field and None / No as option 6.
- Do not ask for another open text answer after the first answer, except the UI-provided Other detail field.
- Assessment is not a definitive diagnosis; frame it as the most probable condition based on reported symptoms.
- Language: ${outputLanguage}.

Current context:
${JSON.stringify(payload, null, 2)}`;
}

function parseJson(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}

function normalizeUi(value: unknown): IntakeUiResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const ui = record.ui as Record<string, unknown> | undefined;
  if (!ui || typeof ui !== "object") return undefined;

  const type = typeof ui.type === "string" && isUiType(ui.type) ? ui.type : "severity_scale";
  const priority =
    ui.priority === "urgent" || ui.priority === "watch" || ui.priority === "routine" ? ui.priority : "routine";
  const choices = normalizeStrings(ui.choices);

  return {
    source: "gemini",
    assistantMessage: typeof record.assistantMessage === "string" ? record.assistantMessage : "I built the next check view.",
    nextQuestion: typeof record.nextQuestion === "string" ? record.nextQuestion : "What changed most since this started?",
    isComplete: record.isComplete === true,
    ui: {
      type,
      title: typeof ui.title === "string" ? ui.title : titleFor(type),
      summary: typeof ui.summary === "string" ? ui.summary : "Selected from the information shared so far.",
      priority,
      facts: normalizePairs(ui.facts),
      choices: choices.length ? choices : ["Yes", "No", "Not sure"],
      actions: normalizeStrings(ui.actions),
    },
    assessment: normalizeAssessment(record.assessment),
  };
}

function normalizeAssessment(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.condition !== "string" || !record.condition.trim()) return undefined;
  return {
    condition: record.condition,
    confidence: clampScore(record.confidence),
    rationale: typeof record.rationale === "string" ? record.rationale : "Based on the reported pattern.",
    nextSteps: normalizeNextSteps(record.nextSteps),
    correlations: normalizeCorrelations(record.correlations),
    careInstructions: normalizeStrings(record.careInstructions),
    urgentCare: normalizeStrings(record.urgentCare),
  };
}

function normalizeNextSteps(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      if (typeof record.title !== "string" || typeof record.description !== "string") return undefined;
      return {
        title: record.title,
        description: record.description,
        cta: typeof record.cta === "string" ? record.cta : "Open",
      };
    })
    .filter((item): item is { title: string; description: string; cta: string } => Boolean(item))
    .slice(0, 3);
}

function normalizeCorrelations(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      if (typeof record.label !== "string") return undefined;
      return {
        label: record.label,
        match:
          record.match === "High Match" || record.match === "Moderate Match" || record.match === "Low Match"
            ? (record.match as "High Match" | "Moderate Match" | "Low Match")
            : "Moderate Match",
        score: clampScore(record.score),
      };
    })
    .filter(
      (item): item is { label: string; match: "High Match" | "Moderate Match" | "Low Match"; score: number } =>
        Boolean(item),
    )
    .slice(0, 5);
}

function clampScore(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 70;
  const percent = number > 0 && number <= 1 ? number * 100 : number;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function normalizePairs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      if (typeof record.label !== "string" || typeof record.value !== "string") return undefined;
      return { label: record.label, value: record.value };
    })
    .filter((item): item is { label: string; value: string } => Boolean(item))
    .slice(0, 6);
}

function normalizeStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 4);
}

function isUiType(value: string): value is IntakeUiKind {
  return ["body_locator", "severity_scale", "timeline", "red_flags", "medication_history"].includes(value);
}

function titleFor(type: IntakeUiKind) {
  const titles: Record<IntakeUiKind, string> = {
    body_locator: "Pinpoint the location",
    severity_scale: "Rate the intensity",
    timeline: "Map the timing",
    red_flags: "Check warning signs",
    medication_history: "Add clinical context",
  };
  return titles[type];
}

function fallbackUi(payload: IntakeUiPayload, language: "en" | "es", source: "fallback"): IntakeUiResult {
  const answer = payload.latestAnswer ?? "";
  const urgent = /chest|breath|faint|weakness|bleed|allerg|severe headache|stiff neck|pecho|aire|desmayo|sangr|alerg/i.test(answer);
  const body = /head|neck|chest|abdomen|stomach|arm|leg|back|cabeza|cuello|pecho|abdomen|brazo|pierna|espalda/i.test(answer);
  const complete = (payload.questionCount ?? 0) >= MAX_QUESTIONS;
  const type: IntakeUiKind = urgent ? "red_flags" : body ? "body_locator" : "severity_scale";

  return {
    source,
    assistantMessage:
      language === "en"
        ? "I used your first answer to choose the next check view."
        : "Usé tu primera respuesta para elegir la siguiente vista del chequeo.",
    nextQuestion:
      language === "en"
        ? "What detail has changed the most since this started?"
        : "¿Qué detalle ha cambiado más desde que empezó?",
    isComplete: complete,
    ui: {
      type,
      title: titleFor(type),
      summary: answer ? `Based on: ${answer.slice(0, 130)}` : "Selected from the first intake answer.",
      priority: urgent ? "urgent" : "routine",
      facts: answer ? [{ label: "First answer", value: answer.slice(0, 120) }] : [],
      choices: ["Started today", "Getting worse", "Comes and goes", "Constant", "Not sure"],
      actions: ["Choose one answer", "Continue", "Complete assessment"],
    },
    assessment: complete
      ? {
          condition: language === "en" ? "Primary assessment pending" : "Evaluación principal pendiente",
          confidence: 60,
          rationale: language === "en" ? "Reached the question limit." : "Se alcanzó el límite de preguntas.",
          nextSteps: [],
          correlations: [],
          careInstructions: [],
          urgentCare: [],
        }
      : undefined,
  };
}
