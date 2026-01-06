// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ImpactFactorStorage
 * @dev Smart contract for storing impact factor calculation results and data integrity hashes
 * Deployed on Arbitrum L2
 * 
 * This contract stores:
 * 1. Hash of signal data (from webhook) - for verification
 * 2. Hash of EigenAI classification data - for verification
 * 3. Impact factor calculation results (MFE, MAE, impact_factor, pnl) - for transparency
 * 
 * All actual data remains in NeonDB, this contract provides:
 * - Immutable storage of calculation results
 * - Data integrity verification via hashes
 * - Gas-efficient storage (only hashes + results, not full data)
 */
contract ImpactFactorStorage {
    // Owner of the contract
    address public owner;
    
    // Struct to store signal verification hashes and impact factor results
    struct SignalData {
        bytes32 webhookDataHash; // Hash of data from webhook (initial signal creation)
        bytes32 eigenAIDataHash; // Hash of data from EigenAI classification
        int256 pnl; // Scaled by 1e4 (e.g., 1050 = 10.50%)
        int256 maxFavorableExcursion; // Scaled by 1e4
        int256 maxAdverseExcursion; // Scaled by 1e4
        int256 impactFactor; // Scaled by 1e4
        bool impactFactorFlag; // Whether to monitor this signal
        uint256 lastUpdated; // Timestamp of last impact factor update
        bool exists; // Whether this signal exists
    }
    
    // Mapping from signal ID (UUID string) to SignalData
    mapping(string => SignalData) public signals;
    
    // Array of all signal IDs for enumeration
    string[] public signalIds;
    
    // Mapping to track if signal ID is in the array
    mapping(string => bool) public signalIdExists;
    
    // Events
    event SignalInitialized(
        string indexed signalId,
        bytes32 webhookDataHash
    );
    
    event EigenAIDataStored(
        string indexed signalId,
        bytes32 eigenAIDataHash
    );
    
    event ImpactFactorUpdated(
        string indexed signalId,
        int256 pnl,
        int256 maxFavorableExcursion,
        int256 maxAdverseExcursion,
        int256 impactFactor,
        bool impactFactorFlag
    );
    
    event DataVerified(
        string indexed signalId,
        bool webhookDataMatch,
        bool eigenAIDataMatch
    );
    
    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @dev Initialize signal with webhook data hash
     * Called when signal is first created via webhook
     */
    function initializeSignal(
        string memory signalId,
        bytes32 webhookDataHash
    ) public onlyOwner {
        require(!signals[signalId].exists, "Signal already initialized");
        
        signals[signalId] = SignalData({
            webhookDataHash: webhookDataHash,
            eigenAIDataHash: bytes32(0), // Will be set later
            pnl: 0,
            maxFavorableExcursion: 0,
            maxAdverseExcursion: 0,
            impactFactor: 0,
            impactFactorFlag: false, // Will be set to true after EigenAI classification
            lastUpdated: 0,
            exists: true
        });
        
        signalIds.push(signalId);
        signalIdExists[signalId] = true;
        
        emit SignalInitialized(signalId, webhookDataHash);
    }
    
    /**
     * @dev Store EigenAI classification data hash
     * Called after EigenAI classification is complete
     */
    function storeEigenAIData(
        string memory signalId,
        bytes32 eigenAIDataHash
    ) public onlyOwner {
        require(signals[signalId].exists, "Signal does not exist");
        
        SignalData storage signal = signals[signalId];
        signal.eigenAIDataHash = eigenAIDataHash;
        signal.impactFactorFlag = true; // Enable monitoring after classification
        
        emit EigenAIDataStored(signalId, eigenAIDataHash);
    }
    
    /**
     * @dev Update impact factor calculation results
     * Called by impact factor worker after calculations
     */
    function updateImpactFactor(
        string memory signalId,
        int256 pnl,
        int256 maxFavorableExcursion,
        int256 maxAdverseExcursion,
        int256 impactFactor,
        bool impactFactorFlag
    ) public onlyOwner {
        require(signals[signalId].exists, "Signal does not exist");
        
        SignalData storage signal = signals[signalId];
        signal.pnl = pnl;
        signal.maxFavorableExcursion = maxFavorableExcursion;
        signal.maxAdverseExcursion = maxAdverseExcursion;
        signal.impactFactor = impactFactor;
        signal.impactFactorFlag = impactFactorFlag;
        signal.lastUpdated = block.timestamp;
        
        emit ImpactFactorUpdated(
            signalId,
            pnl,
            maxFavorableExcursion,
            maxAdverseExcursion,
            impactFactor,
            impactFactorFlag
        );
    }
    
    /**
     * @dev Verify data integrity by comparing hashes
     * @param signalId The signal ID to verify
     * @param webhookDataHash The hash of current webhook data from DB
     * @param eigenAIDataHash The hash of current EigenAI data from DB
     * @return webhookDataMatch Whether webhook data matches
     * @return eigenAIDataMatch Whether EigenAI data matches
     */
    function verifyData(
        string memory signalId,
        bytes32 webhookDataHash,
        bytes32 eigenAIDataHash
    ) public view returns (bool webhookDataMatch, bool eigenAIDataMatch) {
        require(signals[signalId].exists, "Signal does not exist");
        
        SignalData storage signal = signals[signalId];
        
        webhookDataMatch = signal.webhookDataHash == webhookDataHash;
        eigenAIDataMatch = signal.eigenAIDataHash == eigenAIDataHash;
        
        return (webhookDataMatch, eigenAIDataMatch);
    }
    
    /**
     * @dev Get signal data (hashes and impact factor results)
     */
    function getSignal(string memory signalId) public view returns (
        bytes32 webhookDataHash,
        bytes32 eigenAIDataHash,
        int256 pnl,
        int256 maxFavorableExcursion,
        int256 maxAdverseExcursion,
        int256 impactFactor,
        bool impactFactorFlag,
        uint256 lastUpdated
    ) {
        require(signals[signalId].exists, "Signal does not exist");
        
        SignalData storage signal = signals[signalId];
        
        return (
            signal.webhookDataHash,
            signal.eigenAIDataHash,
            signal.pnl,
            signal.maxFavorableExcursion,
            signal.maxAdverseExcursion,
            signal.impactFactor,
            signal.impactFactorFlag,
            signal.lastUpdated
        );
    }
    
    /**
     * @dev Get signal IDs that need impact factor monitoring
     * Returns IDs where impactFactorFlag is true
     */
    function getActiveSignalIds(uint256 limit, uint256 offset) public view returns (string[] memory activeSignalIds) {
        string[] memory tempIds = new string[](limit);
        uint256 count = 0;
        uint256 skipped = 0;
        
        for (uint256 i = 0; i < signalIds.length && count < limit; i++) {
            string memory signalIdStr = signalIds[i];
            SignalData storage signal = signals[signalIdStr];
            
            // Check if signal needs monitoring
            if (
                signal.exists &&
                signal.impactFactorFlag &&
                signal.eigenAIDataHash != bytes32(0) // Must have EigenAI data
            ) {
                if (skipped >= offset) {
                    tempIds[count] = signalIdStr;
                    count++;
                } else {
                    skipped++;
                }
            }
        }
        
        // Resize array to actual count
        string[] memory result = new string[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = tempIds[i];
        }
        
        return result;
    }
    
    /**
     * @dev Get total number of signals
     */
    function getSignalCount() public view returns (uint256) {
        return signalIds.length;
    }
    
    /**
     * @dev Transfer ownership
     */
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
