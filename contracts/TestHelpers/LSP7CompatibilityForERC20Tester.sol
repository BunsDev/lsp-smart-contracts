// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

// modules
import '../LSP7/extensions/LSP7CompatibilityForERC20.sol';
import '../LSP7/LSP7.sol';

contract LSP7CompatibilityForERC20Tester is LSP7, LSP7CompatibilityForERC20 {
    constructor(
      string memory name,
      string memory symbol,
      address newOwner
    ) LSP7(name, symbol, newOwner) {}

    function mint(address to, uint256 amount, bytes calldata data) public {
        // using force=true so we can send to EOA in test
        _mint(to, amount, true, data);
    }
}