import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
  DeleteParameterCommand,
  ParameterNotFound,
} from "@aws-sdk/client-ssm";

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const SSM_PATHS = {
  userBotToken: (wallet: string) =>
    `/openclaw/users/${sanitizeWallet(wallet)}/telegram-bot-token`,
  userMaxxitApiKey: (wallet: string) =>
    `/openclaw/users/${sanitizeWallet(wallet)}/maxxit-api-key`,
  zaiApiKey: "/openclaw/global/zai-api-key",
  openaiApiKey: "/openclaw/global/openai-api-key",
} as const;

function sanitizeWallet(wallet: string): string {
  return wallet.replace(/[^a-zA-Z0-9_.-]/g, "_").toLowerCase();
}

export async function storeUserBotToken(
  userWallet: string,
  botToken: string
): Promise<void> {
  try {
    await ssmClient.send(
      new PutParameterCommand({
        Name: SSM_PATHS.userBotToken(userWallet),
        Value: botToken,
        Type: "SecureString",
        Overwrite: true,
      })
    );
  } catch (error) {
    console.error("[SSM] Failed to store bot token for wallet", userWallet, error);
    throw error;
  }
}

export async function getUserBotToken(
  userWallet: string
): Promise<string | null> {
  try {
    const result = await ssmClient.send(
      new GetParameterCommand({
        Name: SSM_PATHS.userBotToken(userWallet),
        WithDecryption: true,
      })
    );
    return result.Parameter?.Value ?? null;
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      return null;
    }
    console.error("[SSM] Failed to get bot token for wallet", userWallet, error);
    throw error;
  }
}

export async function deleteUserBotToken(
  userWallet: string
): Promise<void> {
  try {
    await ssmClient.send(
      new DeleteParameterCommand({
        Name: SSM_PATHS.userBotToken(userWallet),
      })
    );
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      return;
    }
    console.error("[SSM] Failed to delete bot token for wallet", userWallet, error);
    throw error;
  }
}

export async function storeUserMaxxitApiKey(
  userWallet: string,
  apiKey: string
): Promise<void> {
  try {
    await ssmClient.send(
      new PutParameterCommand({
        Name: SSM_PATHS.userMaxxitApiKey(userWallet),
        Value: apiKey,
        Type: "SecureString",
        Overwrite: true,
      })
    );
  } catch (error) {
    console.error("[SSM] Failed to store Maxxit API key for wallet", userWallet, error);
    throw error;
  }
}

export async function getUserMaxxitApiKey(
  userWallet: string
): Promise<string | null> {
  try {
    const result = await ssmClient.send(
      new GetParameterCommand({
        Name: SSM_PATHS.userMaxxitApiKey(userWallet),
        WithDecryption: true,
      })
    );
    return result.Parameter?.Value ?? null;
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      return null;
    }
    console.error("[SSM] Failed to get Maxxit API key for wallet", userWallet, error);
    throw error;
  }
}

export async function getGlobalLLMKeys(): Promise<{
  zaiApiKey: string | null;
  openaiApiKey: string | null;
}> {
  const [zaiApiKey, openaiApiKey] = await Promise.all([
    getParam(SSM_PATHS.zaiApiKey),
    getParam(SSM_PATHS.openaiApiKey),
  ]);
  return { zaiApiKey, openaiApiKey };
}

export async function storeGlobalLLMKey(
  provider: "zai" | "openai",
  apiKey: string
): Promise<void> {
  const name =
    provider === "zai" ? SSM_PATHS.zaiApiKey : SSM_PATHS.openaiApiKey;
  try {
    await ssmClient.send(
      new PutParameterCommand({
        Name: name,
        Value: apiKey,
        Type: "SecureString",
        Overwrite: true,
      })
    );
  } catch (error) {
    console.error("[SSM] Failed to store global LLM key for", provider, error);
    throw error;
  }
}

async function getParam(name: string): Promise<string | null> {
  try {
    const result = await ssmClient.send(
      new GetParameterCommand({
        Name: name,
        WithDecryption: true,
      })
    );
    return result.Parameter?.Value ?? null;
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      return null;
    }
    console.error("[SSM] Failed to get parameter", name, error);
    throw error;
  }
}
