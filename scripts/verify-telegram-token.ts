/**
 * Quick script to verify Telegram Bot Token is configured
 */

// Load environment variables
import { config } from 'dotenv';
config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in environment variables');
  console.log('\n📝 To add it:');
  console.log('   1. Open your .env file');
  console.log('   2. Add: TELEGRAM_BOT_TOKEN=your_token_here');
  console.log('   3. Get token from @BotFather on Telegram\n');
  process.exit(1);
}

// Validate token format (basic check)
const tokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
if (!tokenPattern.test(token)) {
  console.error('⚠️  Token format looks invalid');
  console.log('   Expected format: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz');
  console.log('   Your token:', token.substring(0, 20) + '...');
  process.exit(1);
}

console.log('✅ TELEGRAM_BOT_TOKEN is configured');
console.log('   Token format: Valid');
console.log('   Token preview:', token.substring(0, 15) + '...' + token.substring(token.length - 10));

// Test API connection
async function testConnection() {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await response.json();
    
    if (data.ok) {
      console.log('\n✅ Bot API connection successful!');
      console.log('   Bot name:', data.result.first_name);
      console.log('   Bot username:', '@' + data.result.username);
      console.log('   Bot ID:', data.result.id);
    } else {
      console.error('\n❌ Bot API connection failed');
      console.error('   Error:', data.description);
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Failed to connect to Telegram API');
    console.error('   Error:', error.message);
    console.log('\n💡 Check your internet connection and token validity');
    process.exit(1);
  }
}

testConnection();

