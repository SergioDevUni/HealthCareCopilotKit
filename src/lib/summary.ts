import { regionLabels } from "./i18n";
import type { CaseGraph, Language } from "./types";

export function generateSummary(caseGraph: CaseGraph, style: "plain" | "clinical", language: Language) {
  const regions = caseGraph.bodyRegions
    .map((item) => `${item.label}${item.severity ? ` (${item.severity}/10)` : ""}`)
    .join(", ");
  const symptoms = caseGraph.symptoms
    .map((symptom) => {
      const region = symptom.region ? regionLabels[language][symptom.region] : "";
      return `- ${symptom.label}${region ? `, ${region}` : ""}${
        symptom.severity ? `, ${symptom.severity}/10` : ""
      }${symptom.duration ? `, ${symptom.duration}` : ""}${symptom.notes ? `: ${symptom.notes}` : ""}`;
    })
    .join("\n");
  const timeline = caseGraph.timeline.map((event) => `- ${event.time}: ${event.label}`).join("\n");
  const flags = caseGraph.redFlags.length
    ? caseGraph.redFlags.map((flag) => `- ${flag.label} (${flag.level})`).join("\n")
    : language === "en"
      ? "- No emergency red flags detected in this synthetic case."
      : "- No se detectan señales de emergencia en este caso sintético.";
  const how = caseGraph.howAppHelps?.map((item) => `- ${item}`).join("\n");

  if (language === "es") {
    return style === "clinical"
      ? `Resumen clínico sintético\nCaso: ${caseGraph.scenarioTitle ?? "Caso sintético"}\nMotivo: ${caseGraph.chiefConcern ?? "No especificado"}\nRegiones: ${
          regions || "No especificadas"
        }\nSíntomas:\n${symptoms || "- No registrados"}\nCronología:\n${
          timeline || "- No registrada"
        }\nSeñales de seguridad:\n${flags}\nDatos faltantes: ${
          caseGraph.missingInfo.join(", ") || "Ninguno"
        }\nCómo podría ayudar la app:\n${how || "- Organizando el caso y marcando límites de seguridad."}\nNota: resumen educativo organizado por IA; no es diagnóstico.`
      : `Resumen para la consulta\nEste caso sintético describe: ${
          caseGraph.chiefConcern ?? "un motivo no especificado"
        }.\n\nLo principal está en: ${regions || "regiones no especificadas"}.\n\nSíntomas:\n${
          symptoms || "- No registrados"
        }\n\nLínea de tiempo:\n${timeline || "- No registrada"}\n\nSeguridad:\n${flags}\n\nPreguntas/datos por confirmar: ${
          caseGraph.missingInfo.join(", ") || "ninguno"
        }.\n\nCómo podría ayudar la app:\n${how || "- Organizando el caso y marcando límites de seguridad."}\n\nEste resumen no diagnostica; ayuda a preparar una conversación con personal de salud.`;
  }

  return style === "clinical"
    ? `Synthetic clinical summary\nCase: ${caseGraph.scenarioTitle ?? "Synthetic case"}\nConcern: ${caseGraph.chiefConcern ?? "Not specified"}\nRegions: ${
        regions || "Not specified"
      }\nSymptoms:\n${symptoms || "- None recorded"}\nTimeline:\n${
        timeline || "- None recorded"
      }\nSafety signals:\n${flags}\nMissing information: ${
        caseGraph.missingInfo.join(", ") || "None"
      }\nHow the app could help:\n${how || "- By organizing the case and surfacing safety boundaries."}\nNote: AI-organized educational summary; not a diagnosis.`
    : `Visit preparation summary\nThis synthetic case describes: ${
        caseGraph.chiefConcern ?? "an unspecified concern"
      }.\n\nMain area: ${regions || "not specified"}.\n\nSymptoms:\n${
        symptoms || "- None recorded"
      }\n\nTimeline:\n${timeline || "- None recorded"}\n\nSafety:\n${flags}\n\nQuestions/details to confirm: ${
        caseGraph.missingInfo.join(", ") || "none"
      }.\n\nHow the app could help:\n${how || "- By organizing the case and surfacing safety boundaries."}\n\nThis summary does not diagnose; it helps prepare a conversation with a healthcare professional.`;
}
