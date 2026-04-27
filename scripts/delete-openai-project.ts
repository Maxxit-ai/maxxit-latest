#!/usr/bin/env tsx
export {};
/**
 * Archive an OpenAI project and delete its service accounts
 *
 * OpenAI does not support hard-deleting projects — archiving is the equivalent.
 * Service accounts (API keys) under the project are hard-deleted first.
 *
 * Usage:
 *   tsx scripts/delete-openai-project.ts <project-id>
 *   tsx scripts/delete-openai-project.ts <project-id> --keys-only   # only revoke keys, keep project
 *   tsx scripts/delete-openai-project.ts <project-id> --dry-run      # preview, no changes
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
  data: T[];
  has_more: boolean;
  last_id?: string;
}

async function openAIRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${OPENAI_API_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${OPENAI_ADMIN_API_KEY}`,
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (OPENAI_ORG_ID) headers["OpenAI-Organization"] = OPENAI_ORG_ID;

  const response = await fetch(url, { ...options, headers });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `OpenAI API error ${response.status}: ${response.statusText}\n${body}`
    );
  }

  return body ? (JSON.parse(body) as T) : ({} as T);
}

async function getProject(projectId: string): Promise<Project | null> {
  try {
    return await openAIRequest<Project>(
      `/v1/organization/projects/${projectId}`
    );
  } catch (err: any) {
    if (err.message.includes("404")) return null;
    throw err;
  }
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

async function deleteServiceAccount(
  projectId: string,
  serviceAccountId: string
): Promise<void> {
  await openAIRequest(
    `/v1/organization/projects/${projectId}/service_accounts/${serviceAccountId}`,
    { method: "DELETE" }
  );
}

async function archiveProject(projectId: string): Promise<void> {
  await openAIRequest(`/v1/organization/projects/${projectId}/archive`, {
    method: "POST",
  });
}

function formatDate(unixTs: number): string {
  return new Date(unixTs * 1000).toISOString().replace("T", " ").slice(0, 19);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));

  const projectId = args[0];
  const dryRun = flags.includes("--dry-run");
  const keysOnly = flags.includes("--keys-only");

  if (!projectId) {
    console.error("Usage: tsx scripts/delete-openai-project.ts <project-id> [--keys-only] [--dry-run]");
    process.exit(1);
  }

  if (dryRun) console.log("[DRY RUN] No changes will be made.\n");

  // Fetch project info
  console.log(`Looking up project: ${projectId}`);
  const project = await getProject(projectId);

  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  console.log(`\nProject found:`);
  console.log(`  Name:    ${project.name}`);
  console.log(`  Status:  ${project.status}`);
  console.log(`  Created: ${formatDate(project.created_at)}`);

  if (project.status === "archived") {
    console.log("\nProject is already archived.");
    if (keysOnly) {
      console.log("Checking for remaining service accounts...");
    } else {
      if (!keysOnly) {
        console.log("Nothing to do.");
        return;
      }
    }
  }

  // Fetch and delete service accounts
  console.log("\nFetching service accounts...");
  const accounts = await listServiceAccounts(projectId);

  if (accounts.length === 0) {
    console.log("  No service accounts found.");
  } else {
    console.log(`  Found ${accounts.length} service account(s):`);
    for (const sa of accounts) {
      console.log(`    - [${sa.id}] ${sa.name}${sa.api_key ? `  (key: ${sa.api_key.redacted_value})` : ""}`);
    }

    if (!dryRun) {
      console.log("\nRevoking service accounts...");
      for (const sa of accounts) {
        process.stdout.write(`  Deleting ${sa.id} (${sa.name})... `);
        await deleteServiceAccount(projectId, sa.id);
        console.log("done");
      }
    } else {
      console.log(`\n[DRY RUN] Would revoke ${accounts.length} service account(s).`);
    }
  }

  // Archive project (unless --keys-only)
  if (!keysOnly) {
    if (!dryRun) {
      process.stdout.write(`\nArchiving project ${projectId}... `);
      await archiveProject(projectId);
      console.log("done");
      console.log(`\nProject "${project.name}" has been archived and all keys revoked.`);
    } else {
      console.log(`\n[DRY RUN] Would archive project "${project.name}".`);
    }
  } else {
    console.log(`\nDone. Project "${project.name}" keys revoked (project kept).`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
