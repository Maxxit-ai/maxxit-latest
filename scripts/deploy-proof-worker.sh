#!/usr/bin/env bash
# =============================================================================
# deploy-proof-worker.sh — Build, push, and deploy the ZK Proof Worker
#
# Prerequisites:
#   1. npm install -g @layr-labs/ecloud-sdk
#   2. docker login
#   3. ecloud auth login
#   4. ecloud billing subscribe   (first time only)
#
# Usage:
#   chmod +x scripts/deploy-proof-worker.sh
#   ./scripts/deploy-proof-worker.sh
# =============================================================================

set -euo pipefail

DOCKER_USER="abxglia"
APP_NAME="maxxit-proof-worker"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_REF="docker.io/${DOCKER_USER}/${APP_NAME}:latest"
ENV_FILE="${ROOT_DIR}/.env.proof-worker"
DOCKERFILE="Dockerfile.proof-worker"

echo "========================================="
echo "  Maxxit Proof Worker → EigenCompute"
echo "========================================="

# ---- Pre-flight checks ----
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is not installed."; exit 1; }
command -v ecloud >/dev/null 2>&1 || { echo "❌ ecloud CLI not found. Run: npm install -g @layr-labs/ecloud-sdk"; exit 1; }

if [ ! -f "$ROOT_DIR/$DOCKERFILE" ]; then
  echo "❌ $DOCKERFILE not found in $ROOT_DIR"
  exit 1
fi

if [ ! -f "$ROOT_DIR/sp1/target/release/ostium-trader-host" ]; then
  echo "❌ SP1 binary not found at sp1/target/release/ostium-trader-host"
  echo "   Build it first: cd sp1 && cargo build --release"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env.proof-worker not found!"
  echo "   Copy .env.proof-worker.example → .env.proof-worker and fill in the values."
  exit 1
fi

# ---- Step 1: Build the Docker image ----
echo ""
echo "📦 Building Docker image..."
docker build \
  -f "$ROOT_DIR/$DOCKERFILE" \
  -t "$IMAGE_REF" \
  "$ROOT_DIR"

echo "✅ Image built successfully."

# ---- Step 2: Push to Docker Hub ----
echo ""
echo "📤 Pushing image to Docker Hub as ${IMAGE_REF}..."
docker push "$IMAGE_REF"

echo "✅ Image pushed successfully."

# ---- Step 3: Deploy to EigenCompute ----
echo ""
echo "🚀 Deploying to EigenCompute TEE..."

cd "$ROOT_DIR"
ecloud compute app deploy \
  --name "$APP_NAME" \
  --image-ref "$IMAGE_REF" \
  --env-file "$ENV_FILE"

echo ""
echo "========================================="
echo "  ✅ Deployment initiated!"
echo "========================================="
echo ""
echo "Useful commands:"
echo "  ecloud compute app status --name $APP_NAME"
echo "  ecloud compute app info"
echo "  ecloud compute app logs --name $APP_NAME"
