import { createAutomatedAgentSignature, verifyAutomatedAgentSignature } from './agent-automated-signing';
import { prisma } from '../../../lib/prisma';

export interface AutomatedAgentSigningResult {
  isValid: boolean;
  error?: string;
  signalId: string;
  agentWallet?: string;
  signatureTimestamp?: Date;
}

export class AutomatedAgentSigningService {
  /**
   * Creates an automated agent signature for a signal.
   * @param signalId The ID of the signal.
   * @param agentPrivateKey The agent's private key.
   * @returns An object indicating if the signature was created successfully.
   */
  public static async createAutomatedSignature(
    signalId: string,
    agentPrivateKey: string
  ): Promise<AutomatedAgentSigningResult> {
    const signal = await prisma.signal.findUnique({
      where: { id: signalId },
      include: { agent: true }
    });

    if (!signal) {
      return { isValid: false, error: 'Signal not found', signalId };
    }

    try {
      // Create automated agent signature
      const agentSignature = await createAutomatedAgentSignature(
        signal.id,
        signal.agentId,
        signal.tokenSymbol,
        signal.side,
        signal.sizeModel?.value?.toString() || '1',
        agentPrivateKey
      );

      // Verify the signature
      const isValid = verifyAutomatedAgentSignature(
        agentSignature.message,
        agentSignature.signature,
        agentSignature.agentWallet
      );

      if (!isValid) {
        return { isValid: false, error: 'Invalid automated agent signature', signalId };
      }

      // Update the signal with automated agent signature
      await prisma.signal.update({
        where: { id: signalId },
        data: {
          agentSignatureMessage: agentSignature.message,
          agentSignature: agentSignature.signature,
          agentSignatureTimestamp: agentSignature.timestamp,
          agentWallet: agentSignature.agentWallet,
          agentSignatureVerified: true,
          agentSignatureError: null
        }
      });

      // Log the automated agent signature
      await prisma.auditLog.create({
        data: {
          action: 'AUTOMATED_AGENT_SIGNATURE_CREATED',
          details: {
            signalId,
            agentId: signal.agentId,
            agentWallet: agentSignature.agentWallet,
            tokenSymbol: signal.tokenSymbol,
            side: signal.side,
            message: agentSignature.message,
            signature: agentSignature.signature,
            timestamp: agentSignature.timestamp,
            automated: true
          }
        }
      });

      return { 
        isValid: true, 
        signalId,
        agentWallet: agentSignature.agentWallet,
        signatureTimestamp: agentSignature.timestamp
      };

    } catch (error: any) {
      console.error('Automated agent signing failed:', error);
      return { isValid: false, error: error.message, signalId };
    }
  }

  /**
   * Verifies the automated agent signature for a given signal.
   * @param signalId The ID of the signal.
   * @returns An object indicating if the signature is valid and any error message.
   */
  public static async verifySignalAutomatedSignature(
    signalId: string
  ): Promise<AutomatedAgentSigningResult> {
    const signal = await prisma.signal.findUnique({
      where: { id: signalId },
    });

    if (!signal) {
      return { isValid: false, error: 'Signal not found', signalId };
    }

    if (!signal.agentSignatureMessage || !signal.agentSignature || !signal.agentWallet) {
      return { isValid: false, error: 'Signal does not have an automated agent signature', signalId };
    }

    // Verify the signature
    const isValid = verifyAutomatedAgentSignature(
      signal.agentSignatureMessage,
      signal.agentSignature,
      signal.agentWallet
    );

    if (!isValid) {
      return { isValid: false, error: 'Invalid automated agent signature', signalId };
    }

    return { 
      isValid: true, 
      signalId,
      agentWallet: signal.agentWallet,
      signatureTimestamp: signal.agentSignatureTimestamp
    };
  }

  /**
   * Checks if a signal has a valid automated agent signature.
   * @param signalId The ID of the signal.
   * @returns True if the signal has a valid automated agent signature, false otherwise.
   */
  public static async hasValidAutomatedSignature(signalId: string): Promise<boolean> {
    const result = await this.verifySignalAutomatedSignature(signalId);
    return result.isValid;
  }

  /**
   * Gets all signals that need automated agent signatures.
   * @returns Array of signals that are verified but don't have automated agent signatures.
   */
  public static async getSignalsNeedingAutomatedSignatures(): Promise<any[]> {
    return await prisma.signal.findMany({
      where: {
        proofVerified: true,
        agentSignatureVerified: false,
        executorAgreementVerified: false, // Only if no manual executor agreement
        skippedReason: null
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            creatorWallet: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Gets all signals with automated agent signatures.
   * @returns Array of signals that have automated agent signatures.
   */
  public static async getSignalsWithAutomatedSignatures(): Promise<any[]> {
    return await prisma.signal.findMany({
      where: {
        agentSignatureVerified: true
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            creatorWallet: true
          }
        }
      },
      orderBy: {
        agentSignatureTimestamp: 'desc'
      }
    });
  }
}
