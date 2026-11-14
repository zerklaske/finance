// Educational project. Only the built-in Hardhat network and a local node are configured.
// There is deliberately no public testnet or mainnet entry and no private key in this file.
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
  },
  gasReporter: { enabled: process.env.REPORT_GAS === "true" },
};
