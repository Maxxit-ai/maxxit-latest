/**
 * OpenClaw EC2 Instance Manager
 * Handles AWS EC2 operations for user-specific OpenClaw instances
 */

import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  DescribeInstanceStatusCommand,
  CreateTagsCommand,
  type Instance,
  _InstanceType,
} from "@aws-sdk/client-ec2";

const ec2Client = new EC2Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// Configuration
const OPENCLAW_AMI_ID = process.env.OPENCLAW_AMI_ID || "ami-xxxxxxxxxx"; // AMI with Node.js and npm
const INSTANCE_TYPE = (process.env.OPENCLAW_INSTANCE_TYPE ||
  "t3.small") as _InstanceType;
const SECURITY_GROUP_ID = process.env.OPENCLAW_SECURITY_GROUP_ID || "";
const SUBNET_ID = process.env.OPENCLAW_SUBNET_ID || "";
const KEY_NAME = process.env.OPENCLAW_KEY_NAME || "";
const IAM_INSTANCE_PROFILE = process.env.OPENCLAW_IAM_ROLE || ""; // IAM role for SSM access

export interface InstanceConfig {
  userId: string;
  userWallet: string;
  model: string;
  ssmWalletPath: string;
  telegramChatId?: string;
  telegramUserId?: string; // For secure auto-pairing (allowlist mode)
  maxxitApiKey?: string; // For Maxxit Lazy Trading skill
  llmProxyUrl?: string;
  openclawApiKey?: string;
  webSearchProvider?: string;
  // WhatsApp channel configuration
  whatsappPhoneNumber?: string; // E.164 format (+15551234567)
  channels?: ('telegram' | 'whatsapp')[]; // Which channels to enable
}

export interface InstanceStatus {
  instanceId: string | null;
  status:
  | "pending"
  | "running"
  | "stopping"
  | "stopped"
  | "terminated"
  | "not_found"
  | "error";
  publicIp?: string;
  privateIp?: string;
  launchTime?: Date;
  error?: string;
}

export interface DetailedInstanceStatus {
  instanceId: string | null;
  state:
  | "pending"
  | "running"
  | "stopping"
  | "stopped"
  | "terminated"
  | "not_found"
  | "error";
  systemStatus: "ok" | "initializing" | "impaired" | "not_applicable" | null;
  instanceStatus: "ok" | "initializing" | "impaired" | "not_applicable" | null;
  ready: boolean; // True when state is running AND both status checks are ok
  publicIp?: string;
  privateIp?: string;
  launchTime?: Date;
  error?: string;
}

const MODEL_TO_OPENCLAW_ID: Record<
  string,
  { primary: string; provider: string }
> = {
  "gpt-5.1-codex-mini": {
    primary: "openai/gpt-5.1-codex-mini",
    provider: "openai",
  },
  "gpt-5-mini": { primary: "openai/gpt-5-mini", provider: "openai" },
  "gpt-4o": { primary: "openai/gpt-4o", provider: "openai" },
};

function getOpenClawModelId(model: string): string {
  return MODEL_TO_OPENCLAW_ID[model]?.primary || "";
}

function getUserDataScript(config: InstanceConfig): string {
  const modelId = getOpenClawModelId(config.model);
  const maxxitToolConfigSnippet = `# Configure OpenClaw tool access for Maxxit-managed deployments
echo "$(date): Configuring OpenClaw tool profile for Maxxit..."
su - ubuntu -c "openclaw config set tools.profile full" || {
  echo "$(date): WARNING - Failed to set tools.profile"
}
su - ubuntu -c "openclaw config set tools.sessions.visibility all" || {
  echo "$(date): WARNING - Failed to set tools.sessions.visibility"
}`;

  return `#!/bin/bash
set -e

# Create log directory
mkdir -p /var/log/openclaw
exec > >(tee -a /var/log/openclaw/userdata.log) 2>&1

echo "$(date): Starting OpenClaw configuration..."

# Get region from instance metadata
REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)
echo "Region: $REGION"

# Ensure awscli is available
which aws >/dev/null 2>&1 || (apt-get update && apt-get install -y awscli)

# Fetch bot token from SSM (only required when Telegram channel is configured)
${config.channels?.includes('telegram') !== false && (config.channels === undefined || config.channels.includes('telegram'))
  ? `echo "$(date): Fetching Telegram bot token from SSM..."
BOT_TOKEN=$(aws ssm get-parameter --name "/openclaw/users/${config.ssmWalletPath}/telegram-bot-token" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")
if [ -z "$BOT_TOKEN" ]; then
  echo "$(date): WARNING - No Telegram bot token found in SSM, skipping Telegram setup"
fi
echo "$(date): Bot token fetch complete"`
  : `echo "$(date): Skipping Telegram bot token fetch (Telegram not configured)"
BOT_TOKEN=""`
}

# Fetch LLM API keys from SSM
echo "$(date): Fetching LLM API keys from SSM..."
ZAI_KEY=$(aws ssm get-parameter --name "/openclaw/global/zai-api-key" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")

# Fetch OpenAI API key - try user-specific key first, then fallback to global key
echo "$(date): Fetching OpenAI API key (per-user with fallback to global)..."
OPENAI_KEY=$(aws ssm get-parameter --name "/openclaw/users/${config.ssmWalletPath}/openai-api-key" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")

# If user-specific key is not available, fallback to global key
if [ -z "$OPENAI_KEY" ]; then
  echo "$(date): Per-user OpenAI key not found, using global key..."
  OPENAI_KEY=$(aws ssm get-parameter --name "/openclaw/global/openai-api-key" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")
fi

echo "$(date): API keys fetched (ZAI: \${ZAI_KEY:+set}, OpenAI: \${OPENAI_KEY:+set})"

# Clean up any existing openclaw config/data from AMI
echo "$(date): Cleaning existing openclaw config..."
rm -rf /home/ubuntu/.openclaw
echo "$(date): Cleanup complete"

# Build onboard command with OpenAI API key
ONBOARD_CMD="openclaw onboard --non-interactive --accept-risk --mode local --skip-channels --skip-skills --skip-ui --install-daemon"

if [ -n "$OPENAI_KEY" ]; then
  ONBOARD_CMD="$ONBOARD_CMD --openai-api-key '$OPENAI_KEY'"
else
  echo "$(date): WARNING - No OpenAI API key found, onboarding may fail"
fi

# Install openclaw globally via npm
# NOTE: npm install -g must run as root to write to /usr/lib/node_modules
echo "$(date): Installing openclaw globally via npm..."
npm install -g openclaw@2026.3.2 || {
  echo "$(date): First install attempt failed, clearing npm cache and retrying..."
  npm cache clean --force
  npm install -g openclaw@2026.3.2 || {
    echo "$(date): ERROR - Failed to install openclaw after retry"
    exit 1
  }
}

# Verify installation is accessible by the ubuntu user
echo "$(date): Verifying openclaw installation..."
OPENCLAW_VERSION=$(su - ubuntu -c "openclaw --version" 2>/dev/null || echo "")
echo "$(date): OpenClaw version: $OPENCLAW_VERSION"

if [ -z "$OPENCLAW_VERSION" ]; then
  echo "$(date): ERROR - openclaw not found or not accessible by ubuntu user"
  exit 1
fi
echo "$(date): OpenClaw installed successfully"

# Run OpenClaw onboarding as ubuntu user
echo "$(date): Running OpenClaw onboarding..."
ONBOARD_LOG="/var/log/openclaw/onboard.log"
if ! su - ubuntu -c "$ONBOARD_CMD" 2>&1 | tee "$ONBOARD_LOG"; then
  if grep -q "Gateway did not become reachable" "$ONBOARD_LOG" && \
     su - ubuntu -c "test -f /home/ubuntu/.openclaw/openclaw.json"; then
    echo "$(date): WARNING - OpenClaw onboarding hit gateway reachability timeout after writing config. Continuing with explicit gateway restart."
  else
    echo "$(date): ERROR - OpenClaw onboarding failed"
    exit 1
  fi
fi
echo "$(date): OpenClaw onboarding complete"

# Gateway sometimes misses the first reachability window during daemon install.
echo "$(date): Ensuring OpenClaw gateway is running..."
su - ubuntu -c "systemctl --user daemon-reload" || true
su - ubuntu -c "systemctl --user restart openclaw-gateway.service" || \
su - ubuntu -c "openclaw gateway restart" || {
  echo "$(date): WARNING - Failed to restart OpenClaw gateway after onboarding"
}

${maxxitToolConfigSnippet}

# Enable and add Telegram channel only if a bot token was found
if [ -n "$BOT_TOKEN" ]; then
  echo "$(date): Enabling Telegram plugin..."
  su - ubuntu -c "openclaw plugins enable telegram" || {
    echo "$(date): WARNING - Failed to enable Telegram plugin"
  }

  echo "$(date): Adding Telegram channel..."
  su - ubuntu -c "openclaw channels add --channel telegram --token '$BOT_TOKEN'" || {
    echo "$(date): WARNING - Failed to add Telegram channel (non-fatal)"
  }
  echo "$(date): Telegram channel configured"
else
  echo "$(date): No Telegram bot token available, skipping Telegram channel setup"
fi

# WhatsApp channel setup (if configured)
${config.channels?.includes('whatsapp') || config.whatsappPhoneNumber
      ? `
# Enable WhatsApp plugin
echo "$(date): Setting up WhatsApp channel..."

# Install WhatsApp plugin
su - ubuntu -c "openclaw plugins install @openclaw/whatsapp" || {
  echo "$(date): WARNING - Failed to install WhatsApp plugin"
}

# Add WhatsApp channel (requires login after boot)
su - ubuntu -c "openclaw channels add --channel whatsapp --name 'default'" || {
  echo "$(date): WARNING - Failed to add WhatsApp channel"
}

# Configure WhatsApp channel settings
${config.whatsappPhoneNumber
      ? `
echo "$(date): Configuring WhatsApp channel with allowlist for ${config.whatsappPhoneNumber}..."

# allowFrom must be set BEFORE dmPolicy allowlist — openclaw validates immediately on set
# \\" in TS template literal → \" in bash script → literal " inside the outer "..." su -c string
su - ubuntu -c "openclaw config set channels.whatsapp.allowFrom '[\\"${config.whatsappPhoneNumber}\\"]' --json" || true
su - ubuntu -c "openclaw config set channels.whatsapp.accounts.default.allowFrom '[\\"${config.whatsappPhoneNumber}\\"]' --json" || true

# dmPolicy (validation now passes because allowFrom is already populated)
su - ubuntu -c "openclaw config set channels.whatsapp.dmPolicy allowlist" || true
su - ubuntu -c "openclaw config set channels.whatsapp.accounts.default.dmPolicy allowlist" || true

# Group messages fully disabled
su - ubuntu -c "openclaw config set channels.whatsapp.groupPolicy disabled" || true
su - ubuntu -c "openclaw config set channels.whatsapp.accounts.default.groupPolicy disabled" || true

# Remaining settings
su - ubuntu -c "openclaw config set channels.whatsapp.selfChatMode true" || true
su - ubuntu -c "openclaw config set channels.whatsapp.accounts.default.selfChatMode true" || true
su - ubuntu -c "openclaw config set channels.whatsapp.debounceMs 0" || true
su - ubuntu -c "openclaw config set channels.whatsapp.accounts.default.debounceMs 0" || true
su - ubuntu -c "openclaw config set channels.whatsapp.mediaMaxMb 50" || true

echo "$(date): WhatsApp allowlist configured for ${config.whatsappPhoneNumber}"
`
      : `
# No WhatsApp phone number provided — leave defaults in place
echo "$(date): WARNING - No WhatsApp phone number, allowlist not configured"
`
}

echo "$(date): WhatsApp channel configured (login required after boot)"
`
      : `
# WhatsApp not configured for this instance
echo "$(date): Skipping WhatsApp channel setup (not selected)"
`
}

# Set the default model
echo "$(date): Setting default model to ${modelId}..."
su - ubuntu -c "openclaw models set ${modelId}" || {
  echo "$(date): WARNING - Failed to set model, using default"
}

${config.webSearchProvider
      ? `
# Configure web search provider: ${config.webSearchProvider}
echo "$(date): Configuring web search provider: ${config.webSearchProvider}"

OPENCLAW_ENV="/home/ubuntu/.openclaw/.env"
mkdir -p "$(dirname "$OPENCLAW_ENV")"
touch "$OPENCLAW_ENV"

# Clean up any previous web search keys to avoid duplicates
sed -i '/^BRAVE_API_KEY=/d' "$OPENCLAW_ENV" 2>/dev/null || true
sed -i '/^PERPLEXITY_API_KEY=/d' "$OPENCLAW_ENV" 2>/dev/null || true
sed -i '/^OPENROUTER_API_KEY=/d' "$OPENCLAW_ENV" 2>/dev/null || true

WEB_PROVIDER="${config.webSearchProvider}"
WEB_API_KEY=""
WEB_BASE_URL=""

if [ "$WEB_PROVIDER" = "brave" ]; then
  echo "$(date): Fetching Brave API key from SSM..."
  BRAVE_KEY=$(aws ssm get-parameter --name "/openclaw/global/brave-api-key" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")
  if [ -n "$BRAVE_KEY" ]; then
    echo "BRAVE_API_KEY=$BRAVE_KEY" >> "$OPENCLAW_ENV"
    WEB_API_KEY="$BRAVE_KEY"
  else
    echo "$(date): WARNING - No Brave API key found in SSM, web search will be disabled"
  fi
elif [ "$WEB_PROVIDER" = "perplexity" ]; then
  echo "$(date): Fetching Perplexity API key from SSM..."
  PERPLEXITY_KEY=$(aws ssm get-parameter --name "/openclaw/global/perplexity-api-key" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")
  WEB_BASE_URL="https://api.perplexity.ai"
  if [ -n "$PERPLEXITY_KEY" ]; then
    echo "PERPLEXITY_API_KEY=$PERPLEXITY_KEY" >> "$OPENCLAW_ENV"
    WEB_API_KEY="$PERPLEXITY_KEY"
  else
    echo "$(date): WARNING - No Perplexity API key found in SSM, web search will be disabled"
  fi
elif [ "$WEB_PROVIDER" = "openrouter" ]; then
  echo "$(date): Fetching OpenRouter API key from SSM..."
  OPENROUTER_KEY=$(aws ssm get-parameter --name "/openclaw/global/openrouter-api-key" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")
  WEB_BASE_URL="https://openrouter.ai/api/v1"
  if [ -n "$OPENROUTER_KEY" ]; then
    echo "OPENROUTER_API_KEY=$OPENROUTER_KEY" >> "$OPENCLAW_ENV"
    WEB_API_KEY="$OPENROUTER_KEY"
  else
    echo "$(date): WARNING - No OpenRouter API key found in SSM, web search will be disabled"
  fi
fi

chown ubuntu:ubuntu "$OPENCLAW_ENV"

# Write the correct openclaw.json config per OpenClaw docs
# Brave: tools.web.search = { provider: "brave", apiKey: "..." }
# Perplexity/OpenRouter: tools.web.search = { provider: "perplexity", perplexity: { apiKey, baseUrl, model } }
if [ -n "$WEB_API_KEY" ]; then
  su - ubuntu -c "WEB_PROVIDER='$WEB_PROVIDER' WEB_API_KEY='$WEB_API_KEY' WEB_BASE_URL='$WEB_BASE_URL' node <<'NODE'
const fs = require('fs');
const configPath = '/home/ubuntu/.openclaw/openclaw.json';
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch {
  config = {};
}

config.tools = config.tools || {};
config.tools.web = config.tools.web || {};

if (process.env.WEB_PROVIDER === 'brave') {
  // Brave Search: apiKey at tools.web.search level
  config.tools.web.search = {
    provider: 'brave',
    apiKey: process.env.WEB_API_KEY,
    maxResults: 5,
    timeoutSeconds: 30,
  };
} else {
  // Perplexity (direct) or OpenRouter (Perplexity via OpenRouter)
  // Both use provider: 'perplexity' with different baseUrl
  config.tools.web.search = {
    provider: 'perplexity',
    perplexity: {
      apiKey: process.env.WEB_API_KEY,
      baseUrl: process.env.WEB_BASE_URL,
      model: 'perplexity/sonar-pro',
    },
  };
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Web search config written successfully');
NODE" || {
    echo "$(date): WARNING - Failed to update web search configuration in openclaw.json"
  }
  echo "$(date): Web search configured successfully (provider: $WEB_PROVIDER)"
else
  echo "$(date): WARNING - No API key available, web search is disabled"
fi
`
      : `
# Web search not configured for this instance
echo "$(date): Skipping web search configuration (not selected)"
`
    }

${config.telegramUserId
      ? `
# Configure secure DM policy (allowlist with user's Telegram ID)
echo "$(date): Configuring secure DM policy for user ${config.telegramUserId}..."
su - ubuntu -c "openclaw config set channels.telegram.allowFrom '[\"${config.telegramUserId}\"]' --json" || {
  echo "$(date): WARNING - Failed to set allowFrom"
}
su - ubuntu -c "openclaw config set channels.telegram.dmPolicy allowlist" || {
  echo "$(date): WARNING - Failed to set dmPolicy"
}
`
      : `
# No Telegram user ID provided, keeping default pairing mode
echo "$(date): WARNING - No Telegram user ID, pairing will be required"
`
    }

${config.maxxitApiKey
      ? `
# Maxxit Lazy Trading skill setup
echo "$(date): Setting up Maxxit Lazy Trading skill..."

# Fetch Maxxit API key from SSM
MAXXIT_API_KEY=$(aws ssm get-parameter --name "/openclaw/users/${config.ssmWalletPath}/maxxit-api-key" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")

if [ -n "$MAXXIT_API_KEY" ]; then
  echo "$(date): Maxxit API key fetched successfully"
  
  # Append Maxxit config to .env file
  OPENCLAW_ENV="/home/ubuntu/.openclaw/.env"
  echo "" >> $OPENCLAW_ENV
  echo "# Maxxit Lazy Trading" >> $OPENCLAW_ENV
  echo "MAXXIT_API_KEY=$MAXXIT_API_KEY" >> $OPENCLAW_ENV
  echo "MAXXIT_API_URL=https://maxxit.ai" >> $OPENCLAW_ENV
  chown ubuntu:ubuntu $OPENCLAW_ENV
  
  # Install the skill using clawhub
  echo "$(date): Installing maxxit-lazy-trading skill..."
  su - ubuntu -c "npx clawhub@latest install maxxit-lazy-trading --force" || {
    echo "$(date): WARNING - Failed to install maxxit-lazy-trading skill"
  }
  
  echo "$(date): Maxxit Lazy Trading skill configured"
else
  echo "$(date): WARNING - Maxxit API key not found in SSM, skipping skill setup"
fi
`
      : `
# No Maxxit API key provided, skipping lazy trading skill
echo "$(date): Skipping Maxxit Lazy Trading skill (not configured)"
`
    }

# Zerodha credential setup
echo "$(date): Fetching Zerodha credentials from SSM..."
KITE_API_KEY=$(aws ssm get-parameter --name "/openclaw/users/${config.ssmWalletPath}/env/KITE_API_KEY" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")
KITE_API_SECRET=$(aws ssm get-parameter --name "/openclaw/users/${config.ssmWalletPath}/env/KITE_API_SECRET" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")
KITE_ACCESS_TOKEN=$(aws ssm get-parameter --name "/openclaw/users/${config.ssmWalletPath}/env/KITE_ACCESS_TOKEN" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")
KITE_USER_NAME=$(aws ssm get-parameter --name "/openclaw/users/${config.ssmWalletPath}/env/KITE_USER_NAME" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")

OPENCLAW_ENV="/home/ubuntu/.openclaw/.env"
touch "$OPENCLAW_ENV"

for key in KITE_API_KEY KITE_API_SECRET KITE_ACCESS_TOKEN KITE_USER_NAME; do
  sed -i "/^\${key}=/d" "$OPENCLAW_ENV" 2>/dev/null || true
done

if [ -n "$KITE_API_KEY" ]; then
  echo "KITE_API_KEY=$KITE_API_KEY" >> "$OPENCLAW_ENV"
fi

if [ -n "$KITE_API_SECRET" ]; then
  echo "KITE_API_SECRET=$KITE_API_SECRET" >> "$OPENCLAW_ENV"
fi

if [ -n "$KITE_ACCESS_TOKEN" ]; then
  echo "KITE_ACCESS_TOKEN=$KITE_ACCESS_TOKEN" >> "$OPENCLAW_ENV"
fi

if [ -n "$KITE_USER_NAME" ]; then
  echo "KITE_USER_NAME=$KITE_USER_NAME" >> "$OPENCLAW_ENV"
fi

chown ubuntu:ubuntu "$OPENCLAW_ENV"
echo "$(date): Zerodha credentials synced to .env (API key: \${KITE_API_KEY:+set}, access token: \${KITE_ACCESS_TOKEN:+set})"

# Fetch all custom env vars from SSM and write to .env
# This picks up user-stored env vars like KITE_API_KEY, KITE_API_SECRET, KITE_ACCESS_TOKEN, etc.
echo "$(date): Fetching custom environment variables from SSM..."
OPENCLAW_ENV="/home/ubuntu/.openclaw/.env"
CUSTOM_ENV_PREFIX="/openclaw/users/${config.ssmWalletPath}/env/"
aws ssm get-parameters-by-path --path "$CUSTOM_ENV_PREFIX" --with-decryption \
  --query "Parameters[*].[Name,Value]" --output text --region $REGION 2>/dev/null | \
  while IFS=$'\t' read -r name value; do
    key=$(basename "$name")
    sed -i "/^\${key}=/d" "$OPENCLAW_ENV" 2>/dev/null || true
    echo "\${key}=\${value}" >> "$OPENCLAW_ENV"
  done
chown ubuntu:ubuntu "$OPENCLAW_ENV"
echo "$(date): Custom environment variables written to .env"

# Restart gateway to apply all config changes
echo "$(date): Restarting gateway..."
su - ubuntu -c "openclaw gateway restart" || {
  echo "$(date): WARNING - Failed to restart gateway"
}

# Verify setup
echo "$(date): Verifying OpenClaw setup..."
su - ubuntu -c "openclaw status" || true

echo "$(date): OpenClaw configuration complete!"

# Send welcome message to user
${config.telegramChatId
      ? `
echo "$(date): Sending welcome message to user..."
# Write message to a file
cat > /tmp/welcome_msg.txt << 'MSGEOF'
🎉 Your OpenClaw is Ready!

Hello! I'm your personal AI assistant, powered by OpenClaw on Maxxit.

I'm ready to help you with:

• Answering questions
• Managing tasks
• Analyzing information
• And much more!

Just send me a message and let's get started. 🚀
MSGEOF

# Create sender script
cat > /tmp/welcome_msg.sh << 'EOF'
#!/bin/bash
MESSAGE=\$(cat /tmp/welcome_msg.txt)
openclaw message send --channel telegram --target TARGET_PLACEHOLDER --message "\$MESSAGE"
EOF

# Replace the target placeholder
sed -i "s/TARGET_PLACEHOLDER/${config.telegramChatId}/g" /tmp/welcome_msg.sh

chmod +x /tmp/welcome_msg.sh
su - ubuntu -c "bash /tmp/welcome_msg.sh" || {
  echo "$(date): WARNING - Failed to send welcome message"
}
rm -f /tmp/welcome_msg.sh /tmp/welcome_msg.txt
`
      : `
echo "$(date): No chat ID provided, skipping welcome message"
`
    }

# Signal that setup is fully complete (used by instance-status API)
mkdir -p /var/log/openclaw
echo "$(date): Writing setup-complete sentinel file..."
touch /var/log/openclaw/setup-complete
echo "$(date): Setup complete sentinel written. All done!"
`;
}

/**
 * Create and launch a new EC2 instance for OpenClaw
 */
export async function createInstance(
  config: InstanceConfig,
): Promise<{ instanceId: string; publicIp?: string }> {
  try {
    const userData = Buffer.from(getUserDataScript(config)).toString("base64");

    const command = new RunInstancesCommand({
      ImageId: OPENCLAW_AMI_ID,
      InstanceType: INSTANCE_TYPE,
      MinCount: 1,
      MaxCount: 1,
      KeyName: KEY_NAME,
      SecurityGroupIds: SECURITY_GROUP_ID ? [SECURITY_GROUP_ID] : undefined,
      SubnetId: SUBNET_ID || undefined,
      IamInstanceProfile: IAM_INSTANCE_PROFILE
        ? { Name: IAM_INSTANCE_PROFILE }
        : undefined,
      UserData: userData,
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [
            {
              Key: "Name",
              Value: `openclaw-${config.userWallet.substring(0, 10)}`,
            },
            {
              Key: "Service",
              Value: "OpenClaw",
            },
            {
              Key: "UserWallet",
              Value: config.userWallet,
            },
            {
              Key: "UserId",
              Value: config.userId,
            },
            {
              Key: "ManagedBy",
              Value: "Maxxit",
            },
          ],
        },
      ],
    });

    const response = await ec2Client.send(command);

    if (!response.Instances || response.Instances.length === 0) {
      throw new Error("Failed to create instance: No instance returned");
    }

    const instance = response.Instances[0];
    const instanceId = instance.InstanceId;

    if (!instanceId) {
      throw new Error("Failed to create instance: No instance ID returned");
    }

    return {
      instanceId,
      publicIp: instance.PublicIpAddress,
    };
  } catch (error) {
    throw new Error(
      `Failed to create EC2 instance: ${error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Get the status of a user's OpenClaw EC2 instance
 */
export async function getInstanceStatus(
  userWallet: string,
): Promise<InstanceStatus> {
  try {
    const command = new DescribeInstancesCommand({
      Filters: [
        {
          Name: "tag:UserWallet",
          Values: [userWallet],
        },
        {
          Name: "tag:Service",
          Values: ["OpenClaw"],
        },
        {
          Name: "instance-state-name",
          Values: ["pending", "running", "stopping", "stopped"],
        },
      ],
    });

    const response = await ec2Client.send(command);

    if (
      !response.Reservations ||
      response.Reservations.length === 0 ||
      !response.Reservations[0].Instances ||
      response.Reservations[0].Instances.length === 0
    ) {
      return {
        instanceId: null,
        status: "not_found",
      };
    }

    const instance = response.Reservations[0].Instances[0];
    const state = instance.State?.Name;

    let status: InstanceStatus["status"] = "not_found";
    if (state === "pending") status = "pending";
    else if (state === "running") status = "running";
    else if (state === "stopping") status = "stopping";
    else if (state === "stopped") status = "stopped";
    else if (state === "terminated") status = "terminated";

    return {
      instanceId: instance.InstanceId || null,
      status,
      publicIp: instance.PublicIpAddress,
      privateIp: instance.PrivateIpAddress,
      launchTime: instance.LaunchTime,
    };
  } catch (error) {
    return {
      instanceId: null,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get instance by instance ID
 */
export async function getInstanceById(
  instanceId: string,
): Promise<InstanceStatus> {
  try {
    const command = new DescribeInstancesCommand({
      InstanceIds: [instanceId],
    });

    const response = await ec2Client.send(command);

    if (
      !response.Reservations ||
      response.Reservations.length === 0 ||
      !response.Reservations[0].Instances ||
      response.Reservations[0].Instances.length === 0
    ) {
      return {
        instanceId: null,
        status: "not_found",
      };
    }

    const instance = response.Reservations[0].Instances[0];
    const state = instance.State?.Name;

    let status: InstanceStatus["status"] = "not_found";
    if (state === "pending") status = "pending";
    else if (state === "running") status = "running";
    else if (state === "stopping") status = "stopping";
    else if (state === "stopped") status = "stopped";
    else if (state === "terminated") status = "terminated";

    return {
      instanceId: instance.InstanceId || null,
      status,
      publicIp: instance.PublicIpAddress,
      privateIp: instance.PrivateIpAddress,
      launchTime: instance.LaunchTime,
    };
  } catch (error) {
    return {
      instanceId: null,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Start a stopped EC2 instance
 */
export async function startInstance(instanceId: string): Promise<void> {
  try {
    const command = new StartInstancesCommand({
      InstanceIds: [instanceId],
    });

    await ec2Client.send(command);
  } catch (error) {
    throw new Error(
      `Failed to start instance: ${error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Stop a running EC2 instance
 */
export async function stopInstance(instanceId: string): Promise<void> {
  try {
    const command = new StopInstancesCommand({
      InstanceIds: [instanceId],
    });

    await ec2Client.send(command);
  } catch (error) {
    throw new Error(
      `Failed to stop instance: ${error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Terminate an EC2 instance (permanent deletion)
 */
export async function terminateInstance(instanceId: string): Promise<void> {
  try {
    const command = new TerminateInstancesCommand({
      InstanceIds: [instanceId],
    });

    await ec2Client.send(command);
  } catch (error) {
    throw new Error(
      `Failed to terminate instance: ${error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Check whether the userdata setup script has completed on an EC2 instance.
 * Looks for the sentinel file /var/log/openclaw/setup-complete via SSM.
 * Returns true if setup is complete, false if still in progress or unreachable.
 */
export async function checkSetupComplete(instanceId: string): Promise<boolean> {
  const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } =
    await import("@aws-sdk/client-ssm");

  const ssmClient = new SSMClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });

  try {
    const sendResp = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: "AWS-RunShellScript",
        Parameters: {
          commands: [
            "test -f /var/log/openclaw/setup-complete && echo SETUP_DONE || echo SETUP_PENDING",
          ],
        },
        TimeoutSeconds: 10,
      }),
    );

    const commandId = sendResp.Command?.CommandId;
    if (!commandId) return false;

    // Poll for result (up to ~8 seconds)
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const invocation = await ssmClient.send(
          new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: instanceId,
          }),
        );
        if (invocation.Status === "Success") {
          const output = (invocation.StandardOutputContent || "").trim();
          return output === "SETUP_DONE";
        }
        if (
          invocation.Status === "Failed" ||
          invocation.Status === "Cancelled" ||
          invocation.Status === "TimedOut"
        ) {
          return false;
        }
        // Still InProgress — keep polling
      } catch {
        // GetCommandInvocation may throw if not ready yet
      }
    }

    return false; // Timed out waiting
  } catch {
    // SSM agent may not be ready yet — treat as not complete
    return false;
  }
}

/**
 * Run shell commands on a running EC2 instance via SSM Run Command.
 * Requires SSM Agent to be installed and running on the instance,
 * and the instance's IAM role to have ssm:SendCommand permissions.
 */
export async function runCommandOnInstance(
  instanceId: string,
  commands: string[],
): Promise<{ commandId: string }> {
  const { SSMClient, SendCommandCommand } = await import("@aws-sdk/client-ssm");

  const ssmClient = new SSMClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });

  try {
    const response = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: "AWS-RunShellScript",
        Parameters: {
          commands,
        },
        TimeoutSeconds: 60,
      }),
    );

    const commandId = response.Command?.CommandId;
    if (!commandId) {
      throw new Error("No command ID returned from SSM SendCommand");
    }

    return { commandId };
  } catch (error) {
    throw new Error(
      `Failed to run command on instance ${instanceId}: ${error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export interface RunCommandResult {
  commandId: string;
  status: string;
  stdout: string;
  stderr: string;
}

/**
 * Run shell commands on an EC2 instance via SSM and wait for completion,
 * returning stdout/stderr. Useful for short-lived commands where we need output
 * (e.g. version checks, one-off updates).
 */
export async function runCommandOnInstanceWithOutput(
  instanceId: string,
  commands: string[],
  options?: { timeoutSeconds?: number; pollIntervalMs?: number },
): Promise<RunCommandResult> {
  const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } =
    await import("@aws-sdk/client-ssm");

  const timeoutSeconds = options?.timeoutSeconds ?? 120;
  const pollIntervalMs = options?.pollIntervalMs ?? 2000;

  const ssmClient = new SSMClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });

  try {
    const sendResponse = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: "AWS-RunShellScript",
        Parameters: {
          commands,
        },
        TimeoutSeconds: timeoutSeconds,
      }),
    );

    const commandId = sendResponse.Command?.CommandId;
    if (!commandId) {
      throw new Error("No command ID returned from SSM SendCommand");
    }

    const start = Date.now();
    // Poll for command invocation result
    // Status values: Pending | InProgress | Delayed | Success | Cancelled | Failed | TimedOut | Cancelling
    // We treat Success as completed-ok, others as terminal error states.
    // See: https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetCommandInvocation.html
    // We don't import the Status enum to avoid tight coupling; strings are stable.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const elapsedSeconds = (Date.now() - start) / 1000;
      if (elapsedSeconds > timeoutSeconds) {
        throw new Error(
          `SSM command ${commandId} timed out after ${timeoutSeconds}s`,
        );
      }

      const invocation = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        }),
      );

      const status = invocation.Status || "Unknown";

      if (
        status === "Success" ||
        status === "Cancelled" ||
        status === "Failed" ||
        status === "TimedOut" ||
        status === "Cancelling"
      ) {
        const stdout = invocation.StandardOutputContent || "";
        const stderr = invocation.StandardErrorContent || "";

        if (status !== "Success") {
          throw new Error(
            `SSM command ${commandId} completed with status ${status}: ${stderr || stdout}`,
          );
        }

        return {
          commandId,
          status,
          stdout,
          stderr,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  } catch (error) {
    throw new Error(
      `Failed to run command on instance ${instanceId}: ${error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Generate shell commands to reconfigure web search on a live instance via SSM.
 * These commands fetch the API key from SSM, update .env, rewrite openclaw.json,
 * and restart the OpenClaw gateway — all without recreating the EC2 instance.
 *
 * @param provider - "brave" | "perplexity" | "openrouter" | null (null = disable)
 * @returns Array of shell command strings to run via SSM
 */
export function getWebSearchReconfigCommands(
  provider: string | null,
): string[] {
  if (!provider) {
    // Disable web search: clean .env keys, remove search config, restart
    return [
      `#!/bin/bash`,
      `set -e`,
      `echo "$(date): Disabling web search..."`,
      `OPENCLAW_ENV="/home/ubuntu/.openclaw/.env"`,
      `sed -i '/^BRAVE_API_KEY=/d' "$OPENCLAW_ENV" 2>/dev/null || true`,
      `sed -i '/^PERPLEXITY_API_KEY=/d' "$OPENCLAW_ENV" 2>/dev/null || true`,
      `sed -i '/^OPENROUTER_API_KEY=/d' "$OPENCLAW_ENV" 2>/dev/null || true`,
      // Remove search config from openclaw.json
      `su - ubuntu -c "node <<'NODE'
const fs = require('fs');
const configPath = '/home/ubuntu/.openclaw/openclaw.json';
let config = {};
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { config = {}; }
if (config.tools && config.tools.web) { delete config.tools.web.search; }
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Web search config removed');
NODE"`,
      `su - ubuntu -c "openclaw gateway restart" || echo "WARNING: gateway restart failed"`,
      `echo "$(date): Web search disabled successfully"`,
    ];
  }

  // Determine SSM key path, env var name, and base URL per provider
  let ssmKeyPath: string;
  let envVarName: string;
  let baseUrl: string;

  if (provider === "brave") {
    ssmKeyPath = "/openclaw/global/brave-api-key";
    envVarName = "BRAVE_API_KEY";
    baseUrl = "";
  } else if (provider === "perplexity") {
    ssmKeyPath = "/openclaw/global/perplexity-api-key";
    envVarName = "PERPLEXITY_API_KEY";
    baseUrl = "https://api.perplexity.ai";
  } else {
    // openrouter
    ssmKeyPath = "/openclaw/global/openrouter-api-key";
    envVarName = "OPENROUTER_API_KEY";
    baseUrl = "https://openrouter.ai/api/v1";
  }

  return [
    `#!/bin/bash`,
    `set -e`,
    `echo "$(date): Reconfiguring web search to ${provider}..."`,
    `REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)`,
    // Fetch the API key from SSM
    `WEB_API_KEY=$(aws ssm get-parameter --name "${ssmKeyPath}" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")`,
    `if [ -z "$WEB_API_KEY" ]; then echo "ERROR: No API key found at ${ssmKeyPath}"; exit 1; fi`,
    // Update .env
    `OPENCLAW_ENV="/home/ubuntu/.openclaw/.env"`,
    `sed -i '/^BRAVE_API_KEY=/d' "$OPENCLAW_ENV" 2>/dev/null || true`,
    `sed -i '/^PERPLEXITY_API_KEY=/d' "$OPENCLAW_ENV" 2>/dev/null || true`,
    `sed -i '/^OPENROUTER_API_KEY=/d' "$OPENCLAW_ENV" 2>/dev/null || true`,
    `echo "${envVarName}=$WEB_API_KEY" >> "$OPENCLAW_ENV"`,
    `chown ubuntu:ubuntu "$OPENCLAW_ENV"`,
    // Write openclaw.json config
    `su - ubuntu -c "WEB_PROVIDER='${provider}' WEB_API_KEY='$WEB_API_KEY' WEB_BASE_URL='${baseUrl}' node <<'NODE'
const fs = require('fs');
const configPath = '/home/ubuntu/.openclaw/openclaw.json';
let config = {};
try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { config = {}; }
config.tools = config.tools || {};
config.tools.web = config.tools.web || {};
if (process.env.WEB_PROVIDER === 'brave') {
  config.tools.web.search = { provider: 'brave', apiKey: process.env.WEB_API_KEY, maxResults: 5, timeoutSeconds: 30 };
} else {
  config.tools.web.search = { provider: 'perplexity', perplexity: { apiKey: process.env.WEB_API_KEY, baseUrl: process.env.WEB_BASE_URL, model: 'perplexity/sonar-pro' } };
}
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('Web search config updated successfully');
NODE"`,
    `su - ubuntu -c "openclaw gateway restart" || echo "WARNING: gateway restart failed"`,
    `echo "$(date): Web search reconfigured to ${provider} successfully"`,
  ];
}

/**
 * Update instance configuration (requires recreating the instance)
 */
export async function updateInstanceConfig(
  instanceId: string,
  config: InstanceConfig,
): Promise<{ instanceId: string; publicIp?: string }> {
  // EC2 instances can't update user data without recreation
  // Stop the old instance and create a new one
  await terminateInstance(instanceId);

  // Wait a bit for termination to begin
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Create new instance with updated config
  return await createInstance(config);
}

/**
 * Get detailed instance status including system and instance status checks
 * This is useful for monitoring instance initialization after launch
 */
export async function getDetailedInstanceStatus(
  instanceId: string,
): Promise<DetailedInstanceStatus> {
  try {
    // First get the basic instance info
    const describeCommand = new DescribeInstancesCommand({
      InstanceIds: [instanceId],
    });

    const describeResponse = await ec2Client.send(describeCommand);

    if (
      !describeResponse.Reservations ||
      describeResponse.Reservations.length === 0 ||
      !describeResponse.Reservations[0].Instances ||
      describeResponse.Reservations[0].Instances.length === 0
    ) {
      return {
        instanceId: null,
        state: "not_found",
        systemStatus: null,
        instanceStatus: null,
        ready: false,
      };
    }

    const instance = describeResponse.Reservations[0].Instances[0];
    const state =
      (instance.State?.Name as DetailedInstanceStatus["state"]) || "not_found";

    // If instance is not running, status checks are not applicable
    if (state !== "running") {
      return {
        instanceId: instance.InstanceId || null,
        state,
        systemStatus: state === "pending" ? "initializing" : "not_applicable",
        instanceStatus: state === "pending" ? "initializing" : "not_applicable",
        ready: false,
        publicIp: instance.PublicIpAddress,
        privateIp: instance.PrivateIpAddress,
        launchTime: instance.LaunchTime,
      };
    }

    // Get detailed status checks for running instances
    const statusCommand = new DescribeInstanceStatusCommand({
      InstanceIds: [instanceId],
    });

    const statusResponse = await ec2Client.send(statusCommand);

    let systemStatus: DetailedInstanceStatus["systemStatus"] = "initializing";
    let instanceStatus: DetailedInstanceStatus["instanceStatus"] =
      "initializing";

    if (
      statusResponse.InstanceStatuses &&
      statusResponse.InstanceStatuses.length > 0
    ) {
      const status = statusResponse.InstanceStatuses[0];

      // Map AWS status to our simplified status
      const systemCheck = status.SystemStatus?.Status;
      const instanceCheck = status.InstanceStatus?.Status;

      if (systemCheck === "ok") systemStatus = "ok";
      else if (systemCheck === "impaired") systemStatus = "impaired";
      else if (systemCheck === "initializing") systemStatus = "initializing";
      else if (systemCheck === "not-applicable")
        systemStatus = "not_applicable";

      if (instanceCheck === "ok") instanceStatus = "ok";
      else if (instanceCheck === "impaired") instanceStatus = "impaired";
      else if (instanceCheck === "initializing")
        instanceStatus = "initializing";
      else if (instanceCheck === "not-applicable")
        instanceStatus = "not_applicable";
    }

    // Instance is ready when running and both status checks are ok
    const ready =
      state === "running" && systemStatus === "ok" && instanceStatus === "ok";

    return {
      instanceId: instance.InstanceId || null,
      state,
      systemStatus,
      instanceStatus,
      ready,
      publicIp: instance.PublicIpAddress,
      privateIp: instance.PrivateIpAddress,
      launchTime: instance.LaunchTime,
    };
  } catch (error) {
    return {
      instanceId: null,
      state: "error",
      systemStatus: null,
      instanceStatus: null,
      ready: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get instance by user wallet (helper)
 */
export async function getInstanceByUserWallet(
  userWallet: string,
): Promise<Instance | null> {
  try {
    const command = new DescribeInstancesCommand({
      Filters: [
        {
          Name: "tag:UserWallet",
          Values: [userWallet],
        },
        {
          Name: "tag:Service",
          Values: ["OpenClaw"],
        },
        {
          Name: "instance-state-name",
          Values: ["pending", "running", "stopping", "stopped"],
        },
      ],
    });

    const response = await ec2Client.send(command);

    if (
      !response.Reservations ||
      response.Reservations.length === 0 ||
      !response.Reservations[0].Instances ||
      response.Reservations[0].Instances.length === 0
    ) {
      return null;
    }

    return response.Reservations[0].Instances[0];
  } catch (error) {
    console.error("Error getting instance by user wallet:", error);
    return null;
  }
}
