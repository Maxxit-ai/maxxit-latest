import { research_institutes, agents } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

export type AgentWithVenue = Pick<agents, "id" | "name" | "venue" | "status">;

export interface InstituteRunContext {
  prisma: PrismaClient;
  intervalMs: number;
}

export interface InstituteRunResult {
  instituteId: string;
  instituteName: string;
  signalsCreated: number;
  processedAssets?: number;
  skipped?: number;
  errors?: number;
  details?: string;
}

export interface InstituteHandler {
  /** Stable ID used in research_institutes */
  instituteId: string;
  /** Human friendly name */
  instituteName: string;

  /**
   * Does this institute have everything it needs? (API keys, modules, etc.)
   */
  isConfigured(): boolean;

  /**
   * Ensure a research_institutes row exists (create if missing).
   */
  ensureInstitute(prisma: PrismaClient): Promise<research_institutes | null>;

  /**
   * Run the institute flow for the provided agents.
   */
  run(input: {
    agents: AgentWithVenue[];
    institute: research_institutes;
    context: InstituteRunContext;
  }): Promise<InstituteRunResult>;
}
