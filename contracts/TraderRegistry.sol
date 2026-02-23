// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ISP1Verifier
/// @notice Interface for the SP1 Verifier contract.
interface ISP1Verifier {
    function verifyProof(
        bytes32 programVKey,
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view;
}

/// @title TraderRegistry
/// @notice A registry that stores ZK-verified performance metrics for Ostium traders.
contract TraderRegistry {
    /// @notice The address of the SP1 Verifier gateway.
    /// @dev On Arbitrum Sepolia: 0x397A5f7f3dBd538f23DE225B51f532c34448dA9B
    address public verifier;

    /// @notice The program VKey of the Ostium performance guest program.
    bytes32 public programVKey;

    /// @notice Verified metrics for a trader.
    struct TraderMetrics {
        uint32 tradeCount;
        uint32 winCount;
        int64 totalPnl;         // Stored as 6-decimal micro-USDC
        uint64 totalCollateral; // Stored as 6-decimal micro-USDC
        uint64 startTimestamp;
        uint64 endTimestamp;
        uint256 verifiedAt;
    }

    /// @notice Mapping from trader address to their latest verified metrics.
    mapping(address => TraderMetrics) public registry;

    event MetricsVerified(
        address indexed trader,
        uint32 tradeCount,
        int64 totalPnl,
        uint256 timestamp
    );

    constructor(address _verifier, bytes32 _programVKey) {
        verifier = _verifier;
        programVKey = _programVKey;
    }

    /// @notice Updates the verifier address.
    function setVerifier(address _verifier) external {
        // In production, add access control (e.g. Ownable)
        verifier = _verifier;
    }

    /// @notice Verifies an SP1 proof and updates the registry.
    /// @param publicValues The public values committed to by the SP1 guest program.
    /// @param proofBytes The Groth16 proof bytes.
    function verifyTraderPerformance(
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external {
        // 1. Verify the proof via the SP1 Verifier gateway.
        ISP1Verifier(verifier).verifyProof(programVKey, publicValues, proofBytes);

        // 2. Decode the committed metrics.
        // The guest program commits: [trader(20), tradeCount(4), winCount(4), totalPnl(8), totalCollateral(8), start(8), end(8)]
        // Total = 60 bytes.
        
        address trader;
        uint32 tradeCount;
        uint32 winCount;
        int64 totalPnl;
        uint64 totalCollateral;
        uint64 startTimestamp;
        uint64 endTimestamp;

        assembly {
            // publicValues is (offset, length, data...)
            // data starts at publicValues.offset
            let ptr := publicValues.offset
            
            // trader (20 bytes) -> stored in high bits of 32-byte word
            trader := shr(96, calldataload(ptr))
            
            // tradeCount (4 bytes)
            tradeCount := shr(224, calldataload(add(ptr, 20)))
            
            // winCount (4 bytes)
            winCount := shr(224, calldataload(add(ptr, 24)))
            
            // totalPnl (8 bytes)
            totalPnl := shr(192, calldataload(add(ptr, 28)))
            
            // totalCollateral (8 bytes)
            totalCollateral := shr(192, calldataload(add(ptr, 36)))
            
            // startTimestamp (8 bytes)
            startTimestamp := shr(192, calldataload(add(ptr, 44)))
            
            // endTimestamp (8 bytes)
            endTimestamp := shr(192, calldataload(add(ptr, 52)))
        }

        // 3. Store the verified metrics.
        registry[trader] = TraderMetrics({
            tradeCount: tradeCount,
            winCount: winCount,
            totalPnl: totalPnl,
            totalCollateral: totalCollateral,
            startTimestamp: startTimestamp,
            endTimestamp: endTimestamp,
            verifiedAt: block.timestamp
        });

        emit MetricsVerified(trader, tradeCount, totalPnl, block.timestamp);
    }
}
