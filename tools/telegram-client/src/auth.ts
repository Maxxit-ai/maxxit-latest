/**
 * Interactive Authentication Script
 * 
 * Run this once to generate a session string:
 *   npm run auth
 * 
 * After authentication, copy the session string to your .env file.
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as readline from 'readline';
import { config, validateConfig } from './config';

function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║        Telegram Session Generator                ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');

    try {
        validateConfig();
    } catch (error: any) {
        console.error(`❌ ${error.message}`);
        console.log('');
        console.log('Please set TELEGRAM_API_ID and TELEGRAM_API_HASH in your .env file.');
        console.log('You can get these from https://my.telegram.org');
        process.exit(1);
    }

    console.log('✓ API credentials found');
    console.log('');

    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => {
            return await prompt('📱 Enter your phone number (with country code, e.g., +1234567890): ');
        },
        password: async () => {
            return await prompt('🔐 Enter your 2FA password (leave empty if not set): ');
        },
        phoneCode: async () => {
            return await prompt('📨 Enter the verification code you received: ');
        },
        onError: (err) => {
            console.error('Error during authentication:', err);
        },
    });

    console.log('');
    console.log('✅ Authentication successful!');
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  Save the following session string to your .env file as TELEGRAM_SESSION    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('TELEGRAM_SESSION=' + client.session.save());
    console.log('');
    console.log('⚠️  Keep this session string secret! It grants full access to your Telegram account.');
    console.log('');

    await client.disconnect();
}

main().catch(console.error);
