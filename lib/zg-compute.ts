interface ZgComputeMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ZgComputeResponse {
  success: boolean;
  content?: string;
  model?: string;
  verified?: boolean | null;
  error?: string;
}

function getEnv() {
  const backendUrl = process.env.ZG_BACKEND_URL;

  if (!backendUrl) {
    throw new Error("ZG_BACKEND_URL must be set");
  }

  return {
    backendUrl: backendUrl.replace(/\/$/, ""),
    authToken: process.env.ZG_BACKEND_AUTH_TOKEN,
  };
}

export async function queryZgCompute(
  messages: ZgComputeMessage[],
  model = "qwen/qwen-2.5-7b-instruct"
): Promise<{ content: string; model: string }> {
  const { backendUrl, authToken } = getEnv();

  const res = await fetch(`${backendUrl}/compute/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`0G backend compute request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as ZgComputeResponse;

  if (!data.success || !data.content) {
    throw new Error(data.error || "0G backend returned empty compute response");
  }

  return { content: data.content, model: data.model ?? model };
}
