import express from "express";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  ring_emergency_friend_on_timeout,
  send_alert_to_contacts,
} from "../services/contactManager.ts";

const router = express.Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "../data/contacts.json");

// Load contacts from file
function getContacts() {
  if (!existsSync(DATA_FILE)) {
    return [];
  }
  const data = readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(data);
}

// Save contacts to file
function saveContacts(contacts) {
  writeFileSync(DATA_FILE, JSON.stringify(contacts, null, 2));
}

// GET /api/contacts - List all contacts
router.get("/", (_req, res) => {
  const contacts = getContacts();
  res.json(contacts);
});

// POST /api/contacts - Add a new contact
router.post("/", (req, res) => {
  const { name, phone } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ message: "Name and phone are required" });
  }

  const contacts = getContacts();
  const newContact = { name, phone };
  contacts.push(newContact);
  saveContacts(contacts);

  res.status(201).json(newContact);
});

// DELETE /api/contacts/:phone - Remove a contact by phone
router.delete("/:phone", (req, res) => {
  const { phone } = req.params;
  let contacts = getContacts();

  const initialLength = contacts.length;
  contacts = contacts.filter((c) => c.phone !== phone);

  if (contacts.length === initialLength) {
    return res.status(404).json({ message: "Contact not found" });
  }

  saveContacts(contacts);
  res.json({ message: "Contact removed" });
});

// POST /api/contacts/alert - Send alert to all contacts
router.post("/alert", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ message: "Message is required" });
  }

  try {
    const results = await send_alert_to_contacts(message);

    if (results.length === 0) {
      return res.status(409).json({
        message: "No emergency contacts configured",
        success: false,
        recipients: [],
      });
    }

    const recipients = results.map(({ contact, smsResult }) => ({
      name: contact.name,
      phone: contact.phone,
      status: smsResult.success ? "sent" : "failed",
      error: smsResult.error,
    }));

    const success = recipients.some((recipient) => recipient.status === "sent");

    res.json({
      message: success ? "Alerts sent" : "Alert dispatch failed",
      success,
      recipients,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      message: "Failed to send alerts",
      success: false,
      error: message,
    });
  }
});

// POST /api/contacts/call - Place emergency call to configured target
router.post("/call", async (req, res) => {
  try {
    const spokenMessage =
      typeof req.body?.spokenMessage === "string" && req.body.spokenMessage.trim().length > 0
        ? req.body.spokenMessage.trim()
        : undefined;

    const result = await ring_emergency_friend_on_timeout(spokenMessage);

    res.json({
      message: result.callResult.success
        ? "Emergency call placed"
        : "Emergency call failed",
      success: result.callResult.success,
      recipient: {
        name: result.contact.name,
        phone: result.contact.phone,
      },
      callSid: result.callResult.callSid,
      error: result.callResult.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      message: "Failed to place emergency call",
      success: false,
      error: message,
    });
  }
});

export default router;
