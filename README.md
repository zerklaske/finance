# DevicePass: PassportRegistry prototype

> **Educational project for the course Introduction to Finance. Not a real product, service or investment offer. Do not use with real funds.**

DevicePass is a hypothetical platform for used-smartphone passports. Shops and repair centres commit the hash of signed inspection, repair and warranty documents to a permissioned ledger. Buyers can check that a document has not been changed since it was recorded. This repository contains the Final Project prototype: one smart contract, unit tests and a demo script. Everything runs on a **local Hardhat network** with Hardhat's test accounts and **fictional records**. No public testnet, no mainnet, no token and no real funds are used.

- Course: Introduction to Finance, Astana IT University, 2026-2027
- Team: Kudabay Arlan, Zhunisbay Sanzhar, Bakrov Nurzhan, Maratbekov Arslan
- **Demo video:** [Watch on Google Drive](https://drive.google.com/file/d/1fXd4VpPFpYmDMZxVbbnIt8z5ked8HCBJ/view?usp=sharing)
- Testnet contract address: not used (local network only)

## What the prototype does

`contracts/PassportRegistry.sol` stores *integrity commitments* (keccak256 hashes) of off-chain documents. The documents, real serial numbers and any personal data never go on-chain.

| Function | Who may call it | What it does |
|---|---|---|
| `registerPassport(id)` | `SHOP_ROLE` | Creates a passport with a random 32-byte id (never an IMEI) |
| `addRecord(id, Inspection, hash)` | `SHOP_ROLE` or `SERVICE_ROLE` | Commits an inspection report hash |
| `addRecord(id, Repair, hash)` | `SERVICE_ROLE` | Commits a repair document hash |
| `addRecord(id, Warranty, hash)` | `SHOP_ROLE` | Commits a warranty document hash |
| `supersedeRecord(recordId, newHash)` | Original issuer only | Corrects a record; the old one stays readable and points to the new one |
| `verifyRecord(recordId, hash)` | Anyone | Returns `exists`, `matches`, `isCurrent` |
| `grantRole` / `revokeRole` | `DEFAULT_ADMIN_ROLE` | Admits or removes issuers (production: 2-of-3 multisig) |
| `pause` / `unpause` | `PAUSER_ROLE` | Emergency stop for writes; reads keep working |

The main use case is shown in `docs/sequence.mmd` (Mermaid sequence diagram).

## How to run it

Requirements: Node.js 18 or newer (tested target: Node 20/22) and npm.

```bash
npm install           # installs Hardhat, hardhat-toolbox and OpenZeppelin Contracts
npx hardhat compile
npx hardhat test      # runs the 10 unit tests
npx hardhat run scripts/demo.js   # full use case on the in-process Hardhat network
```

To show the contract on a separately running local node (good for the demo video):

```bash
# terminal 1
npx hardhat node
# terminal 2
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/demo.js --network localhost
```

To see the hash that would be committed for a document:

```bash
node scripts/hash-file.js samples/inspection_DP-0001.json
node scripts/hash-file.js samples/inspection_DP-0001_ALTERED.json   # different hash
```

## Tests

`test/PassportRegistry.test.js` contains 10 tests:

1. Admin gets governance and pauser roles at deployment
2. Shop registers a passport once; duplicates and zero ids are rejected
3. Accounts without `SHOP_ROLE` cannot register passports
4. Each record type can be written only by the allowed role
5. Records for unknown passports and empty hashes are rejected
6. Verification detects an altered document and an unknown record
7. Only the original issuer can correct a record; history is preserved
8. Pause stops writes but not verification; only the pauser can pause
9. Revoking a compromised issuer key stops it from writing or correcting
10. Only the admin can admit new issuers

## Financial model

`finance/model.py` is the monthly model behind the report (base case, churn, receivables, tax, NPV, payback). `python3 finance/outputs.py` prints the base case and the four sensitivity scenarios. All figures are invented planning assumptions.

## Demo video

The script for the 3-minute video is in `docs/DEMO_VIDEO_SCRIPT.md`.

## Security notes

- The contract holds no funds and makes no external calls, so reentrancy has no attack surface here; this is a design choice, not an omission.
- Access control uses OpenZeppelin `AccessControl`; every write function is role-checked and tested.
- Key compromise: an issuer key can be revoked by the admin (test 9); the admin itself is planned as a multisig.
- Privacy: only random ids and hashes are stored. Never put an IMEI, a name or a phone number in a document hash input without a secret salt, and never on-chain.
- Never commit `.env` or any private key. The local network needs none.

## Credits and licence

- [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) v5 (`AccessControl`, `Pausable`), MIT licence.
- [Hardhat](https://hardhat.org/), MIT licence.
- This project: MIT licence. All records in `samples/` are fictional.
