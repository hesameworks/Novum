// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Staking (Skeleton)
 * @notice Minimal skeleton for single-token staking with reward-per-token pattern.
 * @dev Full math and events will be implemented in the next step.
 */
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract Staking is ReentrancyGuard, Pausable, AccessControl {
    IERC20 public immutable stakingToken;
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // NOTE: reward state variables (to be added next step)
    // uint256 public rewardRate;
    // uint256 public lastUpdateTime;
    // uint256 public rewardPerTokenStored;
    // mapping(address => uint256) public userRewardPerTokenPaid;
    // mapping(address => uint256) public rewards;
    // uint256 public totalStaked;
    // mapping(address => uint256) public balances;

    constructor(IERC20 _stakingToken) {
        stakingToken = _stakingToken;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // TODO: implement stake(), withdraw(), getReward(), exit() with full reward math
}