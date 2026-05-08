import { Client } from "@replit/object-storage";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "./logger";

// Local disk fallback directory (same as UPLOADS_DIR in documents.ts)
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function getClient(): Client | null {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) return null;
  return new Client({ bucketId });
}

/** Returns true if the stored filePath is a GCS reference */
export function isGcsPath(filePath: string): boolean {
  return filePath.startsWith("gcs:");
}

/** Derives the signed-PDF GCS path from an original GCS path */
export function getSignedGcsPath(originalPath: string): string {
  return originalPath.replace("gcs:docs/originals/", "gcs:docs/signed/");
}

/**
 * Upload a PDF buffer to storage.
 * Tries object storage first; falls back to local disk transparently.
 * Returns `gcs:<objectName>` for GCS or `<uuid>.pdf` for local.
 */
export async function uploadDocBuffer(
  buf: Buffer,
  folder: "originals" | "signed",
): Promise<string> {
  const uuid = randomUUID();
  const objectName = `docs/${folder}/${uuid}`;

  const client = getClient();
  if (client) {
    const result = await client.uploadFromBytes(objectName, buf);
    if (result.ok) {
      logger.info({ objectName }, "Uploaded PDF to object storage");
      return `gcs:${objectName}`;
    }
    logger.warn({ objectName, err: result.error }, "Object storage upload failed — falling back to local disk");
  }

  // Local disk fallback
  ensureUploadsDir();
  const localName = `${uuid}.pdf`;
  fs.writeFileSync(path.join(UPLOADS_DIR, localName), buf);
  logger.info({ localName }, "Uploaded PDF to local disk (fallback)");
  return localName;
}

/**
 * Upload a PDF buffer to a specific GCS object name (used for signed PDFs).
 * Falls back to local disk: derives `signed_<uuid>.pdf` from the GCS object name.
 */
export async function uploadDocBufferAt(buf: Buffer, objectName: string): Promise<void> {
  const client = getClient();
  if (client) {
    const result = await client.uploadFromBytes(objectName, buf);
    if (result.ok) {
      logger.info({ objectName }, "Uploaded signed PDF to object storage");
      return;
    }
    logger.warn({ objectName, err: result.error }, "Object storage upload failed — falling back to local disk");
  }

  // Extract UUID from `docs/signed/<uuid>` or `docs/originals/<uuid>`
  ensureUploadsDir();
  const uuid = objectName.split("/").pop() ?? objectName;
  const localName = `signed_${uuid}.pdf`;
  fs.writeFileSync(path.join(UPLOADS_DIR, localName), buf);
  logger.info({ localName }, "Uploaded signed PDF to local disk (fallback)");
}

/**
 * Download a PDF buffer from storage.
 * For GCS paths: tries object storage, falls back to local disk derived name.
 * For bare filenames: reads directly from local disk.
 */
export async function downloadDocBuffer(storagePath: string): Promise<Buffer> {
  if (!isGcsPath(storagePath)) {
    // Legacy / local-fallback path — bare filename
    const localPath = path.join(UPLOADS_DIR, storagePath);
    if (!fs.existsSync(localPath)) throw new Error(`File not found on disk: ${storagePath}`);
    return fs.readFileSync(localPath);
  }

  const objectName = storagePath.slice(4); // strip "gcs:"
  const client = getClient();
  if (client) {
    const result = await client.downloadAsBytes(objectName);
    if (result.ok) return result.value[0];
    logger.warn({ objectName, err: result.error }, "Object storage download failed — trying local disk fallback");
  }

  // Try local disk with derived filename
  const uuid = objectName.split("/").pop() ?? objectName;
  const isSignedPath = objectName.includes("/signed/");
  const localName = isSignedPath ? `signed_${uuid}.pdf` : `${uuid}.pdf`;
  const localPath = path.join(UPLOADS_DIR, localName);
  if (!fs.existsSync(localPath)) throw new Error(`File not found in storage or on disk: ${storagePath}`);
  return fs.readFileSync(localPath);
}

/**
 * Check if a stored path resolves to an existing file (GCS or local fallback).
 */
export async function gcsFileExists(storagePath: string): Promise<boolean> {
  if (!isGcsPath(storagePath)) return false;
  const objectName = storagePath.slice(4);

  const client = getClient();
  if (client) {
    try {
      const result = await client.exists(objectName);
      if (result.ok && result.value) return true;
    } catch {
      // fall through to local check
    }
  }

  // Check local disk fallback
  const uuid = objectName.split("/").pop() ?? objectName;
  const isSignedPath = objectName.includes("/signed/");
  const localName = isSignedPath ? `signed_${uuid}.pdf` : `${uuid}.pdf`;
  return fs.existsSync(path.join(UPLOADS_DIR, localName));
}

/**
 * Delete a stored file (GCS and local disk both attempted).
 */
export async function deleteDocFromStorage(storagePath: string): Promise<void> {
  if (!isGcsPath(storagePath)) return;
  const objectName = storagePath.slice(4);

  const client = getClient();
  if (client) {
    try {
      await client.delete(objectName, { ignoreNotFound: true });
      logger.info({ objectName }, "Deleted PDF from object storage");
    } catch {
      // ignore
    }
  }

  // Also clean up any local disk fallback copy
  const uuid = objectName.split("/").pop() ?? objectName;
  const isSignedPath = objectName.includes("/signed/");
  const localName = isSignedPath ? `signed_${uuid}.pdf` : `${uuid}.pdf`;
  const localPath = path.join(UPLOADS_DIR, localName);
  if (fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
    logger.info({ localName }, "Deleted PDF from local disk fallback");
  }
}
