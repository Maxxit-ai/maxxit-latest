import { prisma } from './prisma';

export interface AgentLinkingData {
    ctAccountIds?: string[];
    researchInstituteIds?: string[];
    telegramAlphaUserIds?: string[];
}

function camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function convertKeysToSnakeCase(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(convertKeysToSnakeCase);

    const result: any = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const snakeKey = camelToSnake(key);
            result[snakeKey] = convertKeysToSnakeCase(obj[key]);
        }
    }
    return result;
}

export class AgentService {
    /**
     * Creates an agent and all its associated links in a single operation.
     * Can be used within an existing Prisma transaction by passing the transaction client.
     * 
     * @param tx Prisma client or transaction client
     * @param agentData Data for agents.create (camelCase allowed)
     * @param linkingData Arrays of IDs to link (CT accounts, Research Institutes, Telegram Users)
     */
    static async createAgentCompletely(
        tx: any,
        agentData: any,
        linkingData: AgentLinkingData
    ) {
        const db = tx || prisma;

        // 1. Create the base agent record (transform camelCase to snake_case)
        const snakeAgentData = convertKeysToSnakeCase(agentData);
        const agent = await db.agents.create({
            data: snakeAgentData,
        });

        const agentId = agent.id;

        // 2. Link CT accounts (agent_accounts table)
        if (linkingData.ctAccountIds && linkingData.ctAccountIds.length > 0) {
            // Use createMany if supported and safe, but separate creates are fine for small sets
            for (const ctAccountId of linkingData.ctAccountIds) {
                // @ts-ignore
                await db.agent_accounts.upsert({
                    where: {
                        agent_id_ct_account_id: {
                            agent_id: agentId,
                            ct_account_id: ctAccountId,
                        },
                    },
                    update: {}, // No updates if exists
                    create: {
                        agent_id: agentId,
                        ct_account_id: ctAccountId,
                    },
                });
            }
        }

        // 3. Link Research Institutes (agent_research_institutes table)
        if (linkingData.researchInstituteIds && linkingData.researchInstituteIds.length > 0) {
            for (const instituteId of linkingData.researchInstituteIds) {
                // @ts-ignore
                await db.agent_research_institutes.upsert({
                    where: {
                        agent_id_institute_id: {
                            agent_id: agentId,
                            institute_id: instituteId,
                        },
                    },
                    update: {},
                    create: {
                        agent_id: agentId,
                        institute_id: instituteId,
                    },
                });
            }
        }

        // 4. Link Telegram Alpha Users (agent_telegram_users table)
        if (linkingData.telegramAlphaUserIds && linkingData.telegramAlphaUserIds.length > 0) {
            for (const telegramAlphaUserId of linkingData.telegramAlphaUserIds) {
                // @ts-ignore
                await db.agent_telegram_users.upsert({
                    where: {
                        agent_id_telegram_alpha_user_id: {
                            agent_id: agentId,
                            telegram_alpha_user_id: telegramAlphaUserId,
                        },
                    },
                    update: {},
                    create: {
                        agent_id: agentId,
                        telegram_alpha_user_id: telegramAlphaUserId,
                    },
                });
            }
        }

        return agent;
    }
}
