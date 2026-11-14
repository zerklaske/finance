// Prints the keccak256 hash of a local file, the value committed on-chain.
// Usage: node scripts/hash-file.js samples/inspection_DP-0001.json
const fs = require("fs");
const { keccak256 } = require("ethers");
const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/hash-file.js <file>");
  process.exit(1);
}
console.log(keccak256(fs.readFileSync(file)));
