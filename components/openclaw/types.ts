import { getOstiumConfig } from "../../lib/ostium-config";
import { getAvantisConfig } from "../../lib/avantis-config";

const {
  tradingContract: OSTIUM_TRADING_CONTRACT,
  usdcContract: USDC_TOKEN,
  storageContract: OSTIUM_STORAGE,
} = getOstiumConfig();

const avantisConfig = getAvantisConfig();
const AVANTIS_TRADING_CONTRACT = avantisConfig.tradingContract;
const AVANTIS_STORAGE = avantisConfig.tradingStorageContract;
const AVANTIS_USDC_TOKEN = avantisConfig.usdcContract;
const BASE_CHAIN_ID = avantisConfig.chainId;
const BASE_CHAIN_NAME = avantisConfig.chainName;
const BASE_EXPLORER_URL = avantisConfig.blockExplorerUrl;

export {
  OSTIUM_TRADING_CONTRACT, USDC_TOKEN, OSTIUM_STORAGE,
  AVANTIS_TRADING_CONTRACT, AVANTIS_STORAGE, AVANTIS_USDC_TOKEN,
  BASE_CHAIN_ID, BASE_CHAIN_NAME, BASE_EXPLORER_URL,
};

export const OSTIUM_TRADING_ABI = [
  "function setDelegate(address delegate) external",
];
export const AVANTIS_TRADING_ABI = [
  "function setDelegate(address delegate) external",
];
export const USDC_ABI = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

export type SkillSubStep =
  | "idle"
  | "creating-agent"
  | "agent-created"
  | "delegating"
  | "approving"
  | "creating-deployment"
  | "complete";

export type PlanId = "starter" | "pro";

export type WebSearchProvider = "brave" | "perplexity" | "openrouter";

export type PlanOption = {
  id: PlanId;
  name: string;
  priceLabel: string;
  budgetLabel: string;
  modelsLabel: string;
};

export type ModelOption = {
  id: string;
  name: string;
  minPlan: PlanId;
  costLabel: string;
  speedLabel: string;
};

export type InstanceData = {
  id: string;
  plan: string;
  model: string;
  status: string;
  telegramLinked: boolean;
  telegramVerified: boolean;
  telegramUsername?: string | null;
  openaiProjectId?: string | null;
  openaiServiceAccountId?: string | null;
  openaiApiKeyCreatedAt?: string | null;
  webSearchProvider?: WebSearchProvider | null;
};

export type EigenVerificationRecord = {
  id: string;
  user_address: string | null;
  agent_address: string | null;
  market: string | null;
  side: string | null;
  deployment_id: string | null;
  signal_id: string | null;
  llm_full_prompt: string | null;
  llm_raw_output: string | null;
  llm_reasoning: string | null;
  llm_signature: string | null;
  llm_model_used: string | null;
  llm_chain_id: number | null;
  created_at: string;
};

export const STEPS = [
  { key: "plan", label: "Plan" },
  { key: "telegram", label: "Channel" },
  { key: "trading", label: "Trading" },
  { key: "activate", label: "Launch" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export const PLAN_OPTIONS: PlanOption[] = [
  {
    id: "starter",
    name: "Starter",
    priceLabel: "$29/mo",
    budgetLabel: "$2 LLM usage",
    modelsLabel: "All models",
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "$49/mo",
    budgetLabel: "$20 LLM usage",
    modelsLabel: "All models + custom skills",
  },
];

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "gpt-5.1-codex-mini",
    name: "GPT-5.1 Codex Mini",
    minPlan: "starter",
    costLabel: "$0.25 in / $2.00 out per 1M tokens",
    speedLabel: "Optimized for coding",
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    minPlan: "starter",
    costLabel: "$0.05 in / $0.40 out per 1M tokens",
    speedLabel: "Ultra-fast",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    minPlan: "starter",
    costLabel: "~$2.50/1M tokens",
    speedLabel: "Balanced",
  },
];

export const WEB_SEARCH_OPTIONS: {
  id: WebSearchProvider;
  name: string;
  description: string;
  costLabel: string;
}[] = [
  {
    id: "brave",
    name: "Brave Search",
    description: "Fast, privacy-focused web search via Brave API.",
    costLabel: "$5 / 1K searches (approx.)",
  },
  {
    id: "perplexity",
    name: "Perplexity Sonar Pro",
    description: "AI answers with citations using Perplexity Sonar Pro.",
    costLabel: "~$10 / 1K searches (approx.)",
  },
  {
    id: "openrouter",
    name: "OpenRouter + Perplexity",
    description: "Perplexity via OpenRouter with flexible billing options.",
    costLabel: "~$10 / 1K searches (approx.)",
  },
];

export const PLAN_RANKS: Record<PlanId, number> = { starter: 0, pro: 1 };

export async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as T;
  if (!response.ok) {
    const error = (data as { error?: string })?.error;
    throw new Error(error || "Request failed");
  }
  return data;
}
