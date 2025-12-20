#!/bin/bash
# Quick script to set Telegram webhook

echo "🔗 Setting Telegram Webhook..."
echo ""
echo "Webhook URL: https://maxxitv3.vercel.app/api/telegram/webhook"
echo ""

npx tsx scripts/set-telegram-webhook.ts https://maxxitv3.vercel.app/api/telegram/webhook

echo ""
echo "✅ Done! Run this to verify:"
echo "   npx tsx scripts/check-telegram-bot-status.ts"
