/**
 * Example: Send a message to a bot and wait for a response
 * 
 * Usage:
 *   npx ts-node examples/send-message.ts @BotFather /help
 *   npx ts-node examples/send-message.ts @SomeBot "Hello there"
 */

import { TelegramUserClient } from '../src';

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: npx ts-node examples/send-message.ts <target> <message>');
        console.log('');
        console.log('Examples:');
        console.log('  npx ts-node examples/send-message.ts @BotFather /help');
        console.log('  npx ts-node examples/send-message.ts @username "Hello!"');
        process.exit(1);
    }

    const target = args[0];
    const message = args.slice(1).join(' ');

    console.log(`🎯 Target: ${target}`);
    console.log(`💬 Message: ${message}`);
    console.log('');

    const client = new TelegramUserClient();

    try {
        await client.connect();

        // Send message and wait for response (30 second timeout)
        const response = await client.sendAndWaitForResponse(target, message, 30000);

        if (response) {
            console.log('');
            console.log('═══════════════════════════════════════');
            console.log('📥 Response from bot:');
            console.log('═══════════════════════════════════════');
            console.log(response);
            console.log('═══════════════════════════════════════');
        } else {
            console.log('');
            console.log('⚠️  No response received within timeout');
        }
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.disconnect();
    }
}

main();
