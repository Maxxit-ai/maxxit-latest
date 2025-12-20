/**
 * Telegram Bot Service
 * Handles all Telegram Bot API interactions
 */


import { prisma } from '../lib/prisma';

export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  date: number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    message: TelegramMessage;
    data: string;
  };
}

export class TelegramBot {
  private botToken: string;
  private apiBase: string;

  constructor(botToken?: string) {
    this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
    
    if (!this.botToken) {
      console.warn('[TelegramBot] Warning: No bot token configured');
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(chatId: number | string, text: string, options?: {
    reply_markup?: any;
    parse_mode?: 'HTML' | 'Markdown';
  }): Promise<void> {
    try {
      const response = await fetch(`${this.apiBase}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          ...options,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Telegram API error: ${error}`);
      }
    } catch (error: any) {
      console.error('[TelegramBot] Send message error:', error.message);
      throw error;
    }
  }

  /**
   * Send a message with inline buttons
   */
  async sendMessageWithButtons(chatId: number | string, text: string, buttons: Array<Array<{ text: string; callback_data: string }>>) {
    await this.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: buttons,
      },
    });
  }

  /**
   * Answer callback query (button click)
   */
  async answerCallback(callbackQueryId: string, text?: string): Promise<void> {
    try {
      await fetch(`${this.apiBase}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
        }),
      });
    } catch (error: any) {
      console.error('[TelegramBot] Answer callback error:', error.message);
    }
  }

  /**
   * Set webhook URL
   */
  async setWebhook(url: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBase}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const result = await response.json();
      return result.ok;
    } catch (error: any) {
      console.error('[TelegramBot] Set webhook error:', error.message);
      return false;
    }
  }

  /**
   * Get bot info
   */
  async getMe(): Promise<any> {
    try {
      const response = await fetch(`${this.apiBase}/getMe`);
      const result = await response.json();
      return result.result;
    } catch (error: any) {
      console.error('[TelegramBot] Get me error:', error.message);
      return null;
    }
  }

  /**
   * Generate a one-time link code
   */
  generateLinkCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * Link Telegram user to deployment
   * Automatically unlinks from previous deployment if any
   */
  async linkUser(telegramUserId: string, linkCode: string): Promise<{ success: boolean; deploymentId?: string; error?: string }> {
    try {
      // Find pending telegram user by link code
      const pendingUser = await prisma.telegramUser.findFirst({
        where: {
          linkCode,
          isActive: false, // Only pending links
        },
        include: {
          deployment: {
            include: {
              agent: true,
            }
          }
        }
      });

      if (!pendingUser) {
        return { success: false, error: 'Invalid or expired link code' };
      }

      const deployment = pendingUser.deployment;

      // Check if user is already linked to any deployment
      const existingLink = await prisma.telegramUser.findUnique({
        where: { telegramUserId },
        include: {
          deployment: {
            include: {
              agent: true,
            }
          }
        }
      });

      // If already linked to this SAME deployment
      if (existingLink?.deploymentId === deployment.id) {
        return { 
          success: false, 
          error: `Already linked to ${deployment.agent.name}` 
        };
      }

      // If linked to a DIFFERENT deployment, unlink first (auto-switch)
      if (existingLink) {
        console.log(`[TelegramBot] Switching ${telegramUserId} from ${existingLink.deployment.agent.name} to ${deployment.agent.name}`);
        await prisma.telegramUser.delete({
          where: { telegramUserId }
        });
      }

      // Delete the pending user record
      await prisma.telegramUser.delete({
        where: { id: pendingUser.id }
      });

      // Create new active link
      await prisma.telegramUser.create({
        data: {
          telegramUserId,
          deploymentId: deployment.id,
          linkCode: null,
          isActive: true,
        }
      });

      console.log(`[TelegramBot] ✅ Linked ${telegramUserId} to ${deployment.agent.name} (${deployment.agent.venue})`);

      return {
        success: true,
        deploymentId: deployment.id
      };
    } catch (error: any) {
      console.error('[TelegramBot] Link user error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user's linked deployment
   */
  async getUserDeployment(telegramUserId: string): Promise<any | null> {
    try {
      const telegramUser = await prisma.telegramUser.findUnique({
        where: { telegramUserId },
        include: {
          deployment: {
            include: {
              agent: true
            }
          }
        }
      });

      return telegramUser?.deployment || null;
    } catch (error: any) {
      console.error('[TelegramBot] Get user deployment error:', error.message);
      return null;
    }
  }
}

export function createTelegramBot(botToken?: string): TelegramBot {
  return new TelegramBot(botToken);
}

