/**
 * OpenClaw configuration: plans, models, and business rules
 */

export type PlanId = "starter" | "pro";

export interface PlanConfig {
  id: PlanId;
  name: string;
  monthlyPriceCents: number;
  llmBudgetCents: number;
  stripePriceId: string | null;
  allowedModels: string[];
  features: string[];
}

export interface ModelConfig {
  id: string;
  name: string;
  provider: "zai" | "openai";
  minPlan: PlanId;
  estimatedCostPer1MTokens: number;
  description: string;
}

const PLAN_RANKS: Record<PlanId, number> = {
  starter: 0,
  pro: 1,
};

export const PLANS: Record<PlanId, PlanConfig> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPriceCents: 2900,
    llmBudgetCents: 200,
    stripePriceId: process.env.STRIPE_PRICE_ID_OPENCLAW_STARTER || null,
    allowedModels: ["gpt-4o-mini", "gpt-5-mini", "gpt-4o"],
    features: [
      "$2 LLM usage/month",
      "All models",
      "Telegram bot",
      "Priority support",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPriceCents: 4900,
    llmBudgetCents: 2000,
    stripePriceId: process.env.STRIPE_PRICE_ID_OPENCLAW_PRO || null,
    allowedModels: ["gpt-4o-mini", "gpt-5-mini", "gpt-4o"],
    features: [
      "$20 LLM usage/month",
      "All models",
      "Custom skills",
      "Telegram bot",
      "Priority support",
      "Early access to new features",
    ],
  },
};

export const MODELS: Record<string, ModelConfig> = {
  "zai-glm-4.7": {
    id: "zai-glm-4.7",
    name: "ZAI GLM 4.7",
    provider: "zai",
    minPlan: "starter",
    estimatedCostPer1MTokens: 0,
    description: "Fast and capable",
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    minPlan: "starter",
    estimatedCostPer1MTokens: 0.15,
    description: "Fast and cost-effective",
  },
  "gpt-5-mini": {
    id: "gpt-5-mini",
    name: "GPT-5 Nano",
    provider: "openai",
    minPlan: "starter",
    estimatedCostPer1MTokens: 0.05,
    description: "Ultra-fast",
  },
  "gpt-4o": {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    minPlan: "starter",
    estimatedCostPer1MTokens: 2.5,
    description: "Balanced and versatile",
  },
};

export function getPlanConfig(planId: string): PlanConfig | null {
  return PLANS[planId as PlanId] || null;
}

export function getModelConfig(modelId: string): ModelConfig | null {
  return MODELS[modelId] || null;
}

export function canPlanUseModel(planId: string, modelId: string): boolean {
  const plan = getPlanConfig(planId);
  const model = getModelConfig(modelId);

  if (!plan || !model) {
    return false;
  }

  return PLAN_RANKS[plan.id] >= PLAN_RANKS[model.minPlan];
}

export function getDefaultModel(planId: string): string {
  return "gpt-4o-mini";
}
