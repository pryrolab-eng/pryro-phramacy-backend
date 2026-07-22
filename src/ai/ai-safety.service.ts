import { Injectable } from "@nestjs/common";
import { AiService } from "./ai.service";

export type SafetySeverity = "safe" | "caution" | "danger";

export type SafetyRuleMatch = {
  type: "interaction" | "warning" | "quantity";
  severity: SafetySeverity;
  source: string;
  message: string;
};

export type DrugSafetyResult = {
  interactions: string[];
  warnings: string[];
  severity: SafetySeverity;
  recommendations: string[];
  source: { id: string; name: string; clinicalDataset: boolean };
  ruleMatches: SafetyRuleMatch[];
  aiPowered: boolean;
  reasoning?: string;
};

export type SafetyItem = { name: string; quantity: number };

const DRUG_SAFETY_SOURCE = {
  id: "pryrox_clinical_rules_v1",
  name: "Pryrox Clinical Rules v1",
  clinicalDataset: false,
};

const DRUG_INTERACTION_RULES: Array<{
  drugs: string[];
  severity: SafetySeverity;
  source: string;
  message: string;
}> = [
  { drugs: ["warfarin", "aspirin"], severity: "danger", source: DRUG_SAFETY_SOURCE.id, message: "Increased bleeding risk" },
  { drugs: ["warfarin", "ibuprofen"], severity: "danger", source: DRUG_SAFETY_SOURCE.id, message: "Increased bleeding risk" },
  { drugs: ["metformin", "alcohol"], severity: "caution", source: DRUG_SAFETY_SOURCE.id, message: "Risk of lactic acidosis" },
  { drugs: ["ssri", "tramadol"], severity: "danger", source: DRUG_SAFETY_SOURCE.id, message: "Serotonin syndrome risk" },
];

const DRUG_WARNING_RULES: Array<{
  drug: string;
  severity: SafetySeverity;
  source: string;
  message: string;
}> = [
  { drug: "warfarin", severity: "caution", source: DRUG_SAFETY_SOURCE.id, message: "Requires regular INR monitoring" },
  { drug: "metformin", severity: "caution", source: DRUG_SAFETY_SOURCE.id, message: "Monitor kidney function" },
  { drug: "digoxin", severity: "danger", source: DRUG_SAFETY_SOURCE.id, message: "Narrow therapeutic index — monitor closely" },
];

function normalizeDrugName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function maxSeverity(a: SafetySeverity, b: SafetySeverity): SafetySeverity {
  if (a === "danger" || b === "danger") return "danger";
  if (a === "caution" || b === "caution") return "caution";
  return "safe";
}

@Injectable()
export class AiSafetyService {
  constructor(private readonly ai: AiService) {}

  buildLocalResult(items: SafetyItem[]): DrugSafetyResult {
    const interactions: string[] = [];
    const warnings: string[] = [];
    const ruleMatches: SafetyRuleMatch[] = [];
    let severity: SafetySeverity = "safe";

    const normalized = items.map((item) => ({
      item,
      displayName: item.name.trim() || "Unknown item",
      drug: normalizeDrugName(item.name),
    }));

    for (let i = 0; i < normalized.length; i++) {
      const first = normalized[i]!;
      for (let j = i + 1; j < normalized.length; j++) {
        const second = normalized[j]!;
        const rule = DRUG_INTERACTION_RULES.find(
          (r) => r.drugs.includes(first.drug) && r.drugs.includes(second.drug),
        );
        if (rule) {
          const message = `${first.displayName} may interact with ${second.displayName}: ${rule.message}`;
          interactions.push(message);
          ruleMatches.push({ type: "interaction", severity: rule.severity, source: rule.source, message });
          severity = maxSeverity(severity, rule.severity);
        }
      }

      const warning = DRUG_WARNING_RULES.find((r) => r.drug === first.drug);
      if (warning) {
        const message = `${first.displayName}: ${warning.message}`;
        warnings.push(message);
        ruleMatches.push({ type: "warning", severity: warning.severity, source: warning.source, message });
        severity = maxSeverity(severity, warning.severity);
      }

      if ((first.item.quantity ?? 0) > 10) {
        const message = `High quantity of ${first.displayName} (${first.item.quantity} units)`;
        warnings.push(message);
        ruleMatches.push({ type: "quantity", severity: "caution", source: DRUG_SAFETY_SOURCE.id, message });
        severity = maxSeverity(severity, "caution");
      }
    }

    return {
      interactions,
      warnings: warnings.length > 0 ? warnings : ["No specific warnings"],
      severity,
      recommendations: [
        interactions.length === 0
          ? "No known local-rule interactions detected"
          : "Consult a pharmacist about detected interactions",
        "Verify patient allergies before dispensing",
        "Confirm dosage with prescription",
      ],
      source: DRUG_SAFETY_SOURCE,
      ruleMatches,
      aiPowered: false,
    };
  }

  async analyzeDrugSafety(items: SafetyItem[], tenantId?: string | null): Promise<DrugSafetyResult> {
    const client = this.ai.getClient();
    if (!client) return this.buildLocalResult(items);

    const traceId = this.ai.createTraceId();
    const resolvedTenantId = tenantId ?? null;

    try {
      const itemList = items.map((i) => `${i.name} (qty: ${i.quantity})`).join(", ");
      const completion = await client.chat.completions.create({
        model: this.ai.model,
        messages: [
          {
            role: "system",
            content: `You are a clinical drug safety system. Analyze cart items for interactions and warnings.
Return ONLY valid JSON: {"analysis":{"interactions":[{"drug_a":"name","drug_b":"name","severity":"caution|danger","message":"text"}],"warnings":[{"drug":"name","severity":"caution|danger","message":"text"}],"recommendations":["text"],"overall_severity":"safe|caution|danger"},"reasoning":"brief text"}`,
          },
          { role: "user", content: `Analyze for drug safety: [${itemList}]` },
        ],
        ...this.ai.defaults,
        stream: false,
      });

      const usage = this.ai.extractTokenUsage(completion);
      const content = completion.choices[0]?.message?.content ?? "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");

      const parsed = JSON.parse(jsonMatch[0]) as { analysis?: any; reasoning?: string };
      const analysis = parsed.analysis;
      if (!analysis) throw new Error("No analysis field");

      const result = this.buildLocalResult(items);
      const severity = (analysis.overall_severity ?? "safe") as SafetySeverity;

      this.ai.recordTrace({ traceId, tenantId: resolvedTenantId, feature: "drug_safety", inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, latencyMs: 0, success: true, fallback: false });
      return { ...result, severity, aiPowered: true, reasoning: parsed.reasoning };
    } catch {
      this.ai.recordTrace({ traceId, tenantId: resolvedTenantId, feature: "drug_safety", inputTokens: 0, outputTokens: 0, latencyMs: 0, success: false, fallback: true });
      return this.buildLocalResult(items);
    }
  }
}
