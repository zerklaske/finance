// Educational project. Local Hardhat network, test accounts and fictional data only.
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const RecordType = { Inspection: 0, Repair: 1, Warranty: 2 };

// Fictional data: passport id is a hash of a test label, never a real IMEI.
const PASSPORT = ethers.id("DP-0001/test-salt-7f3a");
const UNKNOWN_PASSPORT = ethers.id("DP-9999/not-registered");
const docHash = (text) => ethers.keccak256(ethers.toUtf8Bytes(text));

const INSPECTION_V1 = docHash('{"passport":"DP-0001","model":"TestPhone A","display":"replaced","battery":"87%"}');
const INSPECTION_V2 = docHash('{"passport":"DP-0001","model":"TestPhone A","display":"replaced","battery":"86%"}');
const REPAIR_DOC = docHash('{"passport":"DP-0001","repair":"battery replaced","by":"Fictional Service Centre A"}');
const WARRANTY_DOC = docHash('{"passport":"DP-0001","warranty":"90 days, display and battery"}');

describe("PassportRegistry", function () {
  async function deployFixture() {
    const [admin, shop, service, outsider, otherShop] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("PassportRegistry");
    const registry = await Registry.deploy(admin.address);
    await registry.waitForDeployment();

    await registry.grantRole(await registry.SHOP_ROLE(), shop.address);
    await registry.grantRole(await registry.SHOP_ROLE(), otherShop.address);
    await registry.grantRole(await registry.SERVICE_ROLE(), service.address);
    return { registry, admin, shop, service, outsider, otherShop };
  }

  async function withPassportFixture() {
    const f = await deployFixture();
    await f.registry.connect(f.shop).registerPassport(PASSPORT);
    await f.registry.connect(f.shop).addRecord(PASSPORT, RecordType.Inspection, INSPECTION_V1); // record 1
    return f;
  }

  it("1. gives the admin the governance and pauser roles at deployment", async function () {
    const { registry, admin, outsider } = await loadFixture(deployFixture);
    expect(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    expect(await registry.hasRole(await registry.PAUSER_ROLE(), admin.address)).to.equal(true);
    expect(await registry.hasRole(await registry.SHOP_ROLE(), outsider.address)).to.equal(false);
    expect(await registry.nextRecordId()).to.equal(1n);
  });

  it("2. lets a shop register a passport once and rejects duplicates and zero ids", async function () {
    const { registry, shop } = await loadFixture(deployFixture);
    await expect(registry.connect(shop).registerPassport(PASSPORT))
      .to.emit(registry, "PassportRegistered")
      .withArgs(PASSPORT, shop.address);

    const p = await registry.getPassport(PASSPORT);
    expect(p.exists).to.equal(true);
    expect(p.registeredBy).to.equal(shop.address);

    await expect(registry.connect(shop).registerPassport(PASSPORT))
      .to.be.revertedWithCustomError(registry, "PassportAlreadyExists")
      .withArgs(PASSPORT);
    await expect(registry.connect(shop).registerPassport(ethers.ZeroHash))
      .to.be.revertedWithCustomError(registry, "InvalidPassportId");
  });

  it("3. blocks accounts without SHOP_ROLE from registering passports (access control)", async function () {
    const { registry, outsider, service } = await loadFixture(deployFixture);
    const shopRole = await registry.SHOP_ROLE();
    await expect(registry.connect(outsider).registerPassport(PASSPORT))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
      .withArgs(outsider.address, shopRole);
    // A service centre is an issuer, but not a shop.
    await expect(registry.connect(service).registerPassport(PASSPORT))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
      .withArgs(service.address, shopRole);
  });

  it("4. enforces who may add which record type", async function () {
    const { registry, shop, service, outsider } = await loadFixture(withPassportFixture);

    // Service centre adds a repair: allowed.
    await expect(registry.connect(service).addRecord(PASSPORT, RecordType.Repair, REPAIR_DOC))
      .to.emit(registry, "RecordAdded")
      .withArgs(2n, PASSPORT, RecordType.Repair, REPAIR_DOC, service.address);
    // Shop adds a warranty: allowed.
    await registry.connect(shop).addRecord(PASSPORT, RecordType.Warranty, WARRANTY_DOC);

    // Shop cannot claim a repair, service centre cannot issue a warranty.
    await expect(registry.connect(shop).addRecord(PASSPORT, RecordType.Repair, REPAIR_DOC))
      .to.be.revertedWithCustomError(registry, "NotAllowedForRecordType")
      .withArgs(shop.address, RecordType.Repair);
    await expect(registry.connect(service).addRecord(PASSPORT, RecordType.Warranty, WARRANTY_DOC))
      .to.be.revertedWithCustomError(registry, "NotAllowedForRecordType")
      .withArgs(service.address, RecordType.Warranty);
    await expect(registry.connect(outsider).addRecord(PASSPORT, RecordType.Inspection, INSPECTION_V1))
      .to.be.revertedWithCustomError(registry, "NotAllowedForRecordType");

    expect([...(await registry.getPassportRecords(PASSPORT))]).to.deep.equal([1n, 2n, 3n]);
  });

  it("5. rejects records for unknown passports and empty document hashes", async function () {
    const { registry, shop } = await loadFixture(withPassportFixture);
    await expect(registry.connect(shop).addRecord(UNKNOWN_PASSPORT, RecordType.Inspection, INSPECTION_V1))
      .to.be.revertedWithCustomError(registry, "PassportNotFound")
      .withArgs(UNKNOWN_PASSPORT);
    await expect(registry.connect(shop).addRecord(PASSPORT, RecordType.Inspection, ethers.ZeroHash))
      .to.be.revertedWithCustomError(registry, "InvalidDocumentHash");
  });

  it("6. verifies an unchanged document and detects an altered or unknown one", async function () {
    const { registry, outsider } = await loadFixture(withPassportFixture);
    // Anyone (e.g. a buyer) can verify, no role needed.
    const ok = await registry.connect(outsider).verifyRecord(1, INSPECTION_V1);
    expect([ok.exists, ok.matches, ok.isCurrent]).to.deep.equal([true, true, true]);

    const altered = await registry.verifyRecord(1, INSPECTION_V2);
    expect([altered.exists, altered.matches, altered.isCurrent]).to.deep.equal([true, false, true]);

    const missing = await registry.verifyRecord(42, INSPECTION_V1);
    expect([missing.exists, missing.matches, missing.isCurrent]).to.deep.equal([false, false, false]);
  });

  it("7. lets only the original issuer correct a record and keeps the full history", async function () {
    const { registry, shop, otherShop } = await loadFixture(withPassportFixture);

    await expect(registry.connect(otherShop).supersedeRecord(1, INSPECTION_V2))
      .to.be.revertedWithCustomError(registry, "NotOriginalIssuer")
      .withArgs(otherShop.address, 1n);

    await expect(registry.connect(shop).supersedeRecord(1, INSPECTION_V2))
      .to.emit(registry, "RecordSuperseded")
      .withArgs(1n, 2n, shop.address);

    const oldRec = await registry.getRecord(1);
    const newRec = await registry.getRecord(2);
    expect(oldRec.supersededBy).to.equal(2n);
    expect(newRec.supersedes).to.equal(1n);
    expect(newRec.documentHash).to.equal(INSPECTION_V2);

    // The old record is still readable but no longer current.
    const v = await registry.verifyRecord(1, INSPECTION_V1);
    expect([v.exists, v.matches, v.isCurrent]).to.deep.equal([true, true, false]);

    await expect(registry.connect(shop).supersedeRecord(1, INSPECTION_V2))
      .to.be.revertedWithCustomError(registry, "AlreadySuperseded")
      .withArgs(1n);
    await expect(registry.connect(shop).supersedeRecord(99, INSPECTION_V2))
      .to.be.revertedWithCustomError(registry, "RecordNotFound")
      .withArgs(99n);
  });

  it("8. emergency pause stops writes but keeps verification available", async function () {
    const { registry, admin, shop, outsider } = await loadFixture(withPassportFixture);

    await expect(registry.connect(outsider).pause())
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");

    await registry.connect(admin).pause();
    await expect(registry.connect(shop).addRecord(PASSPORT, RecordType.Warranty, WARRANTY_DOC))
      .to.be.revertedWithCustomError(registry, "EnforcedPause");
    await expect(registry.connect(shop).registerPassport(UNKNOWN_PASSPORT))
      .to.be.revertedWithCustomError(registry, "EnforcedPause");

    const v = await registry.verifyRecord(1, INSPECTION_V1);
    expect(v.matches).to.equal(true);

    await registry.connect(admin).unpause();
    await expect(registry.connect(shop).addRecord(PASSPORT, RecordType.Warranty, WARRANTY_DOC))
      .to.emit(registry, "RecordAdded");
  });

  it("9. revoking a compromised issuer key stops it from writing or correcting", async function () {
    const { registry, admin, shop } = await loadFixture(withPassportFixture);
    await registry.connect(admin).revokeRole(await registry.SHOP_ROLE(), shop.address);

    await expect(registry.connect(shop).addRecord(PASSPORT, RecordType.Inspection, INSPECTION_V2))
      .to.be.revertedWithCustomError(registry, "NotAllowedForRecordType");
    await expect(registry.connect(shop).supersedeRecord(1, INSPECTION_V2))
      .to.be.revertedWithCustomError(registry, "NotAllowedForRecordType");

    // Records written before revocation remain verifiable.
    const v = await registry.verifyRecord(1, INSPECTION_V1);
    expect(v.matches).to.equal(true);
  });

  it("10. only the admin can admit new issuers", async function () {
    const { registry, shop, outsider } = await loadFixture(deployFixture);
    const shopRole = await registry.SHOP_ROLE();
    const adminRole = await registry.DEFAULT_ADMIN_ROLE();
    await expect(registry.connect(shop).grantRole(shopRole, outsider.address))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount")
      .withArgs(shop.address, adminRole);
  });
});
