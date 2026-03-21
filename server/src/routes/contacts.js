import express from "express";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

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

// POST /api/contacts/alert - Send alert to all contacts (simulated)
router.post("/alert", (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ message: "Message is required" });
  }

  const contacts = getContacts();
  const alerts = contacts.map((contact) => {
    console.log(`Sending alert to ${contact.name} (${contact.phone}): ${message}`);
    return {
      name: contact.name,
      phone: contact.phone,
      status: "sent"
    };
  });

  res.json({
    message: "Alerts sent",
    recipients: alerts
  });
});

export default router;
