const {
  time,
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

describe("Lending", function () {
  async function deployAndBorrowFixture() {
    const [owner, addr1, addr2, addr3, usdtMintAccount] =
      await ethers.getSigners();
    const USDTToken = await ethers.getContractFactory("MyToken");
    // const usdtToken = await USDTToken.deploy("token", "USDT");
    const usdtToken = await USDTToken.connect(usdtMintAccount).deploy(
      "token",
      "USDT"
    );

    const Lending = await ethers.getContractFactory("Lending");
    const myLending = await Lending.deploy(usdtToken);

    const amountContract = ethers.parseEther("10000000");
    await usdtToken.transfer(myLending, amountContract);

    const amountBorrow = ethers.parseEther("10");
    const borrowTime = 3000000000;

    await time.increaseTo(borrowTime - 1);
    await myLending.borrow(amountBorrow);

    await myLending.connect(addr2).borrow(amountBorrow);

    return {
      myLending,
      addr1,
      addr2,
      addr3,
      usdtToken,
      owner,
      amountContract,
      amountBorrow,
      borrowTime,
    };
  }
  describe("Deployment & Borrow", function () {
    it("Should set the right borrow amount", async function () {
      const { myLending, amountBorrow } = await loadFixture(
        deployAndBorrowFixture
      );
      const amount = await myLending.borrowAmount();
      expect(amount).to.equal(amountBorrow);
    });
    it("Should set the right borrow time", async function () {
      const { myLending, borrowTime } = await loadFixture(
        deployAndBorrowFixture
      );
      const amount = await myLending.borrowTime();
      expect(amount).to.equal(borrowTime);
    });
    describe("Validations", function () {
      it("Should revert with the right error if borrow with not enough usdt", async function () {
        const { myLending, addr1, amountContract } = await loadFixture(
          deployAndBorrowFixture
        );

        await expect(
          myLending.connect(addr1).borrow(amountContract)
        ).to.be.revertedWith("No token in contract enough");
      });
      it("Should revert with the right error if borrow again", async function () {
        const { myLending, amountBorrow } = await loadFixture(
          deployAndBorrowFixture
        );

        await expect(myLending.borrow(amountBorrow)).to.be.revertedWith(
          "repay first"
        );
      });
      it("Shouldn't fail if borrow normally", async function () {
        const { myLending, addr1, amountBorrow } = await loadFixture(
          deployAndBorrowFixture
        );

        await expect(myLending.connect(addr1).borrow(amountBorrow)).not.to.be
          .reverted;
      });
      describe("Transfers", function () {
        it("USDT in Contract after borrow", async function () {
          const { myLending, usdtToken, amountContract, amountBorrow } =
            await loadFixture(deployAndBorrowFixture);

          const contractBalance = await usdtToken.balanceOf(myLending);
          expect(contractBalance).to.equal(
            amountContract - amountBorrow - amountBorrow
          );
        });
        it("USDT in User after borrow", async function () {
          const { usdtToken, owner, amountBorrow } = await loadFixture(
            deployAndBorrowFixture
          );

          const userBalance = await usdtToken.balanceOf(owner);
          expect(userBalance).to.equal(amountBorrow);
        });
      });
    });
    describe("Events", function () {
      it("Should emit an event on borrow", async function () {
        const { myLending, addr3, amountBorrow } = await loadFixture(
          deployAndBorrowFixture
        );
        await expect(myLending.connect(addr3).borrow(amountBorrow))
          .to.emit(myLending, "Borrow")
          .withArgs(addr3.address, amountBorrow, anyValue);
      });
    });
  });
  describe("Repay", function () {
    describe("Validations", function () {
      it("Should revert with the right error if user have not enough usdt to repay", async function () {
        const { myLending, addr2, usdtToken, borrowTime } = await loadFixture(
          deployAndBorrowFixture
        );
        // await usdtToken.transfer(addr2, ethers.parseEther("1"));
        await time.increaseTo(borrowTime - 1 + 1000000 * 1); // pay 10% interest

        await usdtToken
          .connect(addr2)
          .approve(myLending, ethers.parseEther("11"));

        await expect(myLending.connect(addr2).repay()).to.be.revertedWith(
          "No token in sender enough"
        );
      });
      it("Should revert with the right error if never borrow", async function () {
        const { myLending, addr3, usdtToken, borrowTime } = await loadFixture(
          deployAndBorrowFixture
        );
        await usdtToken.transfer(addr3, ethers.parseEther("1"));
        await time.increaseTo(borrowTime - 1 + 1000000 * 1); // pay 10% interest

        await usdtToken
          .connect(addr3)
          .approve(myLending, ethers.parseEther("11"));

        await expect(myLending.connect(addr3).repay()).to.be.revertedWith(
          "Doesnt have a debt to pay"
        );
      });
      it("Shouldn't fail if have token to pay interest 1 period of time", async function () {
        const { myLending, addr2, usdtToken, borrowTime } = await loadFixture(
          deployAndBorrowFixture
        );
        await usdtToken.transfer(addr2, ethers.parseEther("1"));
        await time.increaseTo(borrowTime - 1 + 1000000 * 1); // pay 10% interest

        await usdtToken
          .connect(addr2)
          .approve(myLending, ethers.parseEther("11"));

        await expect(myLending.connect(addr2).repay()).not.to.be.reverted;
      });

      it("Shouldn't fail if have token to pay interest n periods of time", async function () {
        const { myLending, addr2, usdtToken, borrowTime } = await loadFixture(
          deployAndBorrowFixture
        );
        const n = 3;
        await usdtToken.transfer(addr2, ethers.parseEther(String(n)));
        await time.increaseTo(borrowTime - 1 + 1000000 * n); // pay 10% interest

        await usdtToken
          .connect(addr2)
          .approve(myLending, ethers.parseEther(String(10 + n)));

        await expect(myLending.connect(addr2).repay()).not.to.be.reverted;
      });
    });
    describe("Transfers", function () {
      it("USDT in Contract after repay", async function () {
        const {
          myLending,
          addr2,
          usdtToken,
          borrowTime,
          amountContract,
          amountBorrow,
        } = await loadFixture(deployAndBorrowFixture);
        await usdtToken.transfer(addr2, ethers.parseEther("1"));
        await time.increaseTo(borrowTime - 1 + 1000000 * 1); // pay 10% interest

        await usdtToken
          .connect(addr2)
          .approve(myLending, ethers.parseEther("11"));

        await myLending.connect(addr2).repay();
        const contractBalance = await usdtToken.balanceOf(myLending);
        const interest = ethers.parseEther("1");
        expect(contractBalance).to.equal(
          amountContract - amountBorrow + interest
        );
      });
      it("USDT in User after repay", async function () {
        const { myLending, addr2, usdtToken, borrowTime } = await loadFixture(
          deployAndBorrowFixture
        );
        await usdtToken.transfer(addr2, ethers.parseEther("1"));
        await time.increaseTo(borrowTime - 1 + 1000000 * 1); // pay 10% interest

        await usdtToken
          .connect(addr2)
          .approve(myLending, ethers.parseEther("11"));

        await myLending.connect(addr2).repay();
        const contractBalance = await usdtToken.balanceOf(addr2);
        expect(contractBalance).to.equal(ethers.parseEther("0"));
      });
    });
    describe("Events", function () {
      it("Should emit an event on repay", async function () {
        const { myLending, addr2, owner, usdtToken, borrowTime, amountBorrow } =
          await loadFixture(deployAndBorrowFixture);
        await usdtToken.transfer(addr2, ethers.parseEther("1"));
        await time.increaseTo(borrowTime - 1 + 1000000 * 1); // pay 10% interest
        await usdtToken
          .connect(addr2)
          .approve(myLending, ethers.parseEther("11"));

        await expect(myLending.connect(addr2).repay())
          .to.emit(myLending, "Repay")
          .withArgs(addr2.address, ethers.parseEther("11"), anyValue);
      });
    });
  });
});
