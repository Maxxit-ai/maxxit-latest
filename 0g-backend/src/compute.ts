import {
  createReadOnlyInferenceBroker,
  createZGComputeNetworkBroker,
} from "@0glabs/0g-serving-broker";
import { FetchRequest, JsonRpcProvider, Wallet } from "ethers";
import { normalizePrivateKey, requireEnv } from "./config.js";

export interface ZgComputeMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ZgComputeResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: unknown;
  model?: string;
}

function getWallet(): Wallet {
  const rpcRequest = new FetchRequest(requireEnv("ZG_COMPUTE_RPC_URL"));
  rpcRequest.timeout = 60_000;
  const provider = new JsonRpcProvider(rpcRequest, 16602, {
    staticNetwork: true,
  });
  return new Wallet(normalizePrivateKey(requireEnv("ZG_WALLET_PRIVATE_KEY")), provider);
}

function getProviderAddress(): string {
  return requireEnv("ZG_COMPUTE_PROVIDER_ADDRESS");
}

export async function listProviders(includeUnacknowledged = false) {
  const rpcUrl = process.env.ZG_COMPUTE_RPC_URL || "https://evmrpc-testnet.0g.ai";
  const broker = await createReadOnlyInferenceBroker(rpcUrl);
  return broker.listService(0, 50, includeUnacknowledged);
}

export async function queryZgCompute(
  messages: ZgComputeMessage[],
  requestedModel?: string,
  providerAddress = getProviderAddress()
): Promise<{ content: string; model: string; verified: boolean | null }> {
  console.log("[0G Compute] Creating broker", { providerAddress });
  const broker = await createZGComputeNetworkBroker(getWallet());
  await broker.inference.initialize();

  console.log("[0G Compute] Fetching service metadata");
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const finalModel = requestedModel || model;
  const billableContent = messages.map((message) => message.content).join("\n\n");
  console.log("[0G Compute] Building request headers", {
    endpoint,
    model: finalModel,
  });
  const headers = await broker.inference.getRequestHeaders(
    providerAddress,
    billableContent
  );

  const chatEndpoint = `${endpoint.replace(/\/$/, "")}/chat/completions`;

  console.log("[0G Compute] Sending chat request", { chatEndpoint });
  const res = await fetch(chatEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      model: finalModel,
      messages,
      temperature: 0.2,
      max_tokens: 512,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`0G Compute request failed at ${chatEndpoint} (${res.status}): ${text}`);
  }

  const data = JSON.parse(text) as ZgComputeResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("0G Compute returned empty response");
  }

  const chatId = res.headers.get("ZG-Res-Key") || data.id;
  console.log("[0G Compute] Processing response", { chatId });
  const verified = await broker.inference.processResponse(
    providerAddress,
    chatId,
    data.usage ? JSON.stringify(data.usage) : undefined
  );

  return { content, model: data.model ?? finalModel, verified };
}
