// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "./Math.sol";

contract Lending is Context, Ownable, Math {
    using SafeMath for uint256;
    struct UserData {
        uint256 amount;
        uint256 time;
    }
    mapping(address => UserData) private usersBorrowed;
    IERC20 private token;

    event Borrow(address who, uint amount, uint when);
    event Repay(address who, uint amount, uint when);

    constructor(address _token){
        token = IERC20(_token);
    }
   
    function borrow(uint256 _amount) external {
        uint256 contractBalance = token.balanceOf(address(this));
        require(_amount <= contractBalance, "No token in contract enough");
        require(usersBorrowed[_msgSender()].amount == 0, "repay first");
        usersBorrowed[_msgSender()].amount = _amount;
        usersBorrowed[_msgSender()].time = block.timestamp;
        emit Borrow(_msgSender(),_amount, block.timestamp);
        token.transfer(_msgSender(),_amount);
    }
    // function _withdrawToken( uint256 _amount) internal {
    //     token.transfer(_msgSender(),_amount);
    // }

    function repay() external {
        require(usersBorrowed[_msgSender()].amount > 0, "Doesnt have a debt to pay");
        uint256 paid = calculateDebt();
        uint256 userBalance = token.balanceOf(_msgSender());
        require(paid <= userBalance, "No token in sender enough");
        usersBorrowed[_msgSender()].amount = 0;
        usersBorrowed[_msgSender()].time = 0;
        emit Repay(_msgSender(),paid, block.timestamp);
        token.transferFrom(_msgSender(),address(this),paid);
    }
    // function _depositToken( uint256 _amount) internal {
    //     token.approve(address(this), _amount);
    //     token.transferFrom(_msgSender(),address(this),_amount);
    // }

    function borrowAmount() public view returns (uint256) {
        return usersBorrowed[_msgSender()].amount;
    }
    function borrowTime() public view returns (uint256) {
        return usersBorrowed[_msgSender()].time;
    }

    function calculateDebt() public view returns (uint256) {// 10% every million block
        uint256 amount = usersBorrowed[_msgSender()].amount;

        uint256 difTime = (block.timestamp - usersBorrowed[_msgSender()].time)* 10 ** 18;
        uint256 borrowRate = mulExp(0.1 * 1e12, difTime); // 1e18 div million = 1e12
        uint256 interest = mulExp(amount, borrowRate);
        return interest + amount;
    }
}