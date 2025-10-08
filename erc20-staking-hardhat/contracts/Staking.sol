// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Staking (APR-based, reward-per-token pattern)
 * @notice Single-token staking where users stake the same ERC20 used for rewards.
 *         Rewards are accrued continuously based on APR (basis points) and total staked.
 * @dev    Uses Synthetix-style rewardPerToken accounting (no loops over users).
 *         Admin must fund the reward pool with the staking token.
 *
 * Security:
 *  - Reentrancy protected on stake/withdraw/getReward/exit
 *  - Pausable for critical functions
 *  - RBAC for pausing and reward admin ops (setAPR, fundRewards)
 *
 * Math:
 *  rewardRate (token/sec) = (totalStaked * aprBps / 10000) / YEAR
 *  rewardPerToken increases as: rpt += (timeDelta * rewardRate * 1e18) / totalStaked
 */
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

contract Staking is ReentrancyGuard, Pausable, AccessControl {
    using SafeERC20 for IERC20;

    // --- Roles ---
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant REWARD_ADMIN_ROLE = keccak256("REWARD_ADMIN_ROLE");

    // --- Constants ---
    uint256 public constant PRECISION = 1e18; // for fixed-point math
    uint256 public constant YEAR = 365 days;

    // --- Immutable params ---
    IERC20 public immutable stakingToken;

    // --- Global staking state ---
    uint256 public totalStaked;
    uint256 public rewardRate;          // tokens per second (derived from aprBps and totalStaked)
    uint16  public aprBps;              // APR in basis points (e.g., 1200 = 12%)

    // --- RPT accounting ---
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    // --- Per-user state ---
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;   // accrued but not claimed
    mapping(address => uint256) public balances;  // staked balance

    // --- Events ---
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(address indexed funder, uint256 amount);
    event APRUpdated(uint16 oldAprBps, uint16 newAprBps);

    constructor(IERC20 _stakingToken) {
        stakingToken = _stakingToken;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Default: aprBps = 0; rewardRate = 0 until admin sets APR and/or users stake.
        lastUpdateTime = block.timestamp;
    }

    // -------------------------
    // Admin / Config
    // -------------------------

    /// @notice Pause critical functions.
    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }

    /// @notice Unpause.
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    /**
     * @notice Set APR in basis points. E.g., 1200 = 12% APR.
     * @dev    Updates global RPT before changing APR, then recalculates rewardRate.
     */
    function setAPR(uint16 _aprBps) external onlyRole(REWARD_ADMIN_ROLE) updateReward(address(0)) {
        emit APRUpdated(aprBps, _aprBps);
        aprBps = _aprBps;
        _recalcRewardRate();
    }

    /**
     * @notice Fund the reward pool by pulling tokens from `msg.sender`.
     * @dev    Requires prior approval on `stakingToken` for this contract.
     */
    function fundRewards(uint256 amount) external onlyRole(REWARD_ADMIN_ROLE) {
        require(amount > 0, "amount=0");
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardAdded(msg.sender, amount);
        // Note: rewardRate doesn't change here; it's derived from APR & totalStaked.
        // This call only ensures that there is enough balance to pay future claims.
    }

    // -------------------------
    // User actions
    // -------------------------

    /**
     * @notice Stake `amount` tokens.
     * @dev    Requires prior approval to this contract. Updates RPT & reward accounting first.
     */
    function stake(uint256 amount) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(amount > 0, "amount=0");
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        balances[msg.sender] += amount;
        totalStaked += amount;

        emit Staked(msg.sender, amount);

        // Update rewardRate based on the new totalStaked
        _recalcRewardRate();
    }

    /**
     * @notice Withdraw `amount` of your staked tokens.
     * @dev    Updates rewards first, then adjusts balances, then transfers.
     */
    function withdraw(uint256 amount) public nonReentrant whenNotPaused updateReward(msg.sender) {
        require(amount > 0, "amount=0");
        uint256 bal = balances[msg.sender];
        require(bal >= amount, "insufficient balance");

        balances[msg.sender] = bal - amount;
        totalStaked -= amount;

        emit Withdrawn(msg.sender, amount);

        stakingToken.safeTransfer(msg.sender, amount);

        // After changing totalStaked, adjust rewardRate
        _recalcRewardRate();
    }

    /**
     * @notice Claim your accrued rewards.
     * @dev    Validates that reward pool covers the claim (contract balance - totalStaked).
     */
    function getReward() public nonReentrant whenNotPaused updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        require(reward > 0, "no reward");
        rewards[msg.sender] = 0;

        uint256 pool = rewardPool();
        require(pool >= reward, "insufficient reward pool");

        stakingToken.safeTransfer(msg.sender, reward);
        emit RewardPaid(msg.sender, reward);
    }

    /**
     * @notice Withdraw all staked tokens and claim rewards.
     */
    function exit() external {
        uint256 bal = balances[msg.sender];
        if (bal > 0) {
            withdraw(bal);
        }
        // getReward does its own updateReward, but we've already updated it in withdraw via modifier.
        // To avoid double update, call getReward() now which will be cheap if rewards[msg.sender] is zero.
        getReward();
    }

    // -------------------------
    // Views
    // -------------------------

    /// @notice Returns the portion of contract balance available for rewards.
    function rewardPool() public view returns (uint256) {
        uint256 bal = stakingToken.balanceOf(address(this));
        if (bal <= totalStaked) return 0;
        return bal - totalStaked;
    }

    /// @notice Current reward-per-token (scaled by 1e18).
    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        uint256 timeDelta = block.timestamp - lastUpdateTime;
        // rpt += (timeDelta * rewardRate * PRECISION) / totalStaked;
        return rewardPerTokenStored + (timeDelta * rewardRate * PRECISION) / totalStaked;
    }

    /// @notice Accrued rewards for `account` up to now (not yet claimed).
    function earned(address account) public view returns (uint256) {
        uint256 rptDelta = rewardPerToken() - userRewardPerTokenPaid[account];
        return (balances[account] * rptDelta) / PRECISION + rewards[account];
    }

    // -------------------------
    // Internals
    // -------------------------

    /**
     * @dev Updates global/user reward accounting using the latest rewardPerToken.
     *      Must run before any change to balances or APR.
     */
    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    /// @dev Recalculate rewardRate from current APR and totalStaked.
    function _recalcRewardRate() internal {
        if (totalStaked == 0 || aprBps == 0) {
            rewardRate = 0;
        } else {
            // rewardRate = (totalStaked * aprBps / 10000) / YEAR;
            rewardRate = (totalStaked * uint256(aprBps)) / 10000 / YEAR;
        }
    }
}
