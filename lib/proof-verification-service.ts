import { verifyProofOfIntent } from './proof-of-intent';
import { prisma } from '../lib/prisma';

export interface ProofVerificationResult {
  isValid: boolean;
  error?: string;
  agentId: string;
}

export class ProofVerificationService {
  /**
   * Verify proof of intent for an agent before creating signals
   */
  static async verifyAgentProofOfIntent(agentId: string): Promise<ProofVerificationResult> {
    try {
      console.log(`[ProofVerification] Verifying proof of intent for agent: ${agentId}`);

      // Get the agent with proof of intent data
      const agent = await prisma.agent.findUnique({
        where: { id: agentId },
        select: {
          id: true,
          creatorWallet: true,
          proofOfIntentMessage: true,
          proofOfIntentSignature: true,
          proofOfIntentTimestamp: true,
        }
      });

      if (!agent) {
        return {
          isValid: false,
          error: 'Agent not found',
          agentId
        };
      }

      // Check if proof of intent exists
      if (!agent.proofOfIntentMessage || !agent.proofOfIntentSignature) {
        return {
          isValid: false,
          error: 'No proof of intent found for this agent. Agent creator must sign a proof of intent message.',
          agentId
        };
      }

      // Verify the signature
      const verificationResult = await verifyProofOfIntent(
        agent.proofOfIntentMessage,
        agent.proofOfIntentSignature,
        agent.creatorWallet
      );

      if (!verificationResult.isValid) {
        return {
          isValid: false,
          error: `Proof of intent verification failed: ${verificationResult.error}`,
          agentId
        };
      }

      console.log(`[ProofVerification] ✅ Proof of intent verified for agent: ${agentId}`);
      return {
        isValid: true,
        agentId
      };

    } catch (error: any) {
      console.error(`[ProofVerification] Error verifying proof for agent ${agentId}:`, error);
      return {
        isValid: false,
        error: `Verification error: ${error.message}`,
        agentId
      };
    }
  }

  /**
   * Update signal with proof verification status
   */
  static async updateSignalProofStatus(
    signalId: string, 
    verified: boolean, 
    error?: string
  ): Promise<void> {
    try {
      await prisma.signal.update({
        where: { id: signalId },
        data: {
          proofVerified: verified,
          proofVerificationError: error || null,
        }
      });

      console.log(`[ProofVerification] Updated signal ${signalId} proof status: ${verified}`);
    } catch (error: any) {
      console.error(`[ProofVerification] Error updating signal proof status:`, error);
    }
  }

  /**
   * Check if an agent has valid proof of intent
   */
  static async hasValidProofOfIntent(agentId: string): Promise<boolean> {
    const result = await this.verifyAgentProofOfIntent(agentId);
    return result.isValid;
  }
}
