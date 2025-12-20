// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ISafe
 * @notice Interface for Safe (Gnosis Safe) wallet
 */
interface ISafe {
    /**
     * @notice Execute a transaction from a module
     * @param to Destination address
     * @param value Ether value
     * @param data Data payload
     * @param operation Operation type (0 = Call, 1 = DelegateCall)
     * @return success True if execution was successful
     */
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes memory data,
        uint8 operation
    ) external returns (bool success);
    
    /**
     * @notice Enable a module
     * @param module Module address to enable
     */
    function enableModule(address module) external;
    
    /**
     * @notice Disable a module
     * @param prevModule Previous module in linked list
     * @param module Module address to disable
     */
    function disableModule(address prevModule, address module) external;
    
    /**
     * @notice Check if module is enabled
     * @param module Module address to check
     * @return True if module is enabled
     */
    function isModuleEnabled(address module) external view returns (bool);
    
    /**
     * @notice Get array of modules
     * @return Array of module addresses
     */
    function getModules() external view returns (address[] memory);
}
