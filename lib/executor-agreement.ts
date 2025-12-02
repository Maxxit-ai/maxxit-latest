import { ethers } from 'ethers';

export interface ExecutorAgreementData {
  signalId: string;
  agentId: string;
  tokenSymbol: string;
  side: string;
  amount: string;
  timestamp: Date;
  executorWallet: string;
  message: string;
  signature: string;
}

export const EXECUTOR_AGREEMENT_MESSAGE_PREFIX = "I hereby agree to execute this trading signal on behalf of the agent. This signature serves as my authorization for signal ID:";

/**
 * Creates an executor agreement by signing a message with MetaMask.
 * @param signalId The ID of the signal being executed.
 * @param agentId The ID of the agent that generated the signal.
 * @param tokenSymbol The token being traded.
 * @param side The side of the trade (BUY/SELL).
 * @param amount The amount being traded.
 * @param executorWallet The wallet address of the executor.
 * @returns The signed agreement data.
 */
export async function createExecutorAgreementWithMetaMask(
  signalId: string,
  agentId: string,
  tokenSymbol: string,
  side: string,
  amount: string,
  executorWallet: string
): Promise<ExecutorAgreementData> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error("MetaMask is not installed or not detected.");
  }

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner(executorWallet);

  const timestamp = new Date();
  const message = `${EXECUTOR_AGREEMENT_MESSAGE_PREFIX} ${signalId} for agent ${agentId} trading ${side} ${amount} ${tokenSymbol} at ${timestamp.toISOString()}`;

  try {
    const signature = await signer.signMessage(message);
    return {
      signalId,
      agentId,
      tokenSymbol,
      side,
      amount,
      timestamp,
      executorWallet,
      message,
      signature
    };
  } catch (error: any) {
    console.error("MetaMask signing failed:", error);
    throw new Error(`MetaMask signing failed: ${error.message || error}`);
  }
}

/**
 * Verifies an executor agreement signature against a message and an address.
 * @param message The original message that was signed.
 * @param signature The signature to verify.
 * @param executorAddress The expected address of the executor.
 * @returns True if the signature is valid for the message and address, false otherwise.
 */
export function verifyExecutorAgreement(
  message: string,
  signature: string,
  executorAddress: string
): boolean {
  try {
    const recoveredAddress = ethers.utils.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === executorAddress.toLowerCase();
  } catch (error) {
    console.error("Signature verification failed:", error);
    return false;
  }
}

/**
 * Validates executor agreement data structure.
 * @param data The data to validate.
 * @returns True if the data is valid, false otherwise.
 */
export function validateExecutorAgreementData(data: any): data is ExecutorAgreementData {
  return (
    data &&
    typeof data.signalId === 'string' &&
    typeof data.agentId === 'string' &&
    typeof data.tokenSymbol === 'string' &&
    typeof data.side === 'string' &&
    typeof data.amount === 'string' &&
    data.timestamp instanceof Date &&
    typeof data.executorWallet === 'string' &&
    typeof data.message === 'string' &&
    typeof data.signature === 'string'
  );
}

/**
 * Generate a unique executor agreement hash for database storage.
 * @param message The original message that was signed.
 * @param signature The signature.
 * @returns A unique hash for the agreement.
 */
export function generateExecutorAgreementHash(message: string, signature: string): string {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['string', 'string'],
      [message, signature]
    )
  );
}

