import { expect } from "chai";
import { ethers, network } from "hardhat";

const describeIf = (condition: boolean) => (condition ? describe : describe.skip);

async function resetFork(url: string, blockNumber?: number) {
  await network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: url,
          blockNumber
        }
      }
    ]
  });
}

describeIf(Boolean(process.env.MAINNET_RPC_URL && process.env.MAINNET_CHAINLINK_FEED))(
  "Fork: Chainlink mainnet",
  function () {
    before(async function () {
      const blockNumber = process.env.MAINNET_FORK_BLOCK ? Number(process.env.MAINNET_FORK_BLOCK) : undefined;
      await resetFork(process.env.MAINNET_RPC_URL as string, blockNumber);
    });

    it("reads latest price data", async function () {
      const feedAddress = process.env.MAINNET_CHAINLINK_FEED as string;
      const feed = await ethers.getContractAt("AggregatorV3Interface", feedAddress);
      const [roundId, answer,, updatedAt, answeredInRound] = await feed.latestRoundData();

      expect(answer).to.be.greaterThan(0);
      expect(updatedAt).to.be.greaterThan(0);
      expect(answeredInRound).to.be.greaterThanOrEqual(roundId);
    });
  }
);

describeIf(Boolean(process.env.MAINNET_RPC_URL && process.env.MAINNET_ERC20_ADDRESS))(
  "Fork: mainnet ERC20",
  function () {
    before(async function () {
      const blockNumber = process.env.MAINNET_FORK_BLOCK ? Number(process.env.MAINNET_FORK_BLOCK) : undefined;
      await resetFork(process.env.MAINNET_RPC_URL as string, blockNumber);
    });

    it("reads token supply and decimals", async function () {
      const tokenAddress = process.env.MAINNET_ERC20_ADDRESS as string;
      const erc20 = new ethers.Contract(
        tokenAddress,
        ["function totalSupply() view returns (uint256)", "function decimals() view returns (uint8)"],
        ethers.provider
      );

      const totalSupply = await erc20.totalSupply();
      const decimals = await erc20.decimals();

      expect(totalSupply).to.be.greaterThan(0);
      expect(decimals).to.be.greaterThan(0);
    });
  }
);

describeIf(Boolean(process.env.MAINNET_RPC_URL))(
  "Fork: Mainnet WETH",
  function () {
    before(async function () {
      await resetFork(process.env.MAINNET_RPC_URL as string);
    });

    it("reads WETH decimals on mainnet", async function () {
      const abi = ["function decimals() view returns (uint8)"];
      const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
      const weth = await ethers.getContractAt(abi, wethAddress);
      const decimals = await weth.decimals();

      expect(decimals).to.equal(18);
    });
  }
);
