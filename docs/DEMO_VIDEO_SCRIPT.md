# Demo video script (max 3 minutes)

Educational project. Record only the local Hardhat network. Never show `.env`, private keys, seed phrases or personal data.

Setup before recording: VS Code with the repository open, two terminals side by side, font size large (at least 18 pt), `npm install` already done.

| Time | On screen | What to say (or caption) |
|---|---|---|
| 0:00–0:15 | README top with the educational notice | "This is the DevicePass prototype for Introduction to Finance. It runs only on a local Hardhat network with test accounts and fictional data." |
| 0:15–0:35 | `contracts/PassportRegistry.sol`, scroll over roles and `addRecord` | "The contract stores only hashes of inspection, repair and warranty documents. Shops, service centres and the admin have separate roles." |
| 0:35–0:50 | Terminal 1: `npx hardhat node` | "We start a local blockchain. These are test accounts created by Hardhat, not real wallets." (Do not zoom in on the private keys it prints; scroll past or crop.) |
| 0:50–1:05 | Terminal 2: `npx hardhat run scripts/deploy.js --network localhost` | "We deploy PassportRegistry to the local node. Here is the contract address." |
| 1:05–2:10 | Terminal 2: `npx hardhat run scripts/demo.js --network localhost` and pause on each step | Step 3: "The shop registers passport DP-0001 with a random id, never an IMEI." Step 4: "The service centre commits the hash of the inspection report." Step 6: "The shop tries to add a repair and is rejected: access control." Step 7: "The buyer verifies the original file, it matches; the altered file does not." Step 8: "A correction keeps the old record and points to the new one." Step 10: "Pause stops writes but verification still works." |
| 2:10–2:45 | Terminal 2: `npx hardhat test` | "Finally, the ten unit tests: all passing." Keep the "10 passing" line on screen for 3 seconds. |
| 2:45–3:00 | Repository page on GitHub | "The code, tests and this video link are in the repository. Thank you." |

Tip: `npx hardhat node` prints the private keys of its test accounts. They are public Hardhat defaults, but the course rules say never to show keys, so start recording after that output or blur it.
