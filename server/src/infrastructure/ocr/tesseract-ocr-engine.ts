import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorker } from 'tesseract.js';

// tesseract.js defaults cachePath to '.' (the process's cwd) for the downloaded
// eng.traineddata (~5MB, fetched from jsdelivr's CDN on first use) — in a Docker
// container that's an arbitrary, possibly read-only working directory. Pin it to
// the OS temp dir instead: stable, writable, and never a path git would track.
const OCR_CACHE_PATH = path.join(os.tmpdir(), 'smi-ocr-cache');
fs.mkdirSync(OCR_CACHE_PATH, { recursive: true });

// Self-hosted OCR (no paid external API) — matches this app's low-operating-cost
// NFR, same precedent as `qrcode` for UPI QR generation. A fresh worker per call
// keeps this stateless and simple; call volume here is "an admin clicks a button",
// not a hot path, so the per-call worker-spin-up cost is acceptable.
export async function recognizeText(buffer: Buffer): Promise<string> {
  // Without an errorHandler, tesseract.js's internal message handler re-throws a
  // worker-thread failure (e.g. an unparseable image) as an uncaught exception on
  // top of rejecting the recognize() promise — the promise rejection alone is not
  // enough to keep a bad image from crashing the process.
  const worker = await createWorker('eng', undefined, {
    cachePath: OCR_CACHE_PATH,
    errorHandler: () => {},
  });
  try {
    const { data } = await worker.recognize(buffer);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
