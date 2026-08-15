const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// ======================================================
// SCHEMA
// ======================================================

const WebAuthSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    pinHash: {
      type: String,
      default: ""
    },

    pinCreatedAt: {
      type: Date,
      default: null
    },

    pinExpiresAt: {
      type: Date,
      default: null
    },

    failedAttempts: {
      type: Number,
      default: 0
    },

    lockedUntil: {
      type: Date,
      default: null
    },

    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// ======================================================
// MODEL
// ======================================================

const WebAuth =
  mongoose.models.WebAuth ||
  mongoose.model(
    "WebAuth",
    WebAuthSchema
  );

// ======================================================
// NORMALIZE PHONE
// ======================================================

function normalizePhone(phone = "") {
  return String(phone)
    .replace(/[^0-9]/g, "")
    .trim();
}

// ======================================================
// GENERATE 5 DIGIT PIN
// ======================================================

function generatePin() {
  return String(
    crypto.randomInt(
      10000,
      100000
    )
  );
}

// ======================================================
// CREATE / REPLACE PIN
// ======================================================

async function createWebPin(
  phone,
  expiresMinutes = 30
) {
  const cleanPhone =
    normalizePhone(phone);

  if (!cleanPhone) {
    throw new Error(
      "Invalid phone number."
    );
  }

  const pin =
    generatePin();

  const pinHash =
    await bcrypt.hash(
      pin,
      12
    );

  const now =
    new Date();

  const expiresAt =
    new Date(
      now.getTime() +
      expiresMinutes *
        60 *
        1000
    );

  await WebAuth.findOneAndUpdate(
    {
      phone:
        cleanPhone
    },
    {
      $set: {
        pinHash,
        pinCreatedAt:
          now,
        pinExpiresAt:
          expiresAt,
        failedAttempts:
          0,
        lockedUntil:
          null
      }
    },
    {
      upsert: true,
      new: true
    }
  );

  return {
    phone:
      cleanPhone,

    pin,

    expiresAt
  };
}

// ======================================================
// VERIFY PIN
// ======================================================

async function verifyWebPin(
  phone,
  pin
) {
  const cleanPhone =
    normalizePhone(phone);

  const cleanPin =
    String(pin || "")
      .trim();

  if (
    !cleanPhone ||
    !/^\d{5}$/.test(
      cleanPin
    )
  ) {
    return {
      success: false,
      reason:
        "INVALID_INPUT"
    };
  }

  const record =
    await WebAuth.findOne({
      phone:
        cleanPhone
    });

  if (!record) {
    return {
      success: false,
      reason:
        "NOT_FOUND"
    };
  }

  const now =
    new Date();

  // ===============================================
  // TEMPORARY LOCK
  // ===============================================

  if (
    record.lockedUntil &&
    record.lockedUntil >
      now
  ) {
    return {
      success: false,
      reason:
        "LOCKED",
      lockedUntil:
        record.lockedUntil
    };
  }

  // ===============================================
  // PIN MISSING
  // ===============================================

  if (!record.pinHash) {
    return {
      success: false,
      reason:
        "NO_PIN"
    };
  }

  // ===============================================
  // EXPIRED
  // ===============================================

  if (
    record.pinExpiresAt &&
    record.pinExpiresAt <
      now
  ) {
    return {
      success: false,
      reason:
        "EXPIRED"
    };
  }

  // ===============================================
  // VERIFY HASH
  // ===============================================

  const valid =
    await bcrypt.compare(
      cleanPin,
      record.pinHash
    );

  if (!valid) {
    record.failedAttempts =
      Number(
        record.failedAttempts ||
          0
      ) + 1;

    // Lock for 15 minutes after 5 failed attempts
    if (
      record.failedAttempts >=
      5
    ) {
      record.lockedUntil =
        new Date(
          now.getTime() +
            15 *
              60 *
              1000
        );

      record.failedAttempts =
        0;
    }

    await record.save();

    return {
      success: false,
      reason:
        "WRONG_PIN"
    };
  }

  // ===============================================
  // SUCCESS
  // ===============================================

  record.failedAttempts =
    0;

  record.lockedUntil =
    null;

  record.lastLoginAt =
    now;

  await record.save();

  return {
    success: true,
    phone:
      cleanPhone
  };
}

// ======================================================
// GET AUTH INFO
// ======================================================

async function getWebAuth(
  phone
) {
  const cleanPhone =
    normalizePhone(phone);

  if (!cleanPhone) {
    return null;
  }

  return WebAuth.findOne({
    phone:
      cleanPhone
  });
}

// ======================================================
// REMOVE PIN
// ======================================================

async function removeWebPin(
  phone
) {
  const cleanPhone =
    normalizePhone(phone);

  if (!cleanPhone) {
    return false;
  }

  await WebAuth.updateOne(
    {
      phone:
        cleanPhone
    },
    {
      $set: {
        pinHash: "",
        pinCreatedAt:
          null,
        pinExpiresAt:
          null,
        failedAttempts:
          0,
        lockedUntil:
          null
      }
    }
  );

  return true;
}

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  WebAuth,
  normalizePhone,
  generatePin,
  createWebPin,
  verifyWebPin,
  getWebAuth,
  removeWebPin
};