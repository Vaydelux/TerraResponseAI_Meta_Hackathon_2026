const DB_NAME = "terraresponse-upload-queue";
const STORE_NAME = "uploads";
const DB_VERSION = 1;

export interface OfflineUpload {
  id: string;
  file: Blob;
  fileName: string;
  metadata: string;
  createdAt: number;
  /** Authenticated owner at creation; older unscoped drafts are never auto-submitted. */
  ownerId: string;
}

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open upload queue"));
  });
}

export async function enqueueOfflineUpload(input: Omit<OfflineUpload, "id" | "createdAt">): Promise<string> {
  const id = crypto.randomUUID();
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).add({ ...input, id, createdAt: Date.now() });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to queue upload"));
  });
  db.close();
  return id;
}

export async function listOfflineUploads(): Promise<OfflineUpload[]> {
  const db = await openQueue();
  const items = await new Promise<OfflineUpload[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as OfflineUpload[]).sort((a, b) => a.createdAt - b.createdAt));
    request.onerror = () => reject(request.error ?? new Error("Unable to read upload queue"));
  });
  db.close();
  return items;
}

export async function removeOfflineUpload(id: string): Promise<void> {
  const db = await openQueue();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to remove queued upload"));
  });
  db.close();
}

/** Reject unowned/legacy drafts and drafts created by a different account. */
export function canReplayOfflineUpload(item: Pick<OfflineUpload, "ownerId">, ownerId: string): boolean {
  return Boolean(ownerId && item.ownerId && item.ownerId === ownerId);
}

/** Flushes only successful uploads; failed items remain queued for retry. */
export async function flushOfflineUploads(send: (item: OfflineUpload) => Promise<boolean>, ownerId: string): Promise<number> {
  if (!ownerId) return 0;
  const items = await listOfflineUploads();
  let flushed = 0;
  for (const item of items) {
    if (!canReplayOfflineUpload(item, ownerId)) continue;
    if (await send(item)) {
      await removeOfflineUpload(item.id);
      flushed += 1;
    }
  }
  return flushed;
}
