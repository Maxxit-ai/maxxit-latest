import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import fs from "fs/promises";
import { prisma } from "../../../lib/prisma";
import {
  runCommandOnInstanceWithOutput,
  getInstanceById,
} from "../../../lib/openclaw-instance-manager";

type VersionInfo = {
  installed: string | null;
  latest: string | null;
  updateAvailable: boolean;
};

type VersionsResponse = {
  success: boolean;
  openclaw: VersionInfo;
  skill: VersionInfo;
  warnings?: string[];
};

async function getLatestOpenclawVersion(): Promise<string | null> {
  try {
    const res = await fetch("https://registry.npmjs.org/openclaw");
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const latest = data?.["dist-tags"]?.latest;
    return typeof latest === "string" ? latest : null;
  } catch {
    return null;
  }
}

async function getLatestSkillVersion(): Promise<string | null> {
  try {
    const skillPath = path.join(
      process.cwd(),
      "skills",
      "maxxit-lazy-trading",
      "SKILL.md"
    );
    const content = await fs.readFile(skillPath, "utf8");

    // Look for `version: x.y.z` in the frontmatter section
    const match = content.match(/^version:\s*([^\s]+)\s*$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function getInstalledVersions(
  instanceId: string
): Promise<{ openclaw: string | null; skill: string | null }> {
  try {
    const { stdout } = await runCommandOnInstanceWithOutput(
      instanceId,
      [
        'OPENCLAW_VERSION=$(su - ubuntu -c "openclaw --version" 2>/dev/null || echo "unknown")',
        'SKILL_VERSION=$(node -e "try{var d=require(\'/home/ubuntu/.openclaw/workspace/.clawhub/lock.json\');console.log(d.skills[\'maxxit-lazy-trading\'].version)}catch(e){console.log(\'unknown\')}" 2>/dev/null || echo "unknown")',
        'echo "OPENCLAW_VERSION=$OPENCLAW_VERSION"',
        'echo "SKILL_VERSION=$SKILL_VERSION"',
      ],
      { timeoutSeconds: 60, pollIntervalMs: 2000 }
    );

    let openclaw: string | null = null;
    let skill: string | null = null;

    stdout
      .split("\n")
      .map((line) => line.trim())
      .forEach((line) => {
        if (line.startsWith("OPENCLAW_VERSION=")) {
          const v = line.replace("OPENCLAW_VERSION=", "").trim();
          openclaw = v && v !== "unknown" ? v : null;
        } else if (line.startsWith("SKILL_VERSION=")) {
          const v = line.replace("SKILL_VERSION=", "").trim();
          skill = v && v !== "unknown" ? v : null;
        }
      });

    return { openclaw, skill };
  } catch {
    return { openclaw: null, skill: null };
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VersionsResponse | { error: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userWallet } = req.query;

    if (!userWallet || typeof userWallet !== "string") {
      return res.status(400).json({ error: "Missing or invalid userWallet" });
    }

    const [latestOpenclaw, latestSkill] = await Promise.all([
      getLatestOpenclawVersion(),
      getLatestSkillVersion(),
    ]);

    const instance = await prisma.openclaw_instances.findUnique({
      where: { user_wallet: userWallet },
    });

    let installedOpenclaw: string | null = null;
    let installedSkill: string | null = null;
    const warnings: string[] = [];

    if (!instance) {
      warnings.push("Instance not found for this wallet");
    } else if (!instance.container_id) {
      warnings.push("Instance does not have an EC2 container_id yet");
    } else {
      const status = await getInstanceById(instance.container_id);
      if (status.status !== "running") {
        warnings.push(
          `Instance is not running (status: ${status.status}). Version checks will be limited.`
        );
      } else {
        const installed = await getInstalledVersions(instance.container_id);
        installedOpenclaw = installed.openclaw;
        installedSkill = installed.skill;
      }
    }

    const openclawInfo: VersionInfo = {
      installed: installedOpenclaw,
      latest: latestOpenclaw,
      updateAvailable:
        !!installedOpenclaw &&
        !!latestOpenclaw &&
        installedOpenclaw !== latestOpenclaw,
    };

    const skillInfo: VersionInfo = {
      installed: installedSkill,
      latest: latestSkill,
      updateAvailable:
        !!installedSkill &&
        !!latestSkill &&
        installedSkill !== latestSkill,
    };

    return res.status(200).json({
      success: true,
      openclaw: openclawInfo,
      skill: skillInfo,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (error: any) {
    console.error("[OpenClaw Versions] Error:", error);
    return res.status(500).json({
      error: error?.message || "Failed to get OpenClaw versions",
    });
  }
}

