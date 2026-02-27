/**
 * Create OpenAI API Key for User
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import {
  createProject,
  createServiceAccount,
  OpenAIAdminError,
} from "../../../lib/openai-admin";
import { storeUserOpenAIApiKey } from "../../../lib/ssm";

interface CreateOpenAIKeyRequest {
  userWallet: string;
}

interface CreateOpenAIKeyResponse {
  success: boolean;
  projectId?: string;
  keyPrefix?: string;
  createdAt?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateOpenAIKeyResponse>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const { userWallet } = req.body as CreateOpenAIKeyRequest;

    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: userWallet",
      });
    }

    const normalizedWallet = userWallet;
    console.log(normalizedWallet);

    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: normalizedWallet },
    });

    if (!instance) {
      return res.status(404).json({
        success: false,
        error: "No active OpenClaw instance found for this wallet",
      });
    }

    if (instance.openai_project_id) {
      return res.status(409).json({
        success: true,
        projectId: instance.openai_project_id,
        keyPrefix: instance.openai_service_account_id
          ? `sk-svcacct-${instance.openai_service_account_id.substring(0, 8)}...`
          : undefined,
        createdAt:
          instance.openai_api_key_created_at?.toISOString() || undefined,
        error: undefined,
      });
    }

    const sanitizedWallet = normalizedWallet.replace(/[^a-z0-9]/g, "_");
    const projectName = `openclaw-${sanitizedWallet}`;

    try {
      const project = await createProject(projectName);

      const serviceAccount = await createServiceAccount(
        project.id,
        projectName,
      );

      await storeUserOpenAIApiKey(normalizedWallet, serviceAccount.apiKey);

      await prisma.openclaw_instances.update({
        where: { user_wallet: normalizedWallet },
        data: {
          openai_project_id: project.id,
          openai_service_account_id: serviceAccount.id,
          openai_api_key_created_at: new Date(),
        },
      });

      const keyPrefix = serviceAccount.apiKey.substring(0, 15) + "...";

      return res.status(201).json({
        success: true,
        projectId: project.id,
        keyPrefix,
        createdAt: new Date(serviceAccount.createdAt * 1000).toISOString(),
      });
    } catch (apiError) {
      if (apiError instanceof OpenAIAdminError) {
        console.error(
          "[OpenClaw Create OpenAI Key] OpenAI API error:",
          apiError.message,
          apiError.statusCode,
          apiError.responseBody,
        );

        if (
          apiError.statusCode === 409 ||
          apiError.message.includes("already exists")
        ) {
          return res.status(409).json({
            success: false,
            error: "OpenAI project already exists",
          });
        }

        return res.status(500).json({
          success: false,
          error: `OpenAI API error: ${apiError.message}`,
        });
      }

      throw apiError;
    }
  } catch (error: any) {
    console.error("[OpenClaw Create OpenAI Key] Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create OpenAI API key",
    });
  }
}
