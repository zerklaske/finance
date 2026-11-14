// SPDX-License-Identifier: MIT
// Educational project for the course Introduction to Finance.
// Not a real product, service or investment offer. Do not use with real funds.
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title PassportRegistry
/// @notice Stores integrity commitments (hashes) of inspection, repair and
///         warranty documents for used smartphones. Documents themselves stay
///         off-chain. The contract holds no funds and has no token.
/// @dev    Built on OpenZeppelin AccessControl and Pausable (MIT licence).
contract PassportRegistry is AccessControl, Pausable {
    // ------------------------------------------------------------------
    // Roles
    // ------------------------------------------------------------------
    /// Retailer of inspected used phones: registers passports, adds
    /// inspections and warranty documents.
    bytes32 public constant SHOP_ROLE = keccak256("SHOP_ROLE");
    /// Repair / service centre: adds inspections and repairs.
    bytes32 public constant SERVICE_ROLE = keccak256("SERVICE_ROLE");
    /// Emergency stop. In production held by the governance multisig.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    // DEFAULT_ADMIN_ROLE (from AccessControl) admits and removes issuers.

    // ------------------------------------------------------------------
    // Data
    // ------------------------------------------------------------------
    enum RecordType {
        Inspection,
        Repair,
        Warranty
    }

    struct Passport {
        address registeredBy;
        uint64 createdAt;
        bool exists;
    }

    struct Record {
        bytes32 passportId;
        RecordType recordType;
        bytes32 documentHash; // keccak256 of the off-chain signed document
        address issuer;
        uint64 timestamp;
        uint256 supersedes; // id of the record this one corrects (0 = none)
        uint256 supersededBy; // id of the correcting record (0 = current)
    }

    mapping(bytes32 => Passport) private _passports;
    mapping(uint256 => Record) private _records;
    mapping(bytes32 => uint256[]) private _passportRecords;

    /// Record ids start at 1, so 0 always means "no record".
    uint256 public nextRecordId = 1;

    // ------------------------------------------------------------------
    // Events and errors
    // ------------------------------------------------------------------
    event PassportRegistered(bytes32 indexed passportId, address indexed shop);
    event RecordAdded(
        uint256 indexed recordId,
        bytes32 indexed passportId,
        RecordType recordType,
        bytes32 documentHash,
        address indexed issuer
    );
    event RecordSuperseded(uint256 indexed oldRecordId, uint256 indexed newRecordId, address indexed issuer);

    error InvalidPassportId();
    error InvalidDocumentHash();
    error PassportAlreadyExists(bytes32 passportId);
    error PassportNotFound(bytes32 passportId);
    error RecordNotFound(uint256 recordId);
    error NotAllowedForRecordType(address account, RecordType recordType);
    error NotOriginalIssuer(address account, uint256 recordId);
    error AlreadySuperseded(uint256 recordId);

    // ------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------
    /// @param admin Governance account. On the local network this is a
    ///        Hardhat test account; in a production design it would be a
    ///        2-of-3 multisignature wallet.
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ------------------------------------------------------------------
    // Write functions
    // ------------------------------------------------------------------
    /// @notice Create a passport with a random identifier (never a real IMEI).
    function registerPassport(bytes32 passportId) external onlyRole(SHOP_ROLE) whenNotPaused {
        if (passportId == bytes32(0)) revert InvalidPassportId();
        if (_passports[passportId].exists) revert PassportAlreadyExists(passportId);

        _passports[passportId] = Passport({
            registeredBy: msg.sender,
            createdAt: uint64(block.timestamp),
            exists: true
        });
        emit PassportRegistered(passportId, msg.sender);
    }

    /// @notice Commit the hash of an off-chain document to a passport.
    /// Inspection: shop or service centre. Repair: service centre only.
    /// Warranty: shop only.
    function addRecord(
        bytes32 passportId,
        RecordType recordType,
        bytes32 documentHash
    ) external whenNotPaused returns (uint256 recordId) {
        if (!_passports[passportId].exists) revert PassportNotFound(passportId);
        _checkWriteAccess(msg.sender, recordType);
        recordId = _storeRecord(passportId, recordType, documentHash, 0);
    }

    /// @notice Correct an earlier record. History is preserved: the old
    ///         record stays readable and points to its replacement.
    function supersedeRecord(uint256 oldRecordId, bytes32 newDocumentHash)
        external
        whenNotPaused
        returns (uint256 newRecordId)
    {
        Record storage oldRecord = _records[oldRecordId];
        if (oldRecord.issuer == address(0)) revert RecordNotFound(oldRecordId);
        if (oldRecord.issuer != msg.sender) revert NotOriginalIssuer(msg.sender, oldRecordId);
        if (oldRecord.supersededBy != 0) revert AlreadySuperseded(oldRecordId);
        // The issuer must still be an admitted issuer for this record type.
        _checkWriteAccess(msg.sender, oldRecord.recordType);

        newRecordId = _storeRecord(oldRecord.passportId, oldRecord.recordType, newDocumentHash, oldRecordId);
        oldRecord.supersededBy = newRecordId;
        emit RecordSuperseded(oldRecordId, newRecordId, msg.sender);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ------------------------------------------------------------------
    // Read functions (free, work even when paused)
    // ------------------------------------------------------------------
    /// @notice Compare a supplied document hash with the stored commitment.
    /// @return exists    false if the record id is unknown
    /// @return matches   true if the supplied hash equals the stored hash
    /// @return isCurrent false if the record has been corrected later
    function verifyRecord(uint256 recordId, bytes32 documentHash)
        external
        view
        returns (bool exists, bool matches, bool isCurrent)
    {
        Record storage r = _records[recordId];
        if (r.issuer == address(0)) return (false, false, false);
        return (true, r.documentHash == documentHash, r.supersededBy == 0);
    }

    function getPassport(bytes32 passportId) external view returns (Passport memory) {
        return _passports[passportId];
    }

    function getRecord(uint256 recordId) external view returns (Record memory) {
        if (_records[recordId].issuer == address(0)) revert RecordNotFound(recordId);
        return _records[recordId];
    }

    function getPassportRecords(bytes32 passportId) external view returns (uint256[] memory) {
        return _passportRecords[passportId];
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------
    function _checkWriteAccess(address account, RecordType recordType) internal view {
        bool allowed;
        if (recordType == RecordType.Inspection) {
            allowed = hasRole(SHOP_ROLE, account) || hasRole(SERVICE_ROLE, account);
        } else if (recordType == RecordType.Repair) {
            allowed = hasRole(SERVICE_ROLE, account);
        } else {
            allowed = hasRole(SHOP_ROLE, account);
        }
        if (!allowed) revert NotAllowedForRecordType(account, recordType);
    }

    function _storeRecord(
        bytes32 passportId,
        RecordType recordType,
        bytes32 documentHash,
        uint256 supersedes
    ) internal returns (uint256 recordId) {
        if (documentHash == bytes32(0)) revert InvalidDocumentHash();
        recordId = nextRecordId++;
        _records[recordId] = Record({
            passportId: passportId,
            recordType: recordType,
            documentHash: documentHash,
            issuer: msg.sender,
            timestamp: uint64(block.timestamp),
            supersedes: supersedes,
            supersededBy: 0
        });
        _passportRecords[passportId].push(recordId);
        emit RecordAdded(recordId, passportId, recordType, documentHash, msg.sender);
    }
}
