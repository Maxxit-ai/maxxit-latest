import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Try loading .env from multiple possible locations
const envPaths = [
    path.resolve(__dirname, '../.env'),
    path.resolve(process.cwd(), '.env'),
];

for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        break;
    }
}

export const config = {
    apiId: parseInt(process.env.TELEGRAM_API_ID || '0', 10),
    apiHash: process.env.TELEGRAM_API_HASH || '',
    session: process.env.TELEGRAM_SESSION || '',
};

export function validateConfig(): void {
    if (!config.apiId || config.apiId === 0) {
        throw new Error('TELEGRAM_API_ID is required. Get it from https://my.telegram.org');
    }
    if (!config.apiHash) {
        throw new Error('TELEGRAM_API_HASH is required. Get it from https://my.telegram.org');
    }
}
