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

    const maybeError = error as { message?: string; status?: number };
    return (
        maybeError.message?.includes("TokenException") === true ||
        maybeError.status === 403
    );
}

export function getCookie(
    req: NextApiRequest,
    name: string
): string | null {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const cookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));

    if (!cookie) return null;

    return decodeURIComponent(cookie.slice(name.length + 1));
}

export function buildCookieHeader(
    name: string,
    value: string,
    options?: { maxAge?: number }
): string {
    const secureCookieAttr =
        process.env.NODE_ENV === "development" ? "" : "; Secure";
    const encodedValue = encodeURIComponent(value);
    const maxAge =
        typeof options?.maxAge === "number" ? `; Max-Age=${options.maxAge}` : "";

    return `${name}=${encodedValue}; Path=/; HttpOnly; SameSite=Lax${maxAge}${secureCookieAttr}`;
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

    // Try to push to running EC2 instance
    let appliedToInstance = false;

    const instance = await (prisma as any).openclaw_instances.findUnique({
        where: { user_wallet: userWallet },
        select: { container_id: true, status: true },
    });

    if (instance?.container_id && instance.status === "active") {
        const instanceStatus = await getInstanceById(instance.container_id);

        if (instanceStatus.status === "running") {
            try {
                const escapedValue = accessToken.replace(/'/g, "'\\''");

                await runCommandOnInstance(instance.container_id, [
                    `OPENCLAW_ENV="/home/ubuntu/.openclaw/.env"`,
                    `sed -i '/^KITE_ACCESS_TOKEN=/d' $OPENCLAW_ENV 2>/dev/null || true`,
                    `echo 'KITE_ACCESS_TOKEN=${escapedValue}' >> $OPENCLAW_ENV`,
                    `chown ubuntu:ubuntu $OPENCLAW_ENV`,
                    `su - ubuntu -c "source /home/ubuntu/.nvm/nvm.sh && openclaw gateway restart"`,
                ]);

                appliedToInstance = true;
            } catch (error) {
                console.error(
                    "[Kite] Failed to push access token to instance:",
                    error
                );
            }
        }
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

    let appliedToInstance = false;

    const instance = await (prisma as any).openclaw_instances.findUnique({
        where: { user_wallet: userWallet },
        select: { container_id: true, status: true },
    });

    if (instance?.container_id && instance.status === "active") {
        const instanceStatus = await getInstanceById(instance.container_id);

        if (instanceStatus.status === "running") {
            try {
                await runCommandOnInstance(instance.container_id, [
                    `OPENCLAW_ENV="/home/ubuntu/.openclaw/.env"`,
                    `sed -i '/^KITE_ACCESS_TOKEN=/d' $OPENCLAW_ENV 2>/dev/null || true`,
                    `sed -i '/^KITE_USER_NAME=/d' $OPENCLAW_ENV 2>/dev/null || true`,
                    `chown ubuntu:ubuntu $OPENCLAW_ENV`,
                    `su - ubuntu -c "source /home/ubuntu/.nvm/nvm.sh && openclaw gateway restart"`,
                ]);

                appliedToInstance = true;
            } catch (error) {
                console.error(
                    "[Kite] Failed to remove session from instance:",
                    error
                );
            }
        }
    }

    return { appliedToInstance };
}
