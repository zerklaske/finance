// Educational project for the course Introduction to Finance.
// Runs the full DevicePass use case on a LOCAL Hardhat network with test accounts
// and fictional records. Usage:
//   npx hardhat run scripts/demo.js                      (in-process network)
//   npx hardhat node  +  npx hardhat run scripts/demo.js --network localhost
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const RecordType = { Inspection: 0, Repair: 1, Warranty: 2 };
const TYPE_NAME = ["Inspection", "Repair", "Warranty"];
const SAMPLES = path.join(__dirname, "..", "samples");

function fileHash(name) {
  return ethers.keccak256(fs.readFileSync(path.join(SAMPLES, name)));
}
function step(n, text) {
  console.log(`\n=== Step ${n}: ${text} ===`);
}
// The local node returns raw revert data; decode the custom error by name via the ABI.
function reason(contract, e) {
  try {
    // In-process network gives a hex string; a JSON-RPC node gives { message, data }.
    const data = typeof e.data === "string" ? e.data : e.data?.data;
    const parsed = contract.interface.parseError(data);
    if (parsed) return `custom error ${parsed.name}(${parsed.args.join(", ")})`;
  } catch {}
  return e.shortMessage || e.message.split("\n")[0];
}
function short(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function main() {
  if (!["hardhat", "localhost"].includes(network.name)) {
    throw new Error("This demo runs only on the local Hardhat network.");
  }
  const [admin, shop, service, buyer] = await ethers.getSigners();
  console.log("DevicePass prototype demo (educational, local network:", network.name + ")");
  console.log(`Test accounts -> admin ${short(admin.address)}, shop ${short(shop.address)}, ` +
    `service centre ${short(service.address)}, buyer ${short(buyer.address)}`);

  step(1, "Deploy PassportRegistry");
  const Registry = await ethers.getContractFactory("PassportRegistry");
  const registry = await Registry.deploy(admin.address);
  await registry.waitForDeployment();
  console.log("Contract deployed at", await registry.getAddress());

  step(2, "Admin admits a shop and a service centre as issuers");
  await (await registry.grantRole(await registry.SHOP_ROLE(), shop.address)).wait();
  await (await registry.grantRole(await registry.SERVICE_ROLE(), service.address)).wait();
  console.log("SHOP_ROLE ->", short(shop.address), "| SERVICE_ROLE ->", short(service.address));

  step(3, "Shop registers passport DP-0001 with a random id (no IMEI on-chain)");
  const passportId = ethers.hexlify(ethers.randomBytes(32));
  await (await registry.connect(shop).registerPassport(passportId)).wait();
  console.log("Passport id:", passportId);

  step(4, "Service centre commits the inspection report hash");
  const inspHash = fileHash("inspection_DP-0001.json");
  await (await registry.connect(service).addRecord(passportId, RecordType.Inspection, inspHash)).wait();
  console.log("Record #1 Inspection, hash", inspHash);

  step(5, "Service centre adds a repair, shop adds a warranty");
  await (await registry.connect(service).addRecord(passportId, RecordType.Repair, fileHash("repair_DP-0001.json"))).wait();
  await (await registry.connect(shop).addRecord(passportId, RecordType.Warranty, fileHash("warranty_DP-0001.json"))).wait();
  console.log("Record #2 Repair, Record #3 Warranty");

  step(6, "Access control: the shop tries to add a repair (should fail)");
  try {
    await registry.connect(shop).addRecord(passportId, RecordType.Repair, inspHash);
    console.log("UNEXPECTED: write succeeded");
  } catch (e) {
    console.log("Rejected as expected:", reason(registry, e));
  }

  step(7, "Buyer verifies the original report and a tampered copy");
  let v = await registry.connect(buyer).verifyRecord(1, inspHash);
  console.log("Original file  -> exists:", v.exists, "| matches:", v.matches, "| current:", v.isCurrent);
  v = await registry.connect(buyer).verifyRecord(1, fileHash("inspection_DP-0001_ALTERED.json"));
  console.log("Altered file   -> exists:", v.exists, "| matches:", v.matches, " <- tampering detected");

  step(8, "Service centre corrects its inspection (history is kept)");
  const corrected = ethers.keccak256(ethers.toUtf8Bytes("corrected inspection DP-0001 v2 (fictional)"));
  await (await registry.connect(service).supersedeRecord(1, corrected)).wait();
  v = await registry.verifyRecord(1, inspHash);
  console.log("Record #1 still matches:", v.matches, "| but current:", v.isCurrent, "-> replaced by #4");

  step(9, "Passport history as the buyer sees it");
  const ids = await registry.getPassportRecords(passportId);
  for (const id of ids) {
    const r = await registry.getRecord(id);
    const note = r.supersededBy !== 0n ? ` (corrected by #${r.supersededBy})` :
      r.supersedes !== 0n ? ` (corrects #${r.supersedes})` : "";
    console.log(`#${id} ${TYPE_NAME[Number(r.recordType)].padEnd(10)} issuer ${short(r.issuer)}${note}`);
  }

  step(10, "Emergency pause: writes stop, verification keeps working");
  await (await registry.pause()).wait();
  try {
    await registry.connect(shop).registerPassport(ethers.hexlify(ethers.randomBytes(32)));
  } catch (e) {
    console.log("Write while paused rejected:", reason(registry, e));
  }
  v = await registry.verifyRecord(4, corrected);
  console.log("Verification while paused -> matches:", v.matches);
  await (await registry.unpause()).wait();

  console.log("\nDemo finished. Fictional data only, no real funds or digital assets.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
