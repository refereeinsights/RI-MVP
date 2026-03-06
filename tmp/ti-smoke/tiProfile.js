"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZIP_PATTERN = exports.USERNAME_PATTERN = exports.SPORT_INTEREST_OPTIONS = void 0;
exports.normalizeDisplayName = normalizeDisplayName;
exports.normalizeUsername = normalizeUsername;
exports.normalizeZipCode = normalizeZipCode;
exports.normalizeSportsInterests = normalizeSportsInterests;
exports.validateSignupProfile = validateSignupProfile;
exports.extractProfileFromMetadata = extractProfileFromMetadata;
exports.SPORT_INTEREST_OPTIONS = [
    "Baseball",
    "Softball",
    "Soccer",
    "Basketball",
    "Volleyball",
    "Football",
    "Hockey",
    "Lacrosse",
    "Wrestling",
    "Cheer",
    "Track & Field",
    "Swim",
    "Tennis",
    "Golf",
    "Other",
];
exports.USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
exports.ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/;
const SPORT_INTEREST_LOOKUP = new Map(exports.SPORT_INTEREST_OPTIONS.map((value) => [value.toLowerCase(), value]));
function normalizeDisplayName(value) {
    const normalized = (value ?? "").trim();
    return normalized || null;
}
function normalizeUsername(value) {
    return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}
function normalizeZipCode(value) {
    return (value ?? "").trim();
}
function normalizeSportsInterests(values) {
    const result = [];
    const seen = new Set();
    for (const value of values) {
        const normalized = SPORT_INTEREST_LOOKUP.get((value ?? "").trim().toLowerCase());
        if (!normalized || seen.has(normalized))
            continue;
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}
function validateSignupProfile(input) {
    const displayName = normalizeDisplayName(input.name);
    const username = normalizeUsername(input.username);
    const zipCode = normalizeZipCode(input.zip);
    const sportsInterests = normalizeSportsInterests(input.sportsInterests);
    if (!exports.USERNAME_PATTERN.test(username)) {
        return {
            ok: false,
            field: "username",
            message: "Username must be 3-20 characters using letters, numbers, or underscores.",
        };
    }
    if (!exports.ZIP_PATTERN.test(zipCode)) {
        return {
            ok: false,
            field: "zip",
            message: "ZIP code must be 5 digits (or ZIP+4).",
        };
    }
    if (sportsInterests.length === 0) {
        return {
            ok: false,
            field: "sportsInterests",
            message: "Pick at least one sport interest.",
        };
    }
    return {
        ok: true,
        value: {
            displayName,
            username,
            zipCode,
            sportsInterests,
        },
    };
}
function extractProfileFromMetadata(metadata) {
    const displayName = normalizeDisplayName(typeof metadata.display_name === "string" ? metadata.display_name : null);
    const username = normalizeUsername(typeof metadata.username === "string"
        ? metadata.username
        : typeof metadata.handle === "string"
            ? metadata.handle
            : null);
    const zipCode = normalizeZipCode(typeof metadata.zip_code === "string" ? metadata.zip_code : null);
    const sportsRaw = Array.isArray(metadata.sports_interests)
        ? metadata.sports_interests.filter((value) => typeof value === "string")
        : [];
    return {
        displayName,
        username: exports.USERNAME_PATTERN.test(username) ? username : null,
        zipCode: exports.ZIP_PATTERN.test(zipCode) ? zipCode : null,
        sportsInterests: normalizeSportsInterests(sportsRaw),
    };
}
