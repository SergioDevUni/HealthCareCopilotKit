import type { CaseGraph, Language, RedFlag } from "./types";

const rules = [
  {
    id: "chest-pressure",
    level: "emergency" as const,
    en: "Chest pain or pressure with severe symptoms",
    es: "Dolor u opresión en el pecho con síntomas severos",
    pattern:
      /chest pain|chest pressure|chest tightness|dolor de pecho|opresi[oó]n en el pecho|presi[oó]n en el pecho|pressure in chest/i,
  },
  {
    id: "stroke",
    level: "emergency" as const,
    en: "Possible stroke signs",
    es: "Posibles señales de evento cerebrovascular",
    pattern:
      /face droop|slurred speech|one-sided weakness|debilidad de un lado|habla arrastrada|cara ca[ií]da/i,
  },
  {
    id: "breathing",
    level: "emergency" as const,
    en: "Severe difficulty breathing",
    es: "Dificultad severa para respirar",
    pattern:
      /can't breathe|cannot breathe|shortness of breath|difficulty breathing|severe shortness of breath|no puedo respirar|falta de aire|dificultad para respirar/i,
  },
  {
    id: "allergy",
    level: "emergency" as const,
    en: "Possible severe allergic reaction",
    es: "Posible reacción alérgica severa",
    pattern: /swollen tongue|throat swelling|anafilax|lengua hinchada|garganta hinchada/i,
  },
  {
    id: "bleeding",
    level: "emergency" as const,
    en: "Uncontrolled bleeding",
    es: "Sangrado no controlado",
    pattern: /uncontrolled bleeding|heavy bleeding|sangrado abundante|sangrado no controlado/i,
  },
  {
    id: "severe-abdominal",
    level: "urgent" as const,
    en: "Severe or worsening abdominal pain",
    es: "Dolor abdominal severo o progresivo",
    pattern: /severe abdominal|worsening abdominal|abdomen rígido|dolor abdominal severo/i,
  },
  {
    id: "pregnancy",
    level: "urgent" as const,
    en: "Pregnancy-related severe symptom",
    es: "Síntoma severo relacionado con embarazo",
    pattern: /pregnant.*bleeding|pregnancy.*severe pain|embarazad.*sangrado|embarazo.*dolor severo/i,
  },
  {
    id: "self-harm",
    level: "emergency" as const,
    en: "Self-harm or suicide concern",
    es: "Riesgo de autolesión o suicidio",
    pattern: /suicide|kill myself|self harm|suicidio|matarme|hacerme da[nñ]o/i,
  },
];

export function detectRedFlags(caseGraph: CaseGraph, freeText = ""): RedFlag[] {
  const haystack = [
    freeText,
    caseGraph.chiefConcern,
    ...caseGraph.symptoms.map((symptom) =>
      [symptom.label, symptom.duration, symptom.notes, symptom.severity ? `severity ${symptom.severity}` : ""].join(
        " ",
      ),
    ),
    ...caseGraph.timeline.map((event) => event.label),
  ].join(" ");

  const language: Language = caseGraph.language;

  return rules
    .filter((rule) => rule.pattern.test(haystack))
    .map((rule) => ({
      id: rule.id,
      label: rule[language],
      level: rule.level,
      matchedText: haystack.match(rule.pattern)?.[0],
    }));
}

export function highestSafetyLevel(redFlags: RedFlag[]) {
  if (redFlags.some((flag) => flag.level === "emergency")) return "emergency";
  if (redFlags.some((flag) => flag.level === "urgent")) return "urgent";
  return "none";
}
