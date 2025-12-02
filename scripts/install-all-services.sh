#!/bin/bash

echo "📦 Installing dependencies for all microservices..."
echo ""

SERVICES=(
  "agent-api"
  "deployment-api"
  "signal-api"
  "trade-executor-worker"
  "position-monitor-worker"
  "tweet-ingestion-worker"
  "metrics-updater-worker"
  "research-signal-worker"
)

SUCCESS_COUNT=0
FAIL_COUNT=0

for service in "${SERVICES[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📦 Installing: $service"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  SERVICE_DIR="services/$service"
  
  if [ ! -d "$SERVICE_DIR" ]; then
    echo "❌ Directory not found: $SERVICE_DIR"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    continue
  fi
  
  cd "$SERVICE_DIR"
  
  if npm install; then
    echo "✅ $service - Dependencies installed"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo "❌ $service - Installation failed"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  
  cd ../..
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Installation Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Successful: $SUCCESS_COUNT"
echo "❌ Failed: $FAIL_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo "🎉 All microservices are ready!"
  echo ""
  echo "🚀 Next steps:"
  echo "  1. Configure environment variables for each service"
  echo "  2. Start services individually: cd services/<service-name> && npm run dev"
  echo "  3. Or deploy to Railway: railway up (from each service directory)"
else
  echo "⚠️  Some services failed to install. Please check the errors above."
fi

