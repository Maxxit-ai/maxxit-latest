import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";
import { JsonRpcProvider, Wallet } from "ethers";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { normalizePrivateKey, requireEnv } from "./config.js";

function getSigner(): Wallet {
  return new Wallet(
    normalizePrivateKey(requireEnv("ZG_WALLET_PRIVATE_KEY")),
    new JsonRpcProvider(requireEnv("ZG_STORAGE_RPC_URL"))
  );
}

function getIndexer(): Indexer {
  return new Indexer(requireEnv("ZG_STORAGE_INDEXER_URL"));
}

export async function uploadAlphaContent(
  content: object
): Promise<{ rootHash: string; txHash: string }> {
  const bytes = Buffer.from(JSON.stringify(content), "utf-8");
  const memData = new MemData(bytes);

  const [, treeError] = await memData.merkleTree();
  if (treeError) {
    throw new Error(`0G storage merkle tree failed: ${treeError.message}`);
  }

  const [result, error] = await getIndexer().upload(
    memData,
    requireEnv("ZG_STORAGE_RPC_URL"),
    getSigner()
  );

  if (error) {
    throw new Error(`0G storage upload failed: ${error.message}`);
  }

  if (!("rootHash" in result) || !("txHash" in result)) {
    throw new Error("0G storage returned fragmented upload result unexpectedly");
  }

  return { rootHash: result.rootHash, txHash: result.txHash };
}

export async function downloadAlphaContent(rootHash: string): Promise<object> {
  const tmpPath = join(tmpdir(), `zg-alpha-${rootHash.slice(0, 16)}-${randomUUID()}.json`);
  const error = await getIndexer().download(rootHash, tmpPath, true);

  if (error) {
    throw new Error(`0G storage download failed: ${error.message}`);
  }

  const text = await readFile(tmpPath, "utf-8");
  await unlink(tmpPath).catch(() => {});
  return JSON.parse(text);
}
