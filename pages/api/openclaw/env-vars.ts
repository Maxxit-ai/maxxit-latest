/**
 * Environment Variables API
 * GET: Fetch all custom env vars for a user
 * POST: Add a new env var and apply it to the running instance
 * DELETE: Remove a custom env var
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { storeUserEnvVar, getUserEnvVars, deleteUserEnvVar } from "../../../lib/ssm";
import { runCommandOnInstance, getInstanceById } from "../../../lib/openclaw-instance-manager";

// Reserved env var names that users cannot set
const RESERVED_KEYS = new Set([
    "BOT_TOKEN",
    "OPENAI_KEY",
    "OPENAI_API_KEY",
    "ZAI_KEY",
    "ZAI_API_KEY",
    "MAXXIT_API_KEY",
    "MAXXIT_API_URL",
    "NVM_DIR",
    "HOME",
    "PATH",
    "USER",
]);

// Only allow alphanumeric + underscores, starting with a letter or underscore
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method === "GET") {
        return handleGet(req, res);
    } else if (req.method === "POST") {
        return handlePost(req, res);
    } else if (req.method === "DELETE") {
        return handleDelete(req, res);
    }
    return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
    try {
        const { userWallet } = req.query;
        if (!userWallet || typeof userWallet !== "string") {
            return res.status(400).json({ error: "Missing userWallet" });
        }

        const envVars = await getUserEnvVars(userWallet);
        return res.status(200).json({ envVars });
    } catch (error) {
        console.error("[Env Vars] Error fetching env vars:", error);
        return res.status(500).json({
            error: "Failed to fetch environment variables",
        });
    }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
    try {
        const { userWallet, key, value } = req.body;

        if (!userWallet || !key || value === undefined || value === null) {
            return res.status(400).json({
                error: "Missing required fields: userWallet, key, value",
            });
        }

        // Validate key format
        if (!KEY_PATTERN.test(key)) {
            return res.status(400).json({
                error: "Invalid key format. Use only letters, numbers, and underscores. Must start with a letter or underscore.",
            });
        }

        // Check reserved names
        if (RESERVED_KEYS.has(key.toUpperCase())) {
            return res.status(400).json({
                error: `"${key}" is a reserved environment variable name and cannot be set.`,
            });
        }

        // Store in SSM
        await storeUserEnvVar(userWallet, key, value);

        // Look up instance to apply env var in real-time
        const instance = await prisma.openclaw_instances.findUnique({
            where: { user_wallet: userWallet },
            select: { container_id: true, status: true },
        });

        let appliedToInstance = false;

        if (instance?.container_id && instance.status === "active") {
            // Check if instance is actually running
            const instanceStatus = await getInstanceById(instance.container_id);

            if (instanceStatus.status === "running") {
                try {
                    // Escape value for shell safety
                    const escapedValue = value.replace(/'/g, "'\\''");

                    await runCommandOnInstance(instance.container_id, [
                        `# Add env var ${key} to OpenClaw .env`,
                        `OPENCLAW_ENV="/home/ubuntu/.openclaw/.env"`,
                        // Remove existing entry for this key if present (avoid duplicates)
                        `sed -i '/^${key}=/d' $OPENCLAW_ENV 2>/dev/null || true`,
                        // Append new value
                        `echo '${key}=${escapedValue}' >> $OPENCLAW_ENV`,
                        `chown ubuntu:ubuntu $OPENCLAW_ENV`,
                        // Restart gateway to pick up changes
                        `su - ubuntu -c "source /home/ubuntu/.nvm/nvm.sh && openclaw gateway restart"`,
                    ]);

                    appliedToInstance = true;
                } catch (error) {
                    console.error("[Env Vars] Failed to apply env var to instance:", error);
                    return res.status(500).json({
                        error: `Environment variable "${key}" was saved, but failed to apply to instance: ${error instanceof Error ? error.message : String(error)}`,
                        savedToSSM: true,
                    });
                }
            }
        }

        return res.status(200).json({
            success: true,
            appliedToInstance,
            message: appliedToInstance
                ? `Environment variable "${key}" added and applied to your running instance.`
                : `Environment variable "${key}" saved. It will be available when your instance starts.`,
        });
    } catch (error) {
        console.error("[Env Vars] Error adding env var:", error);
        return res.status(500).json({
            error: "Failed to add environment variable",
        });
    }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
    try {
        const { userWallet, key } = req.body;

        if (!userWallet || !key) {
            return res.status(400).json({
                error: "Missing required fields: userWallet, key",
            });
        }

        // Delete from SSM
        await deleteUserEnvVar(userWallet, key);

        // Also remove from running instance if active
        const instance = await prisma.openclaw_instances.findUnique({
            where: { user_wallet: userWallet },
            select: { container_id: true, status: true },
        });

        let appliedToInstance = false;

        if (instance?.container_id && instance.status === "active") {
            const instanceStatus = await getInstanceById(instance.container_id);

            if (instanceStatus.status === "running") {
                try {
                    await runCommandOnInstance(instance.container_id, [
                        `# Remove env var ${key} from OpenClaw .env`,
                        `OPENCLAW_ENV="/home/ubuntu/.openclaw/.env"`,
                        `sed -i '/^${key}=/d' $OPENCLAW_ENV 2>/dev/null || true`,
                        `chown ubuntu:ubuntu $OPENCLAW_ENV`,
                        // Restart gateway to pick up changes
                        `su - ubuntu -c "source /home/ubuntu/.nvm/nvm.sh && openclaw gateway restart"`,
                    ]);
                    appliedToInstance = true;
                } catch (error) {
                    console.error("[Env Vars] Failed to remove env var from instance:", error);
                    return res.status(500).json({
                        error: `Environment variable "${key}" was removed from storage, but failed to remove from instance: ${error instanceof Error ? error.message : String(error)}`,
                        deletedFromSSM: true,
                    });
                }
            }
        }

        return res.status(200).json({
            success: true,
            appliedToInstance,
            message: `Environment variable "${key}" removed.`,
        });
    } catch (error) {
        console.error("[Env Vars] Error deleting env var:", error);
        return res.status(500).json({
            error: "Failed to delete environment variable",
        });
    }
}
