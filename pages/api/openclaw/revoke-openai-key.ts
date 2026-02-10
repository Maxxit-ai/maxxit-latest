/**
 * Revoke OpenAI API Key for User
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import {
  deleteServiceAccount,
  OpenAIAdminError,
} from "../../../lib/openai-admin";
import { deleteUserOpenAIApiKey } from "../../../lib/ssm";

interface RevokeOpenAIKeyRequest {
  userWallet: string;
}

interface RevokeOpenAIKeyResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RevokeOpenAIKeyResponse>
) {
  if (req.method !== "DELETE") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const { userWallet } = req.body as RevokeOpenAIKeyRequest;

    if (!userWallet) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: userWallet",
      });
    }

    const normalizedWallet = userWallet.toLowerCase().trim();

    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: normalizedWallet },
    });

    if (!instance) {
      console.warn(
        "[OpenClaw Revoke OpenAI Key] Instance not found for wallet:",
        normalizedWallet
      );
      return res.status(404).json({
        success: false,
        error: "No OpenClaw instance found for this wallet",
      });
    }

    if (!instance.openai_project_id || !instance.openai_service_account_id) {
      console.log(
        "[OpenClaw Revoke OpenAI Key] No OpenAI project/service account found for wallet:",
        normalizedWallet,
        "- Nothing to revoke"
      );
      return res.status(200).json({
        success: true,
        message: "No OpenAI API key to revoke",
      });
    }

    console.log(
      "[OpenClaw Revoke OpenAI Key] Revoking OpenAI API key for wallet:",
      normalizedWallet,
      "Project ID:",
      instance.openai_project_id,
      "Service Account ID:",
      instance.openai_service_account_id
    );

    try {
      await deleteServiceAccount(
        instance.openai_project_id,
        instance.openai_service_account_id
      );
      console.log(
        "[OpenClaw Revoke OpenAI Key] Successfully deleted service account from OpenAI"
      );
    } catch (openAIError) {
      if (openAIError instanceof OpenAIAdminError) {
        if (openAIError.statusCode === 404) {
          console.log(
            "[OpenClaw Revoke OpenAI Key] Service account not found in OpenAI (may already be deleted):",
            openAIError.message
          );
        } else {
          console.error(
            "[OpenClaw Revoke OpenAI Key] OpenAI API error during deletion:",
            openAIError.message,
            openAIError.statusCode,
            openAIError.responseBody
          );
        }
      } else {
        console.error(
          "[OpenClaw Revoke OpenAI Key] Unexpected error during service account deletion:",
          openAIError
        );
      }
    }

    try {
      await deleteUserOpenAIApiKey(normalizedWallet);
      console.log(
        "[OpenClaw Revoke OpenAI Key] Successfully deleted API key from SSM"
      );
    } catch (ssmError) {
      console.error(
        "[OpenClaw Revoke OpenAI Key] SSM deletion failed:",
        ssmError
      );
    }

    await prisma.openclaw_instances.update({
      where: { user_wallet: normalizedWallet },
      data: {
        openai_project_id: null,
        openai_service_account_id: null,
        openai_api_key_created_at: null,
      },
    });

    console.log(
      "[OpenClaw Revoke OpenAI Key] Successfully cleared OpenAI fields from database"
    );

    return res.status(200).json({
      success: true,
      message: "OpenAI API key revoked successfully",
    });
  } catch (error: any) {
    console.error("[OpenClaw Revoke OpenAI Key] Unexpected error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to revoke OpenAI API key",
    });
  }
}
