/**
 * OpenAI Admin API Client
 *
 * Provides methods to interact with OpenAI's Admin API for project management,
 * service account management, and usage tracking.
 *
 * @see https://platform.openai.com/docs/api-reference/projects
 * @see https://platform.openai.com/docs/api-reference/project-service-accounts
 * @see https://platform.openai.com/docs/api-reference/usage
 */

// =============================================================================
// Types
// =============================================================================

/**
 * OpenAI Project response from API
 */
interface OpenAIProject {
  id: string;
  name: string;
  created_at: number;
  organization_id: string;
}

/**
 * Create project request
 */
interface CreateProjectRequest {
  name: string;
}

/**
 * Create project response
 */
interface CreateProjectResponse {
  id: string;
  name: string;
  created_at: number;
  organization_id: string;
}

/**
 * Service account response from API
 */
interface OpenAIServiceAccount {
  id: string;
  name: string;
  created_at: number;
  project_id: string;
  api_key: {
    redacted_value: string;
    value?: string;
  };
}

/**
 * Create service account request
 */
interface CreateServiceAccountRequest {
  name: string;
}

/**
 * Create service account response
 */
interface CreateServiceAccountResponse {
  id: string;
  name: string;
  created_at: number;
  project_id: string;
  api_key: {
    value: string;
    redacted_value: string;
  };
}

/**
 * Usage query parameters
 */
interface UsageParams {
  date: string;
  projectIds?: string[];
  granularity?: 'minute' | 'hour' | 'day';
  groupBy?: ('project_id' | 'model' | 'api_key_id')[];
}

/**
 * Usage data response from OpenAI Usage API
 */
interface UsageData {
  data: UsageDataPoint[];
}

/**
 * Single usage data point
 */
interface UsageDataPoint {
  project_id?: string;
  model?: string;
  api_key_id?: string;
  timestamp?: number;
  n_requests: number;
  n_input_tokens: number;
  n_output_tokens: number;
  n_completion_tokens?: number;
}

/**
 * Costs query parameters
 */
interface CostsParams {
  startTime: number;
  endTime: number;
  projectIds?: string[];
}

/**
 * Cost data response from OpenAI Costs API
 */
interface CostsData {
  data: CostDataPoint[];
  object: string;
  has_more?: boolean;
  next_page?: string | null;
}

/**
 * Single cost data bucket (time-bucketed)
 */
interface CostDataPoint {
  object: string;
  start_time: number;
  end_time: number;
  results: CostResult[];
}

/**
 * Single cost result within a bucket
 */
interface CostResult {
  object: string;
  amount: {
    value: number;
    currency: string;
  };
  line_item: string | null;
  project_id: string | null;
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Custom error class for OpenAI Admin API errors
 */
export class OpenAIAdminError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = 'OpenAIAdminError';
  }
}

// =============================================================================
// Configuration
// =============================================================================

const OPENAI_ADMIN_API_KEY = process.env.OPENAI_ADMIN_API_KEY;
const OPENAI_ORG_ID = process.env.OPENAI_ORG_ID;
const OPENAI_API_BASE_URL = 'https://api.openai.com';

if (!OPENAI_ADMIN_API_KEY) {
  console.warn('WARNING: OPENAI_ADMIN_API_KEY environment variable is not set');
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Makes an authenticated request to the OpenAI Admin API
 */
async function openAIRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!OPENAI_ADMIN_API_KEY) {
    throw new OpenAIAdminError(
      'OPENAI_ADMIN_API_KEY environment variable is not set'
    );
  }

  const url = `${OPENAI_API_BASE_URL}${endpoint}`;
  const headers: HeadersInit = {
    'Authorization': `Bearer ${OPENAI_ADMIN_API_KEY}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (OPENAI_ORG_ID) {
    (headers as Record<string, string>)['OpenAI-Organization'] = OPENAI_ORG_ID;
  }

  console.log(`[OpenAI Admin API] Request: ${options.method || 'GET'} ${url}`);
  if (endpoint.includes('costs') || endpoint.includes('usage')) {
    console.log(`[OpenAI Admin API] Query params: ${endpoint.split('?')[1] || 'none'}`);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new OpenAIAdminError(
        `OpenAI Admin API request failed: ${response.statusText}`,
        response.status,
        responseText
      );
    }

    return responseText ? JSON.parse(responseText) : ({} as T);
  } catch (error) {
    if (error instanceof OpenAIAdminError) {
      throw error;
    }
    throw new OpenAIAdminError(
      `Failed to make request to OpenAI Admin API: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Creates a new OpenAI project
 */
export async function createProject(
  name: string
): Promise<{ id: string; name: string; createdAt: number }> {
  const requestBody: CreateProjectRequest = { name };

  const response = await openAIRequest<CreateProjectResponse>(
    '/v1/organization/projects',
    {
      method: 'POST',
      body: JSON.stringify(requestBody),
    }
  );

  return {
    id: response.id,
    name: response.name,
    createdAt: response.created_at,
  };
}

/**
 * Gets details of a specific OpenAI project
 */
export async function getProject(
  projectId: string
): Promise<OpenAIProject | null> {
  try {
    const response = await openAIRequest<OpenAIProject>(
      `/v1/organization/projects/${projectId}`
    );
    return response;
  } catch (error) {
    if (error instanceof OpenAIAdminError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Creates a service account with an API key for a project
 */
export async function createServiceAccount(
  projectId: string,
  name: string
): Promise<{ id: string; name: string; apiKey: string; createdAt: number }> {
  const requestBody: CreateServiceAccountRequest = { name };

  const response = await openAIRequest<CreateServiceAccountResponse>(
    `/v1/organization/projects/${projectId}/service_accounts`,
    {
      method: 'POST',
      body: JSON.stringify(requestBody),
    }
  );

  return {
    id: response.id,
    name: response.name,
    apiKey: response.api_key.value, // Full key, only available on creation
    createdAt: response.created_at,
  };
}

/**
 * Deletes (revokes) a service account
 */
export async function deleteServiceAccount(
  projectId: string,
  serviceAccountId: string
): Promise<void> {
  await openAIRequest(
    `/v1/organization/projects/${projectId}/service_accounts/${serviceAccountId}`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * Fetches usage data from OpenAI Usage API
 */
export async function getUsage(params: UsageParams): Promise<UsageData> {
  const searchParams = new URLSearchParams();

  // Required: date
  searchParams.append('date', params.date);

  // Optional: project_ids (comma-separated)
  if (params.projectIds && params.projectIds.length > 0) {
    searchParams.append('project_ids', params.projectIds.join(','));
  }

  // Optional: granularity
  if (params.granularity) {
    searchParams.append('granularity', params.granularity);
  }

  // Optional: group_by (comma-separated)
  if (params.groupBy && params.groupBy.length > 0) {
    searchParams.append('group_by', params.groupBy.join(','));
  }

  const queryString = searchParams.toString();
  const endpoint = `/v1/organization/usage${queryString ? `?${queryString}` : ''}`;

  return openAIRequest<UsageData>(endpoint);
}

/**
 * Fetches cost data from OpenAI Costs API
 */
export async function getCosts(params: CostsParams): Promise<CostsData> {
  const searchParams = new URLSearchParams();

  // Required: start_time and end_time
  searchParams.append('start_time', params.startTime.toString());
  searchParams.append('end_time', params.endTime.toString());

  // Optional: project_ids (comma-separated)
  if (params.projectIds && params.projectIds.length > 0) {
    searchParams.append('project_ids', params.projectIds.join(','));
  }

  const queryString = searchParams.toString();
  const endpoint = `/v1/organization/costs${queryString ? `?${queryString}` : ''}`;

  return openAIRequest<CostsData>(endpoint);
}

// =============================================================================
// Convenience Functions
// =============================================================================>

/**
 * Gets usage data for a single project on a specific date
 */
export async function getProjectUsageByModel(
  projectId: string,
  date: string
): Promise<UsageData> {
  return getUsage({
    date,
    projectIds: [projectId],
    groupBy: ['model'],
  });
}

/**
 * Gets cost data for a single project for a date range
 */
export async function getProjectCosts(
  projectId: string,
  startTime: number,
  endTime: number
): Promise<CostsData> {
  return getCosts({
    startTime,
    endTime,
    projectIds: [projectId],
  });
}

/**
 * Creates a project and service account in one operation
 */
export async function createProjectWithServiceAccount(
  projectName: string,
  serviceAccountName: string
): Promise<{
  project: { id: string; name: string; createdAt: number };
  serviceAccount: { id: string; name: string; apiKey: string; createdAt: number };
}> {
  const project = await createProject(projectName);
  const serviceAccount = await createServiceAccount(project.id, serviceAccountName);

  return {
    project,
    serviceAccount,
  };
}

export type {
  OpenAIProject,
  CreateProjectRequest,
  CreateProjectResponse,
  OpenAIServiceAccount,
  CreateServiceAccountRequest,
  CreateServiceAccountResponse,
  UsageParams,
  UsageData,
  UsageDataPoint,
  CostsParams,
  CostsData,
  CostDataPoint,
  CostResult,
};
