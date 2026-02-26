// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ISP1Verifier
interface ISP1Verifier {
    function verifyProof(
        bytes32 programVKey,
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view;
}

/// @title PositionRegistry
/// @notice Verifies and stores ZK-proven trader performance + featured position data.
/// @dev Public values layout (110 bytes, all big-endian):
///   [0..20]    trader address
///   [20..24]   trade_count (uint32)
///   [24..28]   win_count (uint32)
///   [28..36]   total_pnl (int64)
///   [36..44]   total_collateral (uint64)
///   [44..52]   start_timestamp (uint64)
///   [52..60]   end_timestamp (uint64)
///   [60..68]   featured_trade_id (uint64)
///   [68..72]   featured_pair_index (uint32)
///   [72]       featured_is_buy (uint8)
///   [73..77]   featured_leverage (uint32)
///   [77..85]   featured_collateral (uint64)
///   [85..101]  featured_entry_price (uint128)
///   [101]      featured_is_open (uint8)
///   [102..110] featured_timestamp (uint64)
contract PositionRegistry {
    address public verifier;
    bytes32 public programVKey;

    struct VerifiedAlpha {
        uint32 tradeCount;
        uint32 winCount;
        int64 totalPnl;
        uint64 totalCollateral;
        uint64 startTimestamp;
        uint64 endTimestamp;
        uint64 featuredTradeId;
        uint32 featuredPairIndex;
        bool featuredIsBuy;
        uint32 featuredLeverage;
        uint64 featuredCollateral;
        uint128 featuredEntryPrice;
        bool featuredIsOpen;
        uint64 featuredTimestamp;
        uint256 verifiedAt;
    }

    mapping(bytes32 => VerifiedAlpha) internal registry;
    mapping(address => bytes32[]) public traderKeys;

    event AlphaVerified(
        address indexed trader,
        uint64 featuredTradeId,
        uint32 tradeCount,
        int64 totalPnl,
        uint256 timestamp
    );

    constructor(address _verifier, bytes32 _programVKey) {
        verifier = _verifier;
        programVKey = _programVKey;
    }

    function setVerifier(address _verifier) external {
        verifier = _verifier;
    }

    // ── Byte-reading helpers (pure, no stack pressure) ──────────────

    function _readAddress(bytes calldata d, uint256 o) internal pure returns (address) {
        return address(bytes20(d[o:o+20]));
    }

    function _readU32(bytes calldata d, uint256 o) internal pure returns (uint32) {
        return uint32(bytes4(d[o:o+4]));
    }

    function _readI64(bytes calldata d, uint256 o) internal pure returns (int64) {
        return int64(uint64(bytes8(d[o:o+8])));
    }

    function _readU64(bytes calldata d, uint256 o) internal pure returns (uint64) {
        return uint64(bytes8(d[o:o+8]));
    }

    function _readU128(bytes calldata d, uint256 o) internal pure returns (uint128) {
        return uint128(bytes16(d[o:o+16]));
    }

    function _readU8(bytes calldata d, uint256 o) internal pure returns (uint8) {
        return uint8(d[o]);
    }

    // ── Main entry point ────────────────────────────────────────────

    function verifyAlpha(
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external {
        ISP1Verifier(verifier).verifyProof(programVKey, publicValues, proofBytes);
        require(publicValues.length >= 110, "Invalid length");

        address trader = _readAddress(publicValues, 0);
        uint64 featuredTradeId = _readU64(publicValues, 60);
        bytes32 key = keccak256(abi.encodePacked(trader, featuredTradeId));

        _storeAggregate(key, publicValues);
        _storeFeatured(key, publicValues);

        registry[key].verifiedAt = block.timestamp;
        traderKeys[trader].push(key);

        emit AlphaVerified(
            trader,
            featuredTradeId,
            registry[key].tradeCount,
            registry[key].totalPnl,
            block.timestamp
        );
    }

    function _storeAggregate(bytes32 key, bytes calldata pv) internal {
        registry[key].tradeCount    = _readU32(pv, 20);
        registry[key].winCount      = _readU32(pv, 24);
        registry[key].totalPnl      = _readI64(pv, 28);
        registry[key].totalCollateral = _readU64(pv, 36);
        registry[key].startTimestamp = _readU64(pv, 44);
        registry[key].endTimestamp   = _readU64(pv, 52);
    }

    function _storeFeatured(bytes32 key, bytes calldata pv) internal {
        registry[key].featuredTradeId    = _readU64(pv, 60);
        registry[key].featuredPairIndex  = _readU32(pv, 68);
        registry[key].featuredIsBuy      = _readU8(pv, 72) == 1;
        registry[key].featuredLeverage   = _readU32(pv, 73);
        registry[key].featuredCollateral = _readU64(pv, 77);
        registry[key].featuredEntryPrice = _readU128(pv, 85);
        registry[key].featuredIsOpen     = _readU8(pv, 101) == 1;
        registry[key].featuredTimestamp  = _readU64(pv, 102);
    }

    // ── View helpers ────────────────────────────────────────────────

    function getAggregate(bytes32 key) external view returns (
        uint32 tradeCount,
        uint32 winCount,
        int64 totalPnl,
        uint64 totalCollateral,
        uint64 startTimestamp,
        uint64 endTimestamp,
        uint256 verifiedAt
    ) {
        VerifiedAlpha storage a = registry[key];
        return (a.tradeCount, a.winCount, a.totalPnl, a.totalCollateral, a.startTimestamp, a.endTimestamp, a.verifiedAt);
    }

    function getFeatured(bytes32 key) external view returns (
        uint64 featuredTradeId,
        uint32 featuredPairIndex,
        bool featuredIsBuy,
        uint32 featuredLeverage,
        uint64 featuredCollateral,
        uint128 featuredEntryPrice,
        bool featuredIsOpen,
        uint64 featuredTimestamp
    ) {
        VerifiedAlpha storage a = registry[key];
        return (a.featuredTradeId, a.featuredPairIndex, a.featuredIsBuy, a.featuredLeverage, a.featuredCollateral, a.featuredEntryPrice, a.featuredIsOpen, a.featuredTimestamp);
    }

    function getTraderAlphaCount(address trader) external view returns (uint256) {
        return traderKeys[trader].length;
    }

    function getTraderKeys(address trader) external view returns (bytes32[] memory) {
        return traderKeys[trader];
    }
}
