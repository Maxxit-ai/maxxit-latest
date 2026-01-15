import type { NextApiRequest, NextApiResponse } from 'next';
import { TelegramUserClient } from 'tools/telegram-client/src';

const BOT_USERNAME = '@pigeon_trade_bot';

interface SendMessageRequest {
    action: 'send';
    message: string;
}

interface SendAndWaitRequest {
    action: 'sendAndWait';
    message: string;
    timeout?: number;
}

interface GetMessagesRequest {
    action: 'messages';
    limit?: number;
}

type RequestBody = SendMessageRequest | SendAndWaitRequest;

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // Check for required environment variables
    if (!process.env.TELEGRAM_API_ID || !process.env.TELEGRAM_API_HASH || !process.env.TELEGRAM_SESSION) {
        return res.status(500).json({
            success: false,
            error: 'Telegram client not configured. Missing TELEGRAM_API_ID, TELEGRAM_API_HASH, or TELEGRAM_SESSION environment variables.'
        });
    }

    try {
        if (req.method === 'GET') {
            // Handle GET request for fetching messages
            const { action, limit } = req.query;

            if (action !== 'messages') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid action. Use action=messages for GET requests.'
                });
            }

            const messageLimit = limit ? parseInt(limit as string, 10) : 50;
            const client = new TelegramUserClient();

            try {
                await client.connect();
                const messages = await client.getMessages(BOT_USERNAME, messageLimit);
                await client.disconnect();

                return res.status(200).json({
                    success: true,
                    messages: messages.map((msg: any) => ({
                        id: msg.id,
                        text: msg.text,
                        date: msg.date,
                        fromBot: msg.fromId === null // If fromId is null, it's from the bot; if set, it's from us
                    }))
                });
            } catch (error: any) {
                await client.disconnect().catch(() => { });
                throw error;
            }
        }

        if (req.method === 'POST') {
            const body = req.body as RequestBody;

            if (!body.action) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing action field in request body.'
                });
            }

            const client = new TelegramUserClient();

            try {
                await client.connect();

                if (body.action === 'send') {
                    // Just send message without waiting for response
                    const result = await client.sendMessage(BOT_USERNAME, body.message);
                    await client.disconnect();

                    return res.status(200).json({
                        success: true,
                        messageId: result.id
                    });
                }

                if (body.action === 'sendAndWait') {
                    // Send message and wait for response
                    const timeout = body.timeout || 30000;
                    const response = await client.sendAndWaitForResponse(
                        BOT_USERNAME,
                        body.message,
                        timeout
                    );
                    await client.disconnect();

                    return res.status(200).json({
                        success: true,
                        response: response
                    });
                }

                await client.disconnect();
                return res.status(400).json({
                    success: false,
                    error: `Unknown action: ${(body as any).action}`
                });
            } catch (error: any) {
                await client.disconnect().catch(() => { });
                throw error;
            }
        }

        return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use GET or POST.'
        });
    } catch (error: any) {
        console.error('Telegram API error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'An unexpected error occurred.'
        });
    }
}
