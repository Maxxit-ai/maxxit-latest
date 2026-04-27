#!/usr/bin/env tsx
export {};
/**
 * List all OpenAI projects and their service accounts
 *
 * Usage:
 *   tsx scripts/list-openai-projects.ts
 *   tsx scripts/list-openai-projects.ts --with-keys   # also list service accounts per project
 */

const OPENAI_ADMIN_API_KEY = process.env.OPENAI_ADMIN_API_KEY;
const OPENAI_ORG_ID = process.env.OPENAI_ORG_ID;
const OPENAI_API_BASE_URL = "https://api.openai.com";

if (!OPENAI_ADMIN_API_KEY) {
  console.error("ERROR: OPENAI_ADMIN_API_KEY environment variable is not set");
  process.exit(1);
}

interface Project {
  id: string;
  name: string;
  created_at: number;
  status: string;
}

interface ServiceAccount {
  id: string;
  name: string;
  created_at: number;
  api_key?: { redacted_value: string };
  role?: string;
}

interface ListResponse<T> {
  object: string;
  data: T[];
  has_more: boolean;
  first_id?: string;
  last_id?: string;
}

async function openAIRequest<T>(endpoint: string): Promise<T> {
  const url = `${OPENAI_API_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${OPENAI_ADMIN_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (OPENAI_ORG_ID) headers["OpenAI-Organization"] = OPENAI_ORG_ID;

  const response = await fetch(url, { headers });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `OpenAI API error ${response.status}: ${response.statusText}\n${body}`
    );
  }

  return JSON.parse(body) as T;
}

async function listAllProjects(): Promise<Project[]> {
  const projects: Project[] = [];
  let after: string | undefined;

  while (true) {
    const params = new URLSearchParams({ limit: "100" });
    if (after) params.set("after", after);

    const page = await openAIRequest<ListResponse<Project>>(
      `/v1/organization/projects?${params}`
    );

    projects.push(...page.data);

    if (!page.has_more) break;
    after = page.last_id;
  }

  return projects;
}

async function listServiceAccounts(projectId: string): Promise<ServiceAccount[]> {
  const accounts: ServiceAccount[] = [];
  let after: string | undefined;

  while (true) {
    const params = new URLSearchParams({ limit: "100" });
    if (after) params.set("after", after);

    const page = await openAIRequest<ListResponse<ServiceAccount>>(
      `/v1/organization/projects/${projectId}/service_accounts?${params}`
    );

    accounts.push(...page.data);

    if (!page.has_more) break;
    after = page.last_id;
  }

  return accounts;
}

function formatDate(unixTs: number): string {
  return new Date(unixTs * 1000).toISOString().replace("T", " ").slice(0, 19);
}

async function main() {
  const withKeys = process.argv.includes("--with-keys");

  console.log("Fetching OpenAI projects...\n");

  const projects = await listAllProjects();

  if (projects.length === 0) {
    console.log("No projects found.");
    return;
  }

  console.log(`Found ${projects.length} project(s):\n`);
  console.log(
    "─".repeat(withKeys ? 80 : 70)
  );

  for (const project of projects) {
    console.log(`ID:      ${project.id}`);
    console.log(`Name:    ${project.name}`);
    console.log(`Status:  ${project.status}`);
    console.log(`Created: ${formatDate(project.created_at)}`);

    if (withKeys) {
      const accounts = await listServiceAccounts(project.id);
      if (accounts.length === 0) {
        console.log("Keys:    (none)");
      } else {
        console.log(`Keys:    ${accounts.length} service account(s)`);
        for (const sa of accounts) {
          console.log(`  - [${sa.id}] ${sa.name}`);
          console.log(`    Key prefix: ${sa.api_key?.redacted_value ?? "(not available)"}`);
          console.log(`    Created:    ${formatDate(sa.created_at)}`);
        }
      }
    }

    console.log("─".repeat(withKeys ? 80 : 70));
  }

  console.log(`\nTotal: ${projects.length} project(s)`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
