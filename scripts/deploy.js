// Educational project. Deploys PassportRegistry to the LOCAL network only.
// Usage: npx hardhat node   (terminal 1)
//        npx hardhat run scripts/deploy.js --network localhost   (terminal 2)
const { ethers, network } = require("hardhat");

async function main() {
  if (!["hardhat", "localhost"].includes(network.name)) {
    throw new Error("Deployment is allowed only to the local Hardhat network.");
  }
  const [admin, shop, service] = await ethers.getSigners();
  const registry = await (await ethers.getContractFactory("PassportRegistry")).deploy(admin.address);
  await registry.waitForDeployment();
  await (await registry.grantRole(await registry.SHOP_ROLE(), shop.address)).wait();
  await (await registry.grantRole(await registry.SERVICE_ROLE(), service.address)).wait();
  console.log("PassportRegistry deployed to", await registry.getAddress(), "on", network.name);
  console.log("Shop test account:", shop.address);
  console.log("Service test account:", service.address);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
