"use client";

import { Canvas } from "@react-three/fiber";
import {
  ArrowRight,
  Bell,
  BriefcaseMedical,
  Grid2X2,
  Globe2,
  HeartPulse,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
  UserCircle,
} from "lucide-react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import * as THREE from "three";
import { applyAdaptiveAnswer, startAdaptiveCheck } from "@/lib/agent-flow";
import { createInitialCase } from "@/lib/case-data";
import { regionLabels, text } from "@/lib/i18n";
import { scenarioToCaseGraph, teachingScenarios } from "@/lib/scenarios";
import { detectRedFlags, highestSafetyLevel } from "@/lib/safety";
import type { BodyRegion, CaseGraph, CheckRecord, Language } from "@/lib/types";

const CHECK_HISTORY_KEY = "care-case-copilot-history-v1";

const regionPositions: Record<BodyRegion, [number, number, number]> = {
  head: [0, 1.85, 0],
  chest: [0, 0.95, 0],
  abdomen: [0, 0.15, 0],
  back: [0, 0.55, -0.28],
  leftArm: [-0.9, 0.55, 0],
  rightArm: [0.9, 0.55, 0],
  leftLeg: [-0.32, -1.15, 0],
  rightLeg: [0.32, -1.15, 0],
};

const regions: BodyRegion[] = [
  "head",
  "chest",
  "abdomen",
  "back",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
];

type IntakeUiKind =
  | "body_locator"
  | "severity_scale"
  | "timeline"
  | "red_flags"
  | "medication_history";

type IntakeUiSpec = {
  type: IntakeUiKind;
  title: string;
  summary: string;
  priority: "routine" | "watch" | "urgent";
  facts: Array<{ label: string; value: string }>;
  choices: string[];
  actions: string[];
};

type IntakeUiResult = {
  source: "gemini" | "fallback";
  assistantMessage: string;
  nextQuestion: string;
  isComplete: boolean;
  ui: IntakeUiSpec;
  assessment?: AssessmentResult;
};

type AssessmentResult = {
  condition: string;
  confidence: number;
  rationale: string;
  friendlyTitle?: string;
  patientMessage?: string;
  reassurance?: string;
  confidenceLabel?: string;
  nextSteps: Array<{ title: string; description: string; cta: string }>;
  correlations: Array<{ label: string; match: "High Match" | "Moderate Match" | "Low Match"; score: number }>;
  careInstructions: string[];
  urgentCare: string[];
};

export default function Home() {
  return <CaseWorkspace />;
}

function CaseWorkspace() {
  const [language, setLanguage] = useState<Language>("en");
  const [isReady, setIsReady] = useState(false);
  const [view, setView] = useState<"home" | "check" | "dashboard">("home");
  const [history, setHistory] = useState<CheckRecord[]>([]);
  const [highlightedRegion, setHighlightedRegion] = useState<BodyRegion>("abdomen");
  const [caseGraph, setCaseGraph] = useState<CaseGraph>(() => createInitialCase("en"));

  const t = text[language];
  const safetyLevel = highestSafetyLevel(caseGraph.redFlags);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsReady(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(CHECK_HISTORY_KEY);
        if (saved) {
          setHistory(JSON.parse(saved) as CheckRecord[]);
        }
      } catch {
        setHistory([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(CHECK_HISTORY_KEY, JSON.stringify(history.slice(0, 12)));
  }, [history, isReady]);

  function switchLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    const activeScenario = teachingScenarios.find((scenario) => scenario.id === caseGraph.scenarioId);
    const nextCase = activeScenario
      ? applySafety(scenarioToCaseGraph(activeScenario, nextLanguage))
      : caseGraph.checkStatus === "active" || caseGraph.checkStatus === "review-ready"
        ? startAdaptiveCheck(nextLanguage)
        : createInitialCase(nextLanguage);
    setCaseGraph(nextCase);
    setHighlightedRegion(activeScenario?.primaryRegion ?? "abdomen");
  }

  function startNewCheck() {
    setHighlightedRegion("abdomen");
    setCaseGraph(startAdaptiveCheck(language));
    setView("check");
  }

  function openRecord(record: CheckRecord) {
    setLanguage(record.language);
    setCaseGraph(record.snapshot);
    setHighlightedRegion(record.snapshot.bodyRegions[0]?.region ?? "abdomen");
    setView("check");
  }

  const importantSymptoms = Array.from(
    new Set([
      ...caseGraph.symptoms.map((symptom) => symptom.label),
      ...history.flatMap((record) => record.importantSymptoms),
    ]),
  ).slice(0, 6);
  const followUps = Array.from(
    new Set([...caseGraph.missingInfo, ...history.flatMap((record) => record.snapshot.missingInfo)]),
  ).slice(0, 6);

  return (
    <main className="workspace">
      <header className="topbar" hidden={view === "check"}>
        <button className="brand" onClick={() => setView("home")} aria-label={t.backHome}>
          <BriefcaseMedical size={27} strokeWidth={2.1} aria-hidden />
          <span>Atrium</span>
        </button>

        <nav className="main-nav" aria-label="Primary">
          <button type="button">Patients</button>
          <button type="button">Appointments</button>
          <button type="button" onClick={() => setView("dashboard")}>
            Records
          </button>
        </nav>

        <div className="top-actions">
          <button className="icon-button" aria-label="Notifications">
            <Bell size={23} strokeWidth={2.1} aria-hidden />
          </button>
          <button className="icon-button" aria-label="Profile">
            <UserCircle size={26} strokeWidth={2.1} aria-hidden />
          </button>
          <div className="advanced-actions">
            <button className="ghost" onClick={() => setView("home")}>
              {t.backHome}
            </button>
            <div className="segmented" aria-label={t.language}>
              <button className={language === "en" ? "active" : ""} onClick={() => switchLanguage("en")}>
                <Globe2 size={16} aria-hidden />
                EN
              </button>
              <button className={language === "es" ? "active" : ""} onClick={() => switchLanguage("es")}>
                <Globe2 size={16} aria-hidden />
                ES
              </button>
            </div>
            <button
              className="ghost"
              onClick={() => {
                setCaseGraph(createInitialCase(language));
                setView("home");
              }}
            >
              <RotateCcw size={16} aria-hidden />
              {t.reset}
            </button>
          </div>
        </div>
      </header>

      <section className="safety-strip" data-level={safetyLevel} hidden={view === "home" || view === "check"}>
        <ShieldAlert size={18} aria-hidden />
        <span>
          {safetyLevel === "emergency"
            ? t.emergency
            : safetyLevel === "urgent"
              ? t.urgent
              : t.safety}
        </span>
      </section>

      {view === "home" && (
        <HomeView
          t={t}
          onNewCheck={startNewCheck}
          onDashboard={() => setView("dashboard")}
        />
      )}

      {view === "dashboard" && (
        <DashboardView
          t={t}
          history={history}
          currentCase={caseGraph}
          importantSymptoms={importantSymptoms}
          followUps={followUps}
          onNewCheck={startNewCheck}
          onOpenRecord={openRecord}
        />
      )}

      {view === "check" && (
        <NewCheckFlow
          language={language}
          caseGraph={caseGraph}
          setCaseGraph={setCaseGraph}
          highlightedRegion={highlightedRegion}
          setHighlightedRegion={setHighlightedRegion}
          onCancel={() => setView("home")}
          onDashboard={() => setView("dashboard")}
        />
      )}

      {view === "home" && (
        <footer className="app-footer">
          <strong>Atrium</strong>
          <nav aria-label="Footer">
            <a href="#">Contact Support</a>
            <a href="#">Legal & Privacy</a>
            <a href="#">Security Standards</a>
          </nav>
          <span>© 2024 Atrium Health Systems. All rights reserved.</span>
        </footer>
      )}
    </main>
  );
}

function HomeView({
  t,
  onNewCheck,
  onDashboard,
}: {
  t: Record<string, string>;
  onNewCheck: () => void;
  onDashboard: () => void;
}) {
  return (
    <section className="home-shell" aria-labelledby="home-title">
      <div className="home-hero">
        <h2 id="home-title">Good morning, Carlos Alejandro</h2>
        <p>What would you like to focus on today? Select an option below to get started.</p>
      </div>

      <div className="home-choice-grid" aria-label="Primary actions">
        <article className="choice-card choice-card-primary">
          <button type="button" onClick={onNewCheck} aria-label={t.newCheck}>
            <span className="choice-icon">
              <HeartPulse size={38} strokeWidth={2.3} aria-hidden />
            </span>
            <ArrowRight className="choice-arrow" size={31} strokeWidth={1.8} aria-hidden />
            <span className="choice-copy">
              <strong>New Check</strong>
              <span>Start a guided health check or prepare for a conversation with a clinician.</span>
            </span>
          </button>
        </article>

        <article className="choice-card choice-card-secondary">
          <button type="button" onClick={onDashboard} aria-label={t.dashboard}>
            <span className="choice-icon">
              <Grid2X2 size={39} strokeWidth={2.1} aria-hidden />
            </span>
            <span className="choice-copy">
              <strong>My Health Dashboard</strong>
              <span>Review recent checks, care notes, upcoming appointments, and personal health trends.</span>
            </span>
          </button>
        </article>
      </div>
    </section>
  );
}

function NewCheckFlow({
  language,
  caseGraph,
  setCaseGraph,
  highlightedRegion,
  setHighlightedRegion,
  onCancel,
  onDashboard,
}: {
  language: Language;
  caseGraph: CaseGraph;
  setCaseGraph: Dispatch<SetStateAction<CaseGraph>>;
  highlightedRegion: BodyRegion;
  setHighlightedRegion: Dispatch<SetStateAction<BodyRegion>>;
  onCancel: () => void;
  onDashboard: () => void;
}) {
  const [firstAnswer, setFirstAnswer] = useState("");
  const [selectedChoice, setSelectedChoice] = useState("");
  const [otherAnswer, setOtherAnswer] = useState("");
  const [currentUi, setCurrentUi] = useState<IntakeUiResult | null>(null);
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentUi?.ui.type]);

  function applyAnswer(answer: string) {
    const baseCase =
      caseGraph.checkStatus === "idle" && !caseGraph.scenarioId ? startAdaptiveCheck(language) : caseGraph;
    const result = applyAdaptiveAnswer(baseCase, answer);
    setCaseGraph(result.caseGraph);
    if (result.highlightedRegion) {
      setHighlightedRegion(result.highlightedRegion);
    }
    return result.caseGraph;
  }

  async function routeAnswer(answer: string, graph: CaseGraph) {
    setIsRouting(true);
    try {
      const response = await fetch("/api/intake-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latestAnswer: answer,
          chiefConcern: graph.chiefConcern,
          userNarrative: graph.userNarrative,
          currentQuestion: graph.currentQuestion,
          questionCount: graph.questionCount,
          caseGraph: graph,
          language,
        }),
      });
      const data = (await response.json()) as IntakeUiResult;
      setCurrentUi(data);
      if (data.isComplete && data.assessment) {
        setAssessment(await enhanceAssessment(data.assessment, graph));
      }
      setCaseGraph((current) => ({
        ...current,
        currentQuestion: data.nextQuestion,
      }));
    } catch {
      setCurrentUi({
        source: "fallback",
        assistantMessage: "I used your answer to choose the next question.",
        nextQuestion: graph.currentQuestion ?? "What changed most since this started?",
        isComplete: false,
        ui: {
          type: "severity_scale",
          title: "Rate the intensity",
          summary: "Selected from the information shared so far.",
          priority: "routine",
          facts: [],
          choices: ["1-3 mild", "4-6 moderate", "7-10 severe"],
          actions: ["Answer the focused question", "Generate the next UI"],
        },
      });
    } finally {
      setIsRouting(false);
    }
  }

  async function submitFirstAnswer() {
    const answer = firstAnswer.trim() || "User started a new health check.";
    const graph = applyAnswer(answer);
    await routeAnswer(answer, graph);
  }

  async function submitFollowUp() {
    const answer = selectedChoice === "Other" ? otherAnswer.trim() : selectedChoice.trim();
    if (!answer || !currentUi) return;
    const graph = applyAnswer(`Question: ${currentUi.nextQuestion}\nAnswer: ${answer}`);
    setSelectedChoice("");
    setOtherAnswer("");
    await routeAnswer(answer, graph);
  }

  async function enhanceAssessment(baseAssessment: AssessmentResult, graph: CaseGraph) {
    try {
      const response = await fetch("/api/patient-advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          assessment: baseAssessment,
          caseGraph: graph,
        }),
      });
      const advice = (await response.json()) as {
        friendlyTitle?: string;
        patientMessage?: string;
        reassurance?: string;
        confidenceLabel?: string;
        gentleNextSteps?: AssessmentResult["nextSteps"];
        careInstructions?: string[];
        urgentCare?: string[];
      };
      return {
        ...baseAssessment,
        friendlyTitle: advice.friendlyTitle ?? baseAssessment.friendlyTitle,
        patientMessage: advice.patientMessage ?? baseAssessment.patientMessage,
        reassurance: advice.reassurance ?? baseAssessment.reassurance,
        confidenceLabel: advice.confidenceLabel ?? baseAssessment.confidenceLabel,
        nextSteps: advice.gentleNextSteps?.length ? advice.gentleNextSteps : baseAssessment.nextSteps,
        careInstructions: advice.careInstructions?.length ? advice.careInstructions : baseAssessment.careInstructions,
        urgentCare: advice.urgentCare?.length ? advice.urgentCare : baseAssessment.urgentCare,
      };
    } catch {
      return baseAssessment;
    }
  }

  if (assessment) {
    return (
      <AssessmentPage
        assessment={assessment}
        onBack={onCancel}
        onDashboard={onDashboard}
      />
    );
  }

  return (
    <section className="agentic-check" aria-labelledby="agentic-check-title">
      <header className="agentic-check-top">
        <strong>Atrium</strong>
        <button type="button" onClick={onCancel}>
          Cancel Check
        </button>
      </header>

      <div className="agentic-check-hero">
        <span>Guided intake</span>
        <h2 id="agentic-check-title">{currentUi ? currentUi.nextQuestion : "What brings you in today?"}</h2>
        {!currentUi && <p>The first answer decides the next question.</p>}
      </div>

      <div className="agentic-check-grid">
        <section className="agentic-primary">
          <label className="large-answer">
            {!currentUi && (
              <>
                <span>First question</span>
                <textarea
                  value={firstAnswer}
                  onChange={(event) => setFirstAnswer(event.target.value)}
                  placeholder="Example: I have chest tightness and shortness of breath since this morning..."
                  rows={7}
                />
              </>
            )}
          </label>
          {!currentUi && (
            <button type="button" className="flow-next agentic-submit" onClick={submitFirstAnswer} disabled={isRouting}>
              {isRouting ? "Preparing..." : "Continue"} →
            </button>
          )}

          {currentUi && (
            <>
              <section className="agentic-follow-up">
                <div className="choice-answer-grid" aria-label="Multiple choice answers">
                  {withOtherChoice(currentUi.ui.choices).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      className={selectedChoice === choice ? "selected" : ""}
                      onClick={() => setSelectedChoice(choice)}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
                {selectedChoice === "Other" && (
                  <label className="other-answer">
                    <span>Tell us more</span>
                    <textarea
                      value={otherAnswer}
                      onChange={(event) => setOtherAnswer(event.target.value)}
                      placeholder="Add the detail that best answers this question..."
                      rows={4}
                    />
                  </label>
                )}
                <div className="agentic-actions">
                  <button
                    type="button"
                    className="flow-next"
                    onClick={submitFollowUp}
                    disabled={isRouting || !selectedChoice || (selectedChoice === "Other" && !otherAnswer.trim())}
                  >
                    {isRouting ? "Preparing..." : "Continue"} →
                  </button>
                  <button type="button" className="flow-back" onClick={() => setAssessment(fallbackAssessment(caseGraph, language))}>
                    Finish assessment
                  </button>
                </div>
              </section>
            </>
          )}
        </section>

      </div>

      <footer className="check-flow-actions">
        <button type="button" className="flow-back" onClick={onCancel}>
          ← Back
        </button>
        <button type="button" className="flow-next" onClick={onDashboard}>
          Dashboard →
        </button>
      </footer>
    </section>
  );
}

function withOtherChoice(choices: string[]) {
  return [
    ...choices
      .filter((choice) => !["other", "none / no", "none", "no"].includes(choice.toLowerCase()))
      .slice(0, 4),
    "Other",
    "None / No",
  ];
}

function AssessmentPage({
  assessment,
  onBack,
  onDashboard,
}: {
  assessment: AssessmentResult;
  onBack: () => void;
  onDashboard: () => void;
}) {
  const nextSteps = assessment.nextSteps.length
    ? assessment.nextSteps
    : [
        {
          title: "Book a Specialist",
          description: "Schedule a follow-up if symptoms persist, worsen, or feel unusual for you.",
          cta: "Find Providers",
        },
        {
          title: "Start Medication Log",
          description: "Track medicines, timing, and symptom changes for a clearer clinical conversation.",
          cta: "Open Tracker",
        },
      ];
  const correlations = assessment.correlations.length
    ? assessment.correlations
    : [
        { label: "Reported pattern", match: "Moderate Match" as const, score: assessment.confidence },
        { label: "Symptom timing", match: "Moderate Match" as const, score: Math.max(45, assessment.confidence - 12) },
      ];
  const careInstructions = assessment.careInstructions.length
    ? assessment.careInstructions
    : ["Monitor symptoms and changes.", "Avoid triggers that seem to worsen symptoms.", "Keep notes for a clinician."];
  const urgentCare = assessment.urgentCare.length
    ? assessment.urgentCare
    : ["Symptoms rapidly worsen", "Severe or unusual pain appears", "New confusion, weakness, fainting, or trouble breathing"];

  return (
    <section className="assessment-page" aria-labelledby="assessment-title">
      <header className="assessment-top">
        <strong>Atrium</strong>
        <div>
          <button type="button" aria-label="Profile">◎</button>
          <button type="button" aria-label="Help">?</button>
        </div>
      </header>

      <main className="assessment-layout">
        <section className="assessment-hero">
          <div>
            <span>Primary Assessment</span>
            <h1 id="assessment-title">{assessment.friendlyTitle ?? assessment.condition}</h1>
            <p>{assessment.patientMessage ?? assessment.rationale}</p>
            {assessment.reassurance && <em>{assessment.reassurance}</em>}
          </div>
          <aside>
            <strong>{assessment.confidence}%</strong>
            <span>{assessment.confidenceLabel ?? "Match based on symptoms"}</span>
          </aside>
        </section>

        <section className="assessment-main">
          <div className="assessment-left">
            <section>
              <h2>Recommended Next Steps</h2>
              <div className="assessment-step-grid">
                {nextSteps.slice(0, 2).map((step, index) => (
                  <article key={step.title} className="assessment-card">
                    <div className={index === 0 ? "assessment-icon primary" : "assessment-icon"}>
                      {index === 0 ? "▦" : "+"}
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    <button type="button" className={index === 0 ? "assessment-button primary" : "assessment-button"}>
                      {step.cta}
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="assessment-card care-card">
              <h2>Care Instructions</h2>
              <ul>
                {careInstructions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="assessment-right">
            <section className="assessment-card correlation-card">
              <h2>Symptom Correlation</h2>
              <p>How your reported symptoms align with this assessment.</p>
              {correlations.map((item) => (
                <div key={item.label} className="correlation-row">
                  <div>
                    <span>{item.label}</span>
                    <strong>{item.match}</strong>
                  </div>
                  <i>
                    <b style={{ width: `${item.score}%` }} />
                  </i>
                </div>
              ))}
            </section>

            <section className="urgent-card">
              <h2>When to Seek Urgent Care</h2>
              <p>Go to an emergency room immediately if you experience:</p>
              <ul>
                {urgentCare.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </aside>
        </section>

        <div className="assessment-actions">
          <button type="button" onClick={onBack}>Start another check</button>
          <button type="button" onClick={onDashboard}>Dashboard</button>
        </div>
      </main>

      <footer className="assessment-footer">
        <strong>Atrium</strong>
        <nav>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Accessibility</a>
          <a href="#">Contact Support</a>
        </nav>
        <span>© 2024 Atrium Health Systems. Care guidance for informed next steps.</span>
      </footer>
    </section>
  );
}

function fallbackAssessment(caseGraph: CaseGraph, language: Language): AssessmentResult {
  const symptom = caseGraph.symptoms[0]?.label;
  return {
    condition: language === "en" ? "Primary Assessment" : "Evaluación principal",
    confidence: 68,
    rationale: symptom
      ? `Based on the reported pattern: ${symptom.slice(0, 120)}`
      : "Based on the answers provided in this check.",
    nextSteps: [],
    correlations: [],
    careInstructions: [],
    urgentCare: [],
  };
}

function DashboardView({
  t,
  history,
  currentCase,
  importantSymptoms,
  followUps,
  onNewCheck,
  onOpenRecord,
}: {
  t: Record<string, string>;
  history: CheckRecord[];
  currentCase: CaseGraph;
  importantSymptoms: string[];
  followUps: string[];
  onNewCheck: () => void;
  onOpenRecord: (record: CheckRecord) => void;
}) {
  return (
    <section className="dashboard-view" aria-labelledby="dashboard-view-title">
      <div className="dashboard-view-head">
        <div>
          <p>{t.dashboard}</p>
          <h2 id="dashboard-view-title">{t.checkHistory}</h2>
          <span>{t.dashboardSubtitle}</span>
        </div>
        <button className="primary" onClick={onNewCheck}>
          <PlusCircle size={16} aria-hidden />
          {t.newCheck}
        </button>
      </div>

      <div className="dashboard-view-grid">
        <section className="panel history-panel">
          <div className="panel-heading">
            <h2>{t.checkHistory}</h2>
            <span>{history.length ? `${history.length}` : t.noHistory}</span>
          </div>
          <div className="history-list">
            {history.length ? (
              history.map((record) => (
                <article key={record.id} className="history-card">
                  <div>
                    <h3>{record.title}</h3>
                    <p>{new Date(record.createdAt).toLocaleString()}</p>
                    <span>{record.bodyAreas.join(", ") || t.unknown}</span>
                  </div>
                  <div className={`status-pill level-${record.safetyLevel}`}>{record.safetyLevel}</div>
                  <button onClick={() => onOpenRecord(record)}>{t.openCheck}</button>
                </article>
              ))
            ) : (
              <p className="muted-copy">{t.emptyDashboard}</p>
            )}
          </div>
        </section>

        <aside className="dashboard-side">
          <section className="panel">
            <div className="panel-heading">
              <h2>{t.importantSymptoms}</h2>
              <span>{t.symptoms}</span>
            </div>
            <ul className="compact-list">
              {(importantSymptoms.length ? importantSymptoms : [t.unknown]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>{t.followUps}</h2>
              <span>{t.missingInfo}</span>
            </div>
            <ul className="compact-list">
              {(followUps.length ? followUps : currentCase.missingInfo).slice(0, 8).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}

function applySafety(caseGraph: CaseGraph) {
  return { ...caseGraph, redFlags: detectRedFlags(caseGraph) };
}

function mergeRegion(existing: CaseGraph["bodyRegions"], region: BodyRegion, label: string) {
  if (existing.some((item) => item.region === region)) return existing;
  return [...existing, { region, label }];
}

function BodyModel({
  language,
  highlightedRegion,
  selectedRegions,
  onSelect,
}: {
  language: Language;
  highlightedRegion: BodyRegion;
  selectedRegions: BodyRegion[];
  onSelect: (region: BodyRegion) => void;
}) {
  return (
    <group>
      <mesh position={[0, 1.75, 0]} onClick={() => onSelect("head")}>
        <sphereGeometry args={[0.34, 32, 32]} />
        <meshStandardMaterial color={colorFor("head", highlightedRegion, selectedRegions)} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.82, 0]} scale={[0.72, 0.95, 0.34]} onClick={() => onSelect("chest")}>
        <capsuleGeometry args={[0.52, 0.58, 12, 32]} />
        <meshStandardMaterial color={colorFor("chest", highlightedRegion, selectedRegions)} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.02, 0]} scale={[0.62, 0.72, 0.32]} onClick={() => onSelect("abdomen")}>
        <capsuleGeometry args={[0.5, 0.36, 12, 32]} />
        <meshStandardMaterial color={colorFor("abdomen", highlightedRegion, selectedRegions)} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.52, -0.22]} scale={[0.78, 1.35, 0.08]} onClick={() => onSelect("back")}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={colorFor("back", highlightedRegion, selectedRegions)} roughness={0.55} />
      </mesh>
      <Limb region="leftArm" position={[-0.82, 0.5, 0]} rotation={[0, 0, -0.24]} selectedRegions={selectedRegions} highlightedRegion={highlightedRegion} onSelect={onSelect} />
      <Limb region="rightArm" position={[0.82, 0.5, 0]} rotation={[0, 0, 0.24]} selectedRegions={selectedRegions} highlightedRegion={highlightedRegion} onSelect={onSelect} />
      <Limb region="leftLeg" position={[-0.28, -1.12, 0]} rotation={[0, 0, 0.05]} selectedRegions={selectedRegions} highlightedRegion={highlightedRegion} onSelect={onSelect} />
      <Limb region="rightLeg" position={[0.28, -1.12, 0]} rotation={[0, 0, -0.05]} selectedRegions={selectedRegions} highlightedRegion={highlightedRegion} onSelect={onSelect} />
      {regions.map((region) => (
        <group key={region} position={regionPositions[region]}>
          <mesh>
            <sphereGeometry args={[highlightedRegion === region ? 0.065 : 0.045, 16, 16]} />
            <meshStandardMaterial
              color={highlightedRegion === region ? "#ef4444" : "#0f766e"}
              emissive={highlightedRegion === region ? new THREE.Color("#7f1d1d") : new THREE.Color("#022c22")}
              emissiveIntensity={highlightedRegion === region ? 0.45 : 0.15}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Limb({
  region,
  position,
  rotation,
  selectedRegions,
  highlightedRegion,
  onSelect,
}: {
  region: BodyRegion;
  position: [number, number, number];
  rotation: [number, number, number];
  selectedRegions: BodyRegion[];
  highlightedRegion: BodyRegion;
  onSelect: (region: BodyRegion) => void;
}) {
  return (
    <mesh position={position} rotation={rotation} scale={[0.2, 0.95, 0.2]} onClick={() => onSelect(region)}>
      <capsuleGeometry args={[0.45, 0.9, 10, 24]} />
      <meshStandardMaterial color={colorFor(region, highlightedRegion, selectedRegions)} roughness={0.52} />
    </mesh>
  );
}

function colorFor(region: BodyRegion, highlightedRegion: BodyRegion, selectedRegions: BodyRegion[]) {
  if (region === highlightedRegion) return "#f97316";
  if (selectedRegions.includes(region)) return "#14b8a6";
  return "#dbeafe";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="list-block">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
