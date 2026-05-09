import { NextResponse } from "next/server";

type CheckGuidePayload = {
  questionCount?: number;
  currentQuestion?: string;
  chiefConcern?: string;
  userNarrative?: string;
  selectedCategories?: string[];
  missingInfo?: string[];
  redFlags?: Array<{ label: string; level: string }>;
  language?: "en" | "es";
};

export async function POST(request: Request) {
  const payload = (await request.json()) as CheckGuidePayload;
  const language = payload.language ?? "en";

  if (!process.env.GOOGLE_API_KEY && !process.env.GEMINI_AUTH_TOKEN) {
    return NextResponse.json({ question: fallbackQuestion(payload, language), source: "fallback" });
  }

  try {
    const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite-preview";
    const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY}`;
    const response = await fetch(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildPrompt(payload, language),
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.25,
          },
        }),
      },
    );

    if (!response.ok) {
      return NextResponse.json({ question: fallbackQuestion(payload, language), source: "fallback" });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = parseJson(text);
    const question = typeof parsed?.question === "string" ? parsed.question : fallbackQuestion(payload, language);

    return NextResponse.json({
      question,
      rationale: typeof parsed?.rationale === "string" ? parsed.rationale : undefined,
      source: "gemini",
    });
  } catch {
    return NextResponse.json({ question: fallbackQuestion(payload, language), source: "fallback" });
  }
}

function buildPrompt(payload: CheckGuidePayload, language: "en" | "es") {
  const outputLanguage = language === "en" ? "English" : "Spanish";
  return `You are powering Atrium's healthcare intake experience. Do not prescribe medication or replace medical care.

Task:
- Read the user's previous responses.
- Ask exactly one concise follow-up question that references their prior answer naturally.
- Prefer safety-critical missing information first.
- If red flags are present, ask an urgent-care oriented clarification and avoid routine intake.
- Return strict JSON only: {"question":"...","rationale":"..."}.
- Language: ${outputLanguage}.

Current intake context:
${JSON.stringify(payload, null, 2)}`;
}

function parseJson(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as { question?: unknown; rationale?: unknown };
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]) as { question?: unknown; rationale?: unknown };
    } catch {
      return undefined;
    }
  }
}

function fallbackQuestion(payload: CheckGuidePayload, language: "en" | "es") {
  const categories = payload.selectedCategories?.join(", ");
  const missing = payload.missingInfo?.[0];
  if (payload.redFlags?.length) {
    return language === "en"
      ? "You mentioned a possible warning sign. Are you having chest pain, trouble breathing, fainting, severe weakness, heavy bleeding, or rapidly worsening symptoms right now?"
      : "Mencionaste una posible señal de alarma. ¿Tienes dolor de pecho, falta de aire, desmayo, debilidad intensa, sangrado abundante o síntomas que empeoran rápido ahora?";
  }
  if (missing) {
    return language === "en"
      ? `To clarify ${missing.toLowerCase()}, when did this start and has it changed since it began?`
      : `Para aclarar ${missing.toLowerCase()}, ¿cuándo empezó y ha cambiado desde entonces?`;
  }
  if (categories) {
    return language === "en"
      ? `For the ${categories} symptoms, what detail would you want a clinician to know first?`
      : `Sobre los síntomas de ${categories}, ¿qué detalle debería saber primero un profesional clínico?`;
  }
  return language === "en"
    ? "What is the main symptom or concern you want to check today?"
    : "¿Cuál es el síntoma o preocupación principal que quieres revisar hoy?";
}

