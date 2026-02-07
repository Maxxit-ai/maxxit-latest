/**
 * Get detailed OpenClaw EC2 Instance Status
 * Returns status checks and readiness for polling during launch
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { getDetailedInstanceStatus, type DetailedInstanceStatus } from "../../../lib/openclaw-instance-manager";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { userWallet } = req.query;

        if (!userWallet || typeof userWallet !== "string") {
            return res.status(400).json({
                error: "Missing or invalid userWallet query parameter",
            });
        }

        const instance = await prisma.openclaw_instances.findUnique({
            where: { user_wallet: userWallet },
        });

        if (!instance) {
            return res.status(404).json({
                error: "Instance not found",
            });
        }

        if (!instance.container_id) {
            return res.status(200).json({
                success: true,
                instance: {
                    id: instance.id,
                    status: instance.status,
                    containerStatus: instance.container_status,
                    ec2: null,
                },
            });
        }

        const detailedStatus = await getDetailedInstanceStatus(instance.container_id);

        let statusMessage = "";
        let statusPhase: "launching" | "starting" | "checking" | "ready" | "error" = "launching";

        if (detailedStatus.state === "pending") {
            statusMessage = "Launching instance...";
            statusPhase = "launching";
        } else if (detailedStatus.state === "running") {
            if (detailedStatus.systemStatus === "initializing" || detailedStatus.instanceStatus === "initializing") {
                statusMessage = "Running status checks...";
                statusPhase = "checking";
            } else if (detailedStatus.ready) {
                statusMessage = "Instance is ready!";
                statusPhase = "ready";
            } else if (detailedStatus.systemStatus === "impaired" || detailedStatus.instanceStatus === "impaired") {
                statusMessage = "Status check failed";
                statusPhase = "error";
            } else {
                statusMessage = "Starting up...";
                statusPhase = "starting";
            }
        } else if (detailedStatus.state === "error") {
            statusMessage = detailedStatus.error || "An error occurred";
            statusPhase = "error";
        } else {
            statusMessage = `Instance is ${detailedStatus.state}`;
            statusPhase = "error";
        }

        const newContainerStatus = detailedStatus.state === "running" && detailedStatus.ready ? "running" : detailedStatus.state;
        if (instance.container_status !== newContainerStatus) {
            await prisma.openclaw_instances.update({
                where: { user_wallet: userWallet },
                data: {
                    container_status: newContainerStatus,
                    updated_at: new Date(),
                },
            });
        }

        return res.status(200).json({
            success: true,
            instance: {
                id: instance.id,
                status: instance.status,
                containerStatus: newContainerStatus,
                ec2: {
                    instanceId: detailedStatus.instanceId,
                    state: detailedStatus.state,
                    systemStatus: detailedStatus.systemStatus,
                    instanceStatus: detailedStatus.instanceStatus,
                    ready: detailedStatus.ready,
                    publicIp: detailedStatus.publicIp,
                    launchTime: detailedStatus.launchTime,
                },
                statusMessage,
                statusPhase,
            },
        });
    } catch (error: any) {
        console.error("[OpenClaw Instance Status] Error:", error);
        return res.status(500).json({
            error: error.message || "Failed to get instance status",
        });
    }
}
