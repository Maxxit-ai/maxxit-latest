import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { config, validateConfig } from './config';

export interface MessageResult {
    id: number;
    text: string;
    date: Date;
    fromId: string | null;
}

export class TelegramUserClient {
    private client: TelegramClient | null = null;
    private session: StringSession;
    private originalSessionString: string;

    constructor(sessionString?: string) {
        validateConfig();
        const finalSession = sessionString || config.session;
        this.originalSessionString = finalSession;
        this.session = new StringSession(finalSession);
    }

    /**
     * Connect to Telegram (uses saved session, no interactive auth)
     */
    async connect(): Promise<void> {
        if (!this.originalSessionString) {
            throw new Error(
                'No session string provided. Run `npm run auth` first to generate one.'
            );
        }

        this.client = new TelegramClient(this.session, config.apiId, config.apiHash, {
            connectionRetries: 5,
        });

        await this.client.connect();
        console.log('✅ Connected to Telegram');
    }

    /**
     * Disconnect from Telegram
     */
    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.disconnect();
            console.log('👋 Disconnected from Telegram');
        }
    }

    /**
     * Get the current session string (for saving)
     */
    getSessionString(): string {
        return this.session.save();
    }

    /**
     * Send a message to a user or bot
     * @param target - Username (e.g., '@BotFather') or user ID
     * @param message - Message text to send
     */
    async sendMessage(target: string, message: string): Promise<Api.Message> {
        if (!this.client) {
            throw new Error('Client not connected. Call connect() first.');
        }

        const result = await this.client.sendMessage(target, { message });
        console.log(`📤 Sent message to ${target}: "${message}"`);
        return result;
    }

    /**
     * Get recent messages from a chat
     * @param target - Username or user ID
     * @param limit - Number of messages to fetch (default: 10)
     */
    async getMessages(target: string, limit: number = 10): Promise<MessageResult[]> {
        if (!this.client) {
            throw new Error('Client not connected. Call connect() first.');
        }

        const messages = await this.client.getMessages(target, { limit });

        return messages.map((msg) => ({
            id: msg.id,
            text: msg.text || '',
            date: new Date((msg.date || 0) * 1000),
            fromId: msg.fromId?.toString() || null,
        }));
    }

    /**
     * Send a message and wait for a response from the target
     * @param target - Username or user ID
     * @param message - Message to send
     * @param timeoutMs - How long to wait for a response (default: 30s)
     */
    async sendAndWaitForResponse(
        target: string,
        message: string,
        timeoutMs: number = 30000
    ): Promise<string | null> {
        if (!this.client) {
            throw new Error('Client not connected. Call connect() first.');
        }

        // Get the entity to compare sender IDs
        const entity = await this.client.getEntity(target);
        const targetId = entity.id.toString();

        return new Promise(async (resolve) => {
            let resolved = false;

            // Set up timeout
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this.client?.removeEventHandler(handler, new NewMessage({}));
                    console.log('⏰ Response timeout');
                    resolve(null);
                }
            }, timeoutMs);

            // Set up message handler
            const handler = async (event: NewMessageEvent) => {
                const senderId = event.message.senderId?.toString();

                if (senderId === targetId && !resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    this.client?.removeEventHandler(handler, new NewMessage({}));
                    console.log(`📥 Received response: "${event.message.text}"`);
                    resolve(event.message.text || '');
                }
            };

            this.client?.addEventHandler(handler, new NewMessage({}));

            // Send the message
            await this.sendMessage(target, message);
        });
    }

    /**
     * Listen for messages from a specific user/bot
     * @param target - Username or user ID to listen for
     * @param callback - Function to call when a message is received
     */
    async listenForMessages(
        target: string,
        callback: (message: string, event: NewMessageEvent) => void
    ): Promise<void> {
        if (!this.client) {
            throw new Error('Client not connected. Call connect() first.');
        }

        const entity = await this.client.getEntity(target);
        const targetId = entity.id.toString();

        this.client.addEventHandler(async (event: NewMessageEvent) => {
            const senderId = event.message.senderId?.toString();

            if (senderId === targetId) {
                callback(event.message.text || '', event);
            }
        }, new NewMessage({}));

        console.log(`👂 Listening for messages from ${target}...`);
    }

    /**
     * Get the raw TelegramClient instance for advanced usage
     */
    getRawClient(): TelegramClient | null {
        return this.client;
    }
}
