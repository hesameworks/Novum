// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Novum Token (NOVM)
 * @notice ERC20 with RBAC, Pausable, and Burnable features for staking use-case.
 * @dev Uses OpenZeppelin modules. MINTER role can be granted to Staking contract.
 */
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract Token is ERC20, ERC20Burnable, Pausable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public immutable cap; // optional supply cap for discipline

    /**
     * @param _name Token name (e.g., "Novum")
     * @param _symbol Token symbol (e.g., "NOVM")
     * @param _cap Maximum supply in wei (set to 0 for uncapped)
     */
    constructor(string memory _name, string memory _symbol, uint256 _cap) ERC20(_name, _symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        cap = _cap; // 0 = uncapped
        // NOTE: No initial mint. Admin may mint to bootstrap liquidity or rewards.
    }

    /// @notice Pause all token transfers (except mint/burn checks) — admin-only.
    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }

    /// @notice Unpause transfers — admin-only.
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    /// @notice Mint new tokens — requires MINTER_ROLE and respects cap.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (cap != 0) {
            require(totalSupply() + amount <= cap, "Cap exceeded");
        }
        _mint(to, amount);
    }

    /// @dev Block transfers while paused.
    function _update(address from, address to, uint256 value) internal override(ERC20) {
        require(!paused(), "Token is paused");
        super._update(from, to, value);
    }
}
