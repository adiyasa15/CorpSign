import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import { logger } from "./logger";

const SIDECAR = "http://127.0.0.1:1106";

const gcs = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as any,
  projectId: "",
});

function getBucket() {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
  return gcs.bucket(bucketId);
}

/** Returns true if the stored filePath is a GCS reference */
export function isGcsPath(filePath: string): boolean {
  return filePath.startsWith("gcs:");
}

/** Derives the signed-PDF GCS path from an original GCS path */
export function getSignedGcsPath(originalPath: string): string {
  return originalPath.replace("gcs:docs/originals/", "gcs:docs/signed/");
}

/** Upload a PDF buffer to GCS. Returns the stored path (prefixed with "gcs:"). */
export async function uploadDocBuffer(
  buf: Buffer,
  folder: "originals" | "signed",
): Promise<string> {
  const uuid = randomUUID();
  const objectName = `docs/${folder}/${uuid}`;
  const bucket = getBucket();
  const file = bucket.file(objectName);
  await file.save(buf, { contentType: "application/pdf", resumable: false });
  logger.info({ objectName }, "Uploaded PDF to object storage");
  return `gcs:${objectName}`;
}

/** Download a PDF buffer from GCS. */
export async function downloadDocBuffer(storagePath: string): Promise<Buffer> {
  const objectName = storagePath.slice(4); // strip "gcs:"
  const bucket = getBucket();
  const [buf] = await bucket.file(objectName).download();
  return buf;
}

/** Check if a GCS path exists. */
export async function gcsFileExists(storagePath: string): Promise<boolean> {
  if (!isGcsPath(storagePath)) return false;
  try {
    const objectName = storagePath.slice(4);
    const [exists] = await getBucket().file(objectName).exists();
    return exists;
  } catch {
    return false;
  }
}

/** Upload a PDF buffer to a specific GCS object name (used for signed PDFs). */
export async function uploadDocBufferAt(buf: Buffer, objectName: string): Promise<void> {
  const bucket = getBucket();
  await bucket.file(objectName).save(buf, { contentType: "application/pdf", resumable: false });
  logger.info({ objectName }, "Uploaded signed PDF to object storage");
}

/** Delete a GCS object (silently ignores missing files). */
export async function deleteDocFromStorage(storagePath: string): Promise<void> {
  if (!isGcsPath(storagePath)) return;
  try {
    const objectName = storagePath.slice(4);
    await getBucket().file(objectName).delete();
    logger.info({ objectName }, "Deleted PDF from object storage");
  } catch {
    // ignore — already deleted or never existed
  }
}
