/**
 * Example: Listen for messages from a bot continuously
 * 
 * Usage:
 *   npx ts-node examples/listen-to-bot.ts @SomeBot
 */

import { TelegramUserClient } from '../src';

async function main() {
    const target = process.argv[2];

    if (!target) {
        console.log('Usage: npx ts-node examples/listen-to-bot.ts <bot_username>');
        console.log('');
        console.log('Example:');
        console.log('  npx ts-node examples/listen-to-bot.ts @BotFather');
        process.exit(1);
    }

    console.log(`👂 Setting up listener for messages from ${target}`);
    console.log('Press Ctrl+C to stop');
    console.log('');

    const client = new TelegramUserClient();

    try {
        await client.connect();

        // Listen for messages
        await client.listenForMessages(target, (text, event) => {
            const time = new Date().toLocaleTimeString();
            console.log(`[${time}] 📥 ${text}`);
        });

        // Keep the process running
        await new Promise(() => { });
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    }
}

main();
