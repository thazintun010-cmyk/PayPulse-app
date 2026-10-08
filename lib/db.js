import { openDB } from 'idb';

const DB_NAME = 'paypulse_db';
const DB_VERSION = 1;
const INVOICE_STORE = 'invoices';
const SETTINGS_STORE = 'settings';

export function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(INVOICE_STORE)) {
        const invoices = db.createObjectStore(INVOICE_STORE, { keyPath: 'id' });
        invoices.createIndex('dueDate', 'dueDate');
        invoices.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    },
  });
}

export async function getAllInvoices() {
  const db = await initDB();
  return db.getAll(INVOICE_STORE);
}

export async function saveInvoice(invoice) {
  const db = await initDB();
  return db.put(INVOICE_STORE, invoice);
}

export async function deleteInvoice(id) {
  const db = await initDB();
  return db.delete(INVOICE_STORE, id);
}

export async function saveSetting(key, value) {
  const db = await initDB();
  return db.put(SETTINGS_STORE, { key, value });
}

export async function getSetting(key) {
  const db = await initDB();
  const setting = await db.get(SETTINGS_STORE, key);
  return setting?.value ?? null;
}

export async function exportBackupData() {
  const db = await initDB();
  return JSON.stringify({
    app: 'PayPulse',
    version: 1,
    exportedAt: new Date().toISOString(),
    invoices: await db.getAll(INVOICE_STORE),
    settings: await db.getAll(SETTINGS_STORE),
  });
}

export async function importBackupData(jsonData) {
  const backup = JSON.parse(jsonData);
  if (
    backup?.app !== 'PayPulse' ||
    backup?.version !== 1 ||
    !Array.isArray(backup.invoices) ||
    !Array.isArray(backup.settings)
  ) {
    throw new Error('Unsupported or invalid PayPulse backup file.');
  }

  const db = await initDB();
  const transaction = db.transaction([INVOICE_STORE, SETTINGS_STORE], 'readwrite');
  await Promise.all([
    transaction.objectStore(INVOICE_STORE).clear(),
    transaction.objectStore(SETTINGS_STORE).clear(),
  ]);

  for (const invoice of backup.invoices) {
    if (!invoice?.id || typeof invoice.id !== 'string') {
      transaction.abort();
      throw new Error('Backup contains an invalid invoice.');
    }
    await transaction.objectStore(INVOICE_STORE).put(invoice);
  }

  for (const setting of backup.settings) {
    if (!setting?.key || typeof setting.key !== 'string') {
      transaction.abort();
      throw new Error('Backup contains an invalid setting.');
    }
    await transaction.objectStore(SETTINGS_STORE).put(setting);
  }

  await transaction.done;
}