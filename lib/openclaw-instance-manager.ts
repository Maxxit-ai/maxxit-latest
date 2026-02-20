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
const OPENCLAW_AMI_ID = process.env.OPENCLAW_AMI_ID || "ami-xxxxxxxxxx"; // AMI with OpenClaw pre-installed
const INSTANCE_TYPE = (process.env.OPENCLAW_INSTANCE_TYPE || "t3.small") as _InstanceType;
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
  state: "pending" | "running" | "stopping" | "stopped" | "terminated" | "not_found" | "error";
  systemStatus: "ok" | "initializing" | "impaired" | "not_applicable" | null;
  instanceStatus: "ok" | "initializing" | "impaired" | "not_applicable" | null;
  ready: boolean; // True when state is running AND both status checks are ok
  publicIp?: string;
  privateIp?: string;
  launchTime?: Date;
  error?: string;
}

const MODEL_TO_OPENCLAW_ID: Record<string, { primary: string; provider: string }> = {
  "gpt-5-mini": { primary: "openai/gpt-5-mini", provider: "openai" },
  "gpt-4o-mini": { primary: "openai/gpt-4o-mini", provider: "openai" },
  "gpt-4o": { primary: "openai/gpt-4o", provider: "openai" },
};

function getOpenClawModelId(model: string): string {
  return MODEL_TO_OPENCLAW_ID[model]?.primary || "";
}



function getUserDataScript(config: InstanceConfig): string {
  const modelId = getOpenClawModelId(config.model);

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

# Fetch bot token from SSM
echo "$(date): Fetching bot token from SSM..."
BOT_TOKEN=$(aws ssm get-parameter --name "/openclaw/users/${config.ssmWalletPath}/telegram-bot-token" --with-decryption --query "Parameter.Value" --output text --region $REGION 2>/dev/null || echo "")

if [ -z "$BOT_TOKEN" ]; then
  echo "$(date): ERROR - Failed to fetch bot token from SSM"
  exit 1
fi
echo "$(date): Bot token fetched successfully"

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

# Clean up any existing config
echo "$(date): Cleaning existing config..."
rm -rf /home/ubuntu/.openclaw

# Build onboard command with OpenAI API key
ONBOARD_CMD="openclaw onboard --non-interactive --accept-risk --mode local --skip-channels --skip-skills --skip-ui --install-daemon"

if [ -n "$OPENAI_KEY" ]; then
  ONBOARD_CMD="$ONBOARD_CMD --openai-api-key '$OPENAI_KEY'"
else
  echo "$(date): WARNING - No OpenAI API key found, onboarding may fail"
fi

# NVM setup - openclaw is installed via NVM
export NVM_DIR="/home/ubuntu/.nvm"
NVM_INIT="export NVM_DIR=/home/ubuntu/.nvm && [ -s \\\"\\$NVM_DIR/nvm.sh\\\" ] && . \\\"\\$NVM_DIR/nvm.sh\\\""

echo "$(date): Checking openclaw installation..."
OPENCLAW_CHECK=$(su - ubuntu -c "eval $NVM_INIT && which openclaw" 2>/dev/null || echo "")
echo "$(date): OpenClaw path: $OPENCLAW_CHECK"

if [ -z "$OPENCLAW_CHECK" ]; then
  echo "$(date): ERROR - openclaw not found. Attempting to install..."
  su - ubuntu -c "eval $NVM_INIT && npm install -g openclaw" || {
    echo "$(date): ERROR - Failed to install openclaw"
    exit 1
  }
fi

# Run OpenClaw onboarding as ubuntu user
echo "$(date): Running OpenClaw onboarding..."
su - ubuntu -c "eval $NVM_INIT && $ONBOARD_CMD" || {
  echo "$(date): ERROR - OpenClaw onboarding failed"
  exit 1
}
echo "$(date): OpenClaw onboarding complete"

# Enable Telegram plugin
echo "$(date): Enabling Telegram plugin..."
su - ubuntu -c "eval $NVM_INIT && openclaw plugins enable telegram" || {
  echo "$(date): WARNING - Failed to enable Telegram plugin"
}

# Add Telegram channel with bot token
echo "$(date): Adding Telegram channel..."
su - ubuntu -c "eval $NVM_INIT && openclaw channels add --channel telegram --token '$BOT_TOKEN'" || {
  echo "$(date): ERROR - Failed to add Telegram channel"
  exit 1
}
echo "$(date): Telegram channel added"

# Set the default model
echo "$(date): Setting default model to ${modelId}..."
su - ubuntu -c "eval $NVM_INIT && openclaw models set ${modelId}" || {
  echo "$(date): WARNING - Failed to set model, using default"
}

${config.telegramUserId ? `
# Configure secure DM policy (allowlist with user's Telegram ID)
echo "$(date): Configuring secure DM policy for user ${config.telegramUserId}..."
su - ubuntu -c "eval $NVM_INIT && openclaw config set channels.telegram.allowFrom '[\"${config.telegramUserId}\"]' --json" || {
  echo "$(date): WARNING - Failed to set allowFrom"
}
su - ubuntu -c "eval $NVM_INIT && openclaw config set channels.telegram.dmPolicy allowlist" || {
  echo "$(date): WARNING - Failed to set dmPolicy"
}
` : `
# No Telegram user ID provided, keeping default pairing mode
echo "$(date): WARNING - No Telegram user ID, pairing will be required"
`}

${config.maxxitApiKey ? `
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
  su - ubuntu -c "eval $NVM_INIT && npx clawhub@latest install maxxit-lazy-trading --force" || {
    echo "$(date): WARNING - Failed to install maxxit-lazy-trading skill"
  }
  
  echo "$(date): Maxxit Lazy Trading skill configured"
else
  echo "$(date): WARNING - Maxxit API key not found in SSM, skipping skill setup"
fi
` : `
# No Maxxit API key provided, skipping lazy trading skill
echo "$(date): Skipping Maxxit Lazy Trading skill (not configured)"
`}

# Restart gateway to apply all config changes
echo "$(date): Restarting gateway..."
su - ubuntu -c "eval $NVM_INIT && openclaw gateway restart" || {
  echo "$(date): WARNING - Failed to restart gateway"
}

# Verify setup
echo "$(date): Verifying OpenClaw setup..."
su - ubuntu -c "eval $NVM_INIT && openclaw status" || true

echo "$(date): OpenClaw configuration complete!"

# Send welcome message to user
${config.telegramChatId ? `
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
source /home/ubuntu/.nvm/nvm.sh
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
` : `
echo "$(date): No chat ID provided, skipping welcome message"
`}
`;
}

/**
 * Create and launch a new EC2 instance for OpenClaw
 */
export async function createInstance(
  config: InstanceConfig
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
      IamInstanceProfile: IAM_INSTANCE_PROFILE ? { Name: IAM_INSTANCE_PROFILE } : undefined,
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
      }`
    );
  }
}

/**
 * Get the status of a user's OpenClaw EC2 instance
 */
export async function getInstanceStatus(
  userWallet: string
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
  instanceId: string
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
      }`
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
      }`
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
      }`
    );
  }
}

/**
 * Run shell commands on a running EC2 instance via SSM Run Command.
 * Requires SSM Agent to be installed and running on the instance,
 * and the instance's IAM role to have ssm:SendCommand permissions.
 */
export async function runCommandOnInstance(
  instanceId: string,
  commands: string[]
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
      })
    );

    const commandId = response.Command?.CommandId;
    if (!commandId) {
      throw new Error("No command ID returned from SSM SendCommand");
    }

    return { commandId };
  } catch (error) {
    throw new Error(
      `Failed to run command on instance ${instanceId}: ${error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Update instance configuration (requires recreating the instance)
 */
export async function updateInstanceConfig(
  instanceId: string,
  config: InstanceConfig
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
  instanceId: string
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
    const state = instance.State?.Name as DetailedInstanceStatus["state"] || "not_found";

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
    let instanceStatus: DetailedInstanceStatus["instanceStatus"] = "initializing";

    if (statusResponse.InstanceStatuses && statusResponse.InstanceStatuses.length > 0) {
      const status = statusResponse.InstanceStatuses[0];

      // Map AWS status to our simplified status
      const systemCheck = status.SystemStatus?.Status;
      const instanceCheck = status.InstanceStatus?.Status;

      if (systemCheck === "ok") systemStatus = "ok";
      else if (systemCheck === "impaired") systemStatus = "impaired";
      else if (systemCheck === "initializing") systemStatus = "initializing";
      else if (systemCheck === "not-applicable") systemStatus = "not_applicable";

      if (instanceCheck === "ok") instanceStatus = "ok";
      else if (instanceCheck === "impaired") instanceStatus = "impaired";
      else if (instanceCheck === "initializing") instanceStatus = "initializing";
      else if (instanceCheck === "not-applicable") instanceStatus = "not_applicable";
    }

    // Instance is ready when running and both status checks are ok
    const ready = state === "running" && systemStatus === "ok" && instanceStatus === "ok";

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
  userWallet: string
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
