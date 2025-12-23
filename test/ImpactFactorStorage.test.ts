import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("ImpactFactorStorage", function () {
  let contract: Contract;
  let owner: SignerWithAddress;
  let nonOwner: SignerWithAddress;
  let addr1: SignerWithAddress;

  // Test data
  const testSignalId = "test-signal-uuid-123";
  const testWebhookHash = ethers.keccak256(ethers.toUtf8Bytes("webhook-data"));
  const testEigenAIHash = ethers.keccak256(ethers.toUtf8Bytes("eigenai-data"));
  const testWebhookHash2 = ethers.keccak256(ethers.toUtf8Bytes("webhook-data-2"));
  const testEigenAIHash2 = ethers.keccak256(ethers.toUtf8Bytes("eigenai-data-2"));

  // Scaled values (1e4 scaling)
  const SCALE = 10000n;
  const pnl = 1050n; // 10.50%
  const mfe = 1200n; // 12.00%
  const mae = -500n; // -5.00%
  const impactFactor = 1700n; // 17.00%

  beforeEach(async function () {
    // Get signers
    [owner, nonOwner, addr1] = await ethers.getSigners();

    // Deploy contract
    const ImpactFactorStorage = await ethers.getContractFactory("ImpactFactorStorage");
    contract = await ImpactFactorStorage.deploy();
    await contract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("Should have zero signals initially", async function () {
      expect(await contract.getSignalCount()).to.equal(0);
    });
  });

  describe("initializeSignal", function () {
    it("Should initialize a signal with webhook hash", async function () {
      await expect(contract.initializeSignal(testSignalId, testWebhookHash))
        .to.emit(contract, "SignalInitialized")
        .withArgs(testSignalId, testWebhookHash);

      // Verify signal exists
      const signal = await contract.signals(testSignalId);
      expect(signal.exists).to.be.true;
      expect(signal.webhookDataHash).to.equal(testWebhookHash);
      expect(signal.eigenAIDataHash).to.equal(ethers.ZeroHash); // Should be zero initially
      expect(signal.impactFactorFlag).to.be.false;
    });

    it("Should add signal ID to array", async function () {
      await contract.initializeSignal(testSignalId, testWebhookHash);
      
      expect(await contract.getSignalCount()).to.equal(1);
      expect(await contract.signalIdExists(testSignalId)).to.be.true;
    });

    it("Should revert if signal already exists", async function () {
      await contract.initializeSignal(testSignalId, testWebhookHash);
      
      await expect(
        contract.initializeSignal(testSignalId, testWebhookHash2)
      ).to.be.revertedWith("Signal already initialized");
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        contract.connect(nonOwner).initializeSignal(testSignalId, testWebhookHash)
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("storeEigenAIData", function () {
    beforeEach(async function () {
      await contract.initializeSignal(testSignalId, testWebhookHash);
    });

    it("Should store EigenAI data hash", async function () {
      await expect(contract.storeEigenAIData(testSignalId, testEigenAIHash))
        .to.emit(contract, "EigenAIDataStored")
        .withArgs(testSignalId, testEigenAIHash);

      const signal = await contract.signals(testSignalId);
      expect(signal.eigenAIDataHash).to.equal(testEigenAIHash);
      expect(signal.impactFactorFlag).to.be.true; // Should be set to true
    });

    it("Should revert if signal does not exist", async function () {
      await expect(
        contract.storeEigenAIData("non-existent-id", testEigenAIHash)
      ).to.be.revertedWith("Signal does not exist");
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        contract.connect(nonOwner).storeEigenAIData(testSignalId, testEigenAIHash)
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("updateImpactFactor", function () {
    beforeEach(async function () {
      await contract.initializeSignal(testSignalId, testWebhookHash);
      await contract.storeEigenAIData(testSignalId, testEigenAIHash);
    });

    it("Should update impact factor values", async function () {
      const beforeTimestamp = await ethers.provider.getBlock("latest");
      const beforeTime = beforeTimestamp?.timestamp || 0;

      await expect(
        contract.updateImpactFactor(
          testSignalId,
          pnl,
          mfe,
          mae,
          impactFactor,
          true
        )
      )
        .to.emit(contract, "ImpactFactorUpdated")
        .withArgs(testSignalId, pnl, mfe, mae, impactFactor, true);

      const signal = await contract.signals(testSignalId);
      expect(signal.pnl).to.equal(pnl);
      expect(signal.maxFavorableExcursion).to.equal(mfe);
      expect(signal.maxAdverseExcursion).to.equal(mae);
      expect(signal.impactFactor).to.equal(impactFactor);
      expect(signal.impactFactorFlag).to.be.true;
      expect(signal.lastUpdated).to.be.greaterThan(beforeTime);
    });

    it("Should handle negative values correctly", async function () {
      const negativePnl = -500n; // -5%
      await contract.updateImpactFactor(
        testSignalId,
        negativePnl,
        mfe,
        mae,
        impactFactor,
        false
      );

      const signal = await contract.signals(testSignalId);
      expect(signal.pnl).to.equal(negativePnl);
      expect(signal.impactFactorFlag).to.be.false;
    });

    it("Should revert if signal does not exist", async function () {
      await expect(
        contract.updateImpactFactor(
          "non-existent-id",
          pnl,
          mfe,
          mae,
          impactFactor,
          true
        )
      ).to.be.revertedWith("Signal does not exist");
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        contract.connect(nonOwner).updateImpactFactor(
          testSignalId,
          pnl,
          mfe,
          mae,
          impactFactor,
          true
        )
      ).to.be.revertedWith("Not owner");
    });
  });

  describe("getSignal", function () {
    beforeEach(async function () {
      await contract.initializeSignal(testSignalId, testWebhookHash);
      await contract.storeEigenAIData(testSignalId, testEigenAIHash);
      await contract.updateImpactFactor(
        testSignalId,
        pnl,
        mfe,
        mae,
        impactFactor,
        true
      );
    });

    it("Should return correct signal data", async function () {
      const result = await contract.getSignal(testSignalId);
      
      expect(result[0]).to.equal(testWebhookHash); // webhookDataHash
      expect(result[1]).to.equal(testEigenAIHash); // eigenAIDataHash
      expect(result[2]).to.equal(pnl); // pnl
      expect(result[3]).to.equal(mfe); // maxFavorableExcursion
      expect(result[4]).to.equal(mae); // maxAdverseExcursion
      expect(result[5]).to.equal(impactFactor); // impactFactor
      expect(result[6]).to.be.true; // impactFactorFlag
      expect(result[7]).to.be.greaterThan(0); // lastUpdated
    });

    it("Should revert if signal does not exist", async function () {
      await expect(
        contract.getSignal("non-existent-id")
      ).to.be.revertedWith("Signal does not exist");
    });
  });

  describe("verifyData", function () {
    beforeEach(async function () {
      await contract.initializeSignal(testSignalId, testWebhookHash);
      await contract.storeEigenAIData(testSignalId, testEigenAIHash);
    });

    it("Should return true for matching hashes", async function () {
      const result = await contract.verifyData(
        testSignalId,
        testWebhookHash,
        testEigenAIHash
      );
      
      expect(result[0]).to.be.true; // webhookDataMatch
      expect(result[1]).to.be.true; // eigenAIDataMatch
    });

    it("Should return false for non-matching webhook hash", async function () {
      const result = await contract.verifyData(
        testSignalId,
        testWebhookHash2, // Different hash
        testEigenAIHash
      );
      
      expect(result[0]).to.be.false; // webhookDataMatch
      expect(result[1]).to.be.true; // eigenAIDataMatch
    });

    it("Should return false for non-matching EigenAI hash", async function () {
      const result = await contract.verifyData(
        testSignalId,
        testWebhookHash,
        testEigenAIHash2 // Different hash
      );
      
      expect(result[0]).to.be.true; // webhookDataMatch
      expect(result[1]).to.be.false; // eigenAIDataMatch
    });

    it("Should revert if signal does not exist", async function () {
      await expect(
        contract.verifyData(
          "non-existent-id",
          testWebhookHash,
          testEigenAIHash
        )
      ).to.be.revertedWith("Signal does not exist");
    });
  });

  describe("getActiveSignalIds", function () {
    const signalId1 = "signal-1";
    const signalId2 = "signal-2";
    const signalId3 = "signal-3";

    beforeEach(async function () {
      // Initialize 3 signals
      await contract.initializeSignal(signalId1, testWebhookHash);
      await contract.initializeSignal(signalId2, testWebhookHash);
      await contract.initializeSignal(signalId3, testWebhookHash);

      // Store EigenAI data for all
      await contract.storeEigenAIData(signalId1, testEigenAIHash);
      await contract.storeEigenAIData(signalId2, testEigenAIHash);
      await contract.storeEigenAIData(signalId3, testEigenAIHash);
    });

    it("Should return all active signals", async function () {
      const activeIds = await contract.getActiveSignalIds(10, 0);
      expect(activeIds.length).to.equal(3);
      expect(activeIds).to.include(signalId1);
      expect(activeIds).to.include(signalId2);
      expect(activeIds).to.include(signalId3);
    });

    it("Should respect limit parameter", async function () {
      const activeIds = await contract.getActiveSignalIds(2, 0);
      expect(activeIds.length).to.equal(2);
    });

    it("Should respect offset parameter", async function () {
      const activeIds = await contract.getActiveSignalIds(10, 1);
      expect(activeIds.length).to.equal(2);
    });

    it("Should not return signals without EigenAI data", async function () {
      const signalId4 = "signal-4";
      await contract.initializeSignal(signalId4, testWebhookHash);
      // Don't store EigenAI data

      const activeIds = await contract.getActiveSignalIds(10, 0);
      expect(activeIds.length).to.equal(3);
      expect(activeIds).to.not.include(signalId4);
    });

    it("Should not return signals with impactFactorFlag = false", async function () {
      // Set impactFactorFlag to false for signalId1
      await contract.updateImpactFactor(
        signalId1,
        pnl,
        mfe,
        mae,
        impactFactor,
        false // Set to false
      );

      const activeIds = await contract.getActiveSignalIds(10, 0);
      expect(activeIds.length).to.equal(2);
      expect(activeIds).to.not.include(signalId1);
      expect(activeIds).to.include(signalId2);
      expect(activeIds).to.include(signalId3);
    });
  });

  describe("getSignalCount", function () {
    it("Should return correct count", async function () {
      expect(await contract.getSignalCount()).to.equal(0);

      await contract.initializeSignal("signal-1", testWebhookHash);
      expect(await contract.getSignalCount()).to.equal(1);

      await contract.initializeSignal("signal-2", testWebhookHash);
      expect(await contract.getSignalCount()).to.equal(2);
    });
  });

  describe("transferOwnership", function () {
    it("Should transfer ownership", async function () {
      await contract.transferOwnership(addr1.address);
      expect(await contract.owner()).to.equal(addr1.address);
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        contract.connect(nonOwner).transferOwnership(addr1.address)
      ).to.be.revertedWith("Not owner");
    });

    it("Should revert if new owner is zero address", async function () {
      await expect(
        contract.transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });

    it("New owner should be able to call owner-only functions", async function () {
      await contract.transferOwnership(addr1.address);
      
      // New owner should be able to initialize signal
      await expect(
        contract.connect(addr1).initializeSignal(testSignalId, testWebhookHash)
      ).to.not.be.reverted;
    });
  });

  describe("Integration: Full workflow", function () {
    it("Should handle complete signal lifecycle", async function () {
      const signalId = "integration-test-signal";

      // 1. Initialize signal
      await contract.initializeSignal(signalId, testWebhookHash);
      let signal = await contract.signals(signalId);
      expect(signal.exists).to.be.true;
      expect(signal.impactFactorFlag).to.be.false;

      // 2. Store EigenAI data
      await contract.storeEigenAIData(signalId, testEigenAIHash);
      signal = await contract.signals(signalId);
      expect(signal.eigenAIDataHash).to.equal(testEigenAIHash);
      expect(signal.impactFactorFlag).to.be.true;

      // 3. Update impact factor multiple times
      await contract.updateImpactFactor(signalId, pnl, mfe, mae, impactFactor, true);
      let result = await contract.getSignal(signalId);
      expect(result[2]).to.equal(pnl); // pnl

      const updatedPnl = 2000n; // 20%
      await contract.updateImpactFactor(signalId, updatedPnl, mfe, mae, impactFactor, true);
      result = await contract.getSignal(signalId);
      expect(result[2]).to.equal(updatedPnl); // Updated pnl

      // 4. Verify data integrity
      const verification = await contract.verifyData(
        signalId,
        testWebhookHash,
        testEigenAIHash
      );
      expect(verification[0]).to.be.true; // webhookDataMatch
      expect(verification[1]).to.be.true; // eigenAIDataMatch

      // 5. Check it appears in active signals
      const activeIds = await contract.getActiveSignalIds(10, 0);
      expect(activeIds).to.include(signalId);
    });
  });
});
