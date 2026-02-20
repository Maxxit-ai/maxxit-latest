import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
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
  userOpenAIApiKey: (wallet: string) =>
    `/openclaw/users/${sanitizeWallet(wallet)}/openai-api-key`,
  userEnvVarPrefix: (wallet: string) =>
    `/openclaw/users/${sanitizeWallet(wallet)}/env/`,
  userEnvVar: (wallet: string, key: string) =>
    `/openclaw/users/${sanitizeWallet(wallet)}/env/${key}`,
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

export async function storeUserOpenAIApiKey(
  userWallet: string,
  apiKey: string
): Promise<void> {
  try {
    await ssmClient.send(
      new PutParameterCommand({
        Name: SSM_PATHS.userOpenAIApiKey(userWallet),
        Value: apiKey,
        Type: "SecureString",
        Overwrite: true,
      })
    );
  } catch (error) {
    console.error(
      "[SSM] Failed to store OpenAI API key for wallet",
      userWallet,
      error
    );
    throw error;
  }
}

export async function getUserOpenAIApiKey(
  userWallet: string
): Promise<string | null> {
  try {
    const result = await ssmClient.send(
      new GetParameterCommand({
        Name: SSM_PATHS.userOpenAIApiKey(userWallet),
        WithDecryption: true,
      })
    );
    return result.Parameter?.Value ?? null;
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      return null;
    }
    console.error(
      "[SSM] Failed to get OpenAI API key for wallet",
      userWallet,
      error
    );
    throw error;
  }
}

export async function deleteUserOpenAIApiKey(
  userWallet: string
): Promise<void> {
  try {
    await ssmClient.send(
      new DeleteParameterCommand({
        Name: SSM_PATHS.userOpenAIApiKey(userWallet),
      })
    );
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      return;
    }
    console.error(
      "[SSM] Failed to delete OpenAI API key for wallet",
      userWallet,
      error
    );
    throw error;
  }
}

export async function storeUserEnvVar(
  userWallet: string,
  key: string,
  value: string
): Promise<void> {
  try {
    await ssmClient.send(
      new PutParameterCommand({
        Name: SSM_PATHS.userEnvVar(userWallet, key),
        Value: value,
        Type: "SecureString",
        Overwrite: true,
      })
    );
  } catch (error) {
    console.error("[SSM] Failed to store env var", key, "for wallet", userWallet, error);
    throw error;
  }
}

export async function getUserEnvVars(
  userWallet: string
): Promise<{ key: string; value: string }[]> {
  try {
    const prefix = SSM_PATHS.userEnvVarPrefix(userWallet);
    const results: { key: string; value: string }[] = [];
    let nextToken: string | undefined;

    do {
      const response = await ssmClient.send(
        new GetParametersByPathCommand({
          Path: prefix,
          WithDecryption: true,
          MaxResults: 10,
          NextToken: nextToken,
        })
      );

      if (response.Parameters) {
        for (const param of response.Parameters) {
          if (param.Name && param.Value) {
            const key = param.Name.replace(prefix, "");
            results.push({ key, value: param.Value });
          }
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    return results;
  } catch (error) {
    console.error("[SSM] Failed to get env vars for wallet", userWallet, error);
    throw error;
  }
}

export async function deleteUserEnvVar(
  userWallet: string,
  key: string
): Promise<void> {
  try {
    await ssmClient.send(
      new DeleteParameterCommand({
        Name: SSM_PATHS.userEnvVar(userWallet, key),
      })
    );
  } catch (error) {
    if (error instanceof ParameterNotFound) {
      return;
    }
    console.error("[SSM] Failed to delete env var", key, "for wallet", userWallet, error);
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
