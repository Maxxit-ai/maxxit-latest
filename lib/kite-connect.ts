/**
 * Kite Connect Helper
 *
 * Stateless helpers for creating authenticated KiteConnect instances.
 * Reads credentials from request headers (agent calls) or SSM (auth flows).
 */

import type { NextApiRequest } from "next";
import { KiteConnect, type Connect } from "kiteconnect";

export const KITE_AUTH_COOKIE_NAME = "zerodha_user_wallet";
export const KITE_SESSION_EXPIRED_MESSAGE =
    "Zerodha session expired. Please re-authenticate on the OpenClaw page.";
export const KITE_MISSING_CREDENTIALS_MESSAGE =
    "Missing Kite credentials. Provide X-KITE-API-KEY and X-KITE-ACCESS-TOKEN headers.";

/**
 * Extract Kite credentials from request headers.
 * Agent passes these from its local environment variables.
 */
export function extractKiteHeaders(req: NextApiRequest): {
    apiKey: string | null;
    accessToken: string | null;
} {
    const apiKey =
        typeof req.headers["x-kite-api-key"] === "string"
            ? req.headers["x-kite-api-key"]
            : null;
    const accessToken =
        typeof req.headers["x-kite-access-token"] === "string"
            ? req.headers["x-kite-access-token"]
            : null;
    return { apiKey, accessToken };
}

/**
 * Create an authenticated KiteConnect instance from request headers.
 * Returns null if required headers are missing.
 */
export function createKiteFromHeaders(
    req: NextApiRequest
): Connect | null {
    const { apiKey, accessToken } = extractKiteHeaders(req);
    if (!apiKey || !accessToken) return null;
    return new KiteConnect({ api_key: apiKey, access_token: accessToken });
}

/**
 * Create a KiteConnect instance (unauthenticated — for generating login URLs).
 */
export function createKite(apiKey: string, accessToken?: string): Connect {
    return new KiteConnect({ api_key: apiKey, access_token: accessToken });
}

/**
 * Read all Kite-related env vars from SSM for a user.
 */
export async function getKiteCredsFromSSM(userWallet: string): Promise<{
    apiKey: string | null;
    apiSecret: string | null;
    accessToken: string | null;
    userName: string | null;
}> {
    const { getUserEnvVars } = await import("./ssm");

    const envVars = await getUserEnvVars(userWallet);
    const find = (key: string) =>
        envVars.find((v) => v.key === key)?.value ?? null;

    return {
        apiKey: find("KITE_API_KEY"),
        apiSecret: find("KITE_API_SECRET"),
        accessToken: find("KITE_ACCESS_TOKEN"),
        userName: find("KITE_USER_NAME"),
    };
}

export async function resolveUserWalletFromRequest(
    req: NextApiRequest,
    options?: { allowUserWalletQuery?: boolean }
): Promise<string | null> {
    const { resolveLazyTradingApiKey } = await import("./lazy-trading-api");

    const apiKeyRecord = await resolveLazyTradingApiKey(req);
    if (apiKeyRecord?.user_wallet) {
        return apiKeyRecord.user_wallet;
    }

    if (
        options?.allowUserWalletQuery &&
        typeof req.query.userWallet === "string" &&
        req.query.userWallet
    ) {
        return req.query.userWallet;
    }

    return null;
}

export async function resolveKiteFromRequest(
    req: NextApiRequest,
    options?: { allowUserWalletQuery?: boolean }
): Promise<Connect | null> {
    const kite = createKiteFromHeaders(req);
    if (kite) {
        return kite;
    }

    const userWallet = await resolveUserWalletFromRequest(req, options);
    if (!userWallet) {
        return null;
    }

    const creds = await getKiteCredsFromSSM(userWallet);
    if (!creds.apiKey || !creds.accessToken) {
        return null;
    }

    return createKite(creds.apiKey, creds.accessToken);
}

export function isKiteSessionError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const maybeError = error as {
        message?: string;
        status?: number | string;
        error_type?: string;
    };
    return (
        maybeError.error_type === "TokenException" ||
        maybeError.message?.includes("TokenException") === true ||
        maybeError.status === 403
    );
}

export function appendKiteRedirectParams(
    loginUrl: string,
    params: Record<string, string>
): string {
    const url = new URL(loginUrl);
    const redirectParams = new URLSearchParams(params).toString();
    url.searchParams.set("redirect_params", redirectParams);
    return url.toString();
}

/**
 * Store the Kite access token in SSM and optionally push to a running EC2 instance.
 */
export async function pushAccessTokenToUser(
    userWallet: string,
    accessToken: string,
    userName?: string
): Promise<{ appliedToInstance: boolean }> {
    const { storeUserEnvVar } = await import("./ssm");
    const { prisma } = await import("./prisma");
    const {
        getInstanceById,
        runCommandOnInstance,
    } = await import("./openclaw-instance-manager");

    // Store in SSM
    await storeUserEnvVar(userWallet, "KITE_ACCESS_TOKEN", accessToken);
    if (userName) {
        await storeUserEnvVar(userWallet, "KITE_USER_NAME", userName);
    }
    console.log(
        `[Kite] Stored access token in SSM for wallet ${userWallet.substring(
            0,
            10
        )}...`
    );

    // Try to push to running EC2 instance
    let appliedToInstance = false;

    const instance = await (prisma as any).openclaw_instances.findFirst({
        where: {
            user_wallet: {
                equals: userWallet,
                mode: "insensitive",
            },
        },
        select: { container_id: true, status: true },
    });

    if (!instance) {
        console.warn(
            `[Kite] No openclaw instance row found for wallet ${userWallet.substring(
                0,
                10
            )}.... Skipping live .env sync.`
        );
        return { appliedToInstance };
    }

    if (!instance.container_id) {
        console.warn(
            `[Kite] Instance row for wallet ${userWallet.substring(
                0,
                10
            )}... has no container_id. Skipping live .env sync.`
        );
        return { appliedToInstance };
    }

    if (instance.status !== "active") {
        console.warn(
            `[Kite] Instance ${instance.container_id} is marked "${instance.status}", not "active". Skipping live .env sync.`
        );
        return { appliedToInstance };
    }

    const instanceStatus = await getInstanceById(instance.container_id);
    if (instanceStatus.status !== "running") {
        console.warn(
            `[Kite] Instance ${instance.container_id} is "${instanceStatus.status}", not "running". Skipping live .env sync.`
        );
        return { appliedToInstance };
    }

    try {
        const escapedValue = accessToken.replace(/'/g, "'\\''");
        const escapedUserName = userName?.replace(/'/g, "'\\''");

        await runCommandOnInstance(instance.container_id, [
            `OPENCLAW_ENV="/home/ubuntu/.openclaw/.env"`,
            `sed -i '/^KITE_ACCESS_TOKEN=/d' $OPENCLAW_ENV 2>/dev/null || true`,
            `sed -i '/^KITE_USER_NAME=/d' $OPENCLAW_ENV 2>/dev/null || true`,
            `echo 'KITE_ACCESS_TOKEN=${escapedValue}' >> $OPENCLAW_ENV`,
            ...(escapedUserName
                ? [`echo 'KITE_USER_NAME=${escapedUserName}' >> $OPENCLAW_ENV`]
                : []),
            `chown ubuntu:ubuntu $OPENCLAW_ENV`,
            `su - ubuntu -c "source /home/ubuntu/.nvm/nvm.sh && openclaw gateway restart"`,
        ]);

        appliedToInstance = true;
        console.log(
            `[Kite] Synced access token to running instance ${instance.container_id}.`
        );
    } catch (error) {
        console.error(
            `[Kite] Failed to push access token to instance ${instance.container_id}:`,
            error
        );
    }

    if (!appliedToInstance) {
        console.warn(
            `[Kite] Access token is stored in SSM but was not applied live to instance ${instance.container_id}.`
        );
    }

    return { appliedToInstance };
}

/**
 * Remove the Kite session from SSM and from a running EC2 instance if present.
 */
export async function removeKiteSessionFromUser(
    userWallet: string
): Promise<{ appliedToInstance: boolean }> {
    const { deleteUserEnvVar } = await import("./ssm");
    const { prisma } = await import("./prisma");
    const {
        getInstanceById,
        runCommandOnInstance,
    } = await import("./openclaw-instance-manager");

    await deleteUserEnvVar(userWallet, "KITE_ACCESS_TOKEN");
    await deleteUserEnvVar(userWallet, "KITE_USER_NAME");
    console.log(
        `[Kite] Removed session from SSM for wallet ${userWallet.substring(
            0,
            10
        )}...`
    );

    let appliedToInstance = false;

    const instance = await (prisma as any).openclaw_instances.findFirst({
        where: {
            user_wallet: {
                equals: userWallet,
                mode: "insensitive",
            },
        },
        select: { container_id: true, status: true },
    });

    if (!instance) {
        console.warn(
            `[Kite] No openclaw instance row found for wallet ${userWallet.substring(
                0,
                10
            )}.... Skipping live session removal.`
        );
        return { appliedToInstance };
    }

    if (!instance.container_id) {
        console.warn(
            `[Kite] Instance row for wallet ${userWallet.substring(
                0,
                10
            )}... has no container_id. Skipping live session removal.`
        );
        return { appliedToInstance };
    }

    if (instance.status !== "active") {
        console.warn(
            `[Kite] Instance ${instance.container_id} is marked "${instance.status}", not "active". Skipping live session removal.`
        );
        return { appliedToInstance };
    }

    const instanceStatus = await getInstanceById(instance.container_id);
    if (instanceStatus.status !== "running") {
        console.warn(
            `[Kite] Instance ${instance.container_id} is "${instanceStatus.status}", not "running". Skipping live session removal.`
        );
        return { appliedToInstance };
    }

    try {
        await runCommandOnInstance(instance.container_id, [
            `OPENCLAW_ENV="/home/ubuntu/.openclaw/.env"`,
            `sed -i '/^KITE_ACCESS_TOKEN=/d' $OPENCLAW_ENV 2>/dev/null || true`,
            `sed -i '/^KITE_USER_NAME=/d' $OPENCLAW_ENV 2>/dev/null || true`,
            `chown ubuntu:ubuntu $OPENCLAW_ENV`,
            `su - ubuntu -c "source /home/ubuntu/.nvm/nvm.sh && openclaw gateway restart"`,
        ]);

        appliedToInstance = true;
        console.log(
            `[Kite] Removed session from running instance ${instance.container_id}.`
        );
    } catch (error) {
        console.error(
            `[Kite] Failed to remove session from instance ${instance.container_id}:`,
            error
        );
    }

    if (!appliedToInstance) {
        console.warn(
            `[Kite] Session was removed from SSM but not from live instance ${instance.container_id}.`
        );
    }

    return { appliedToInstance };
}
