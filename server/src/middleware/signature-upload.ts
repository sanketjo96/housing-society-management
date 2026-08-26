import multer from 'multer';

// Image only, no PDF (embedded as a picture on a receipt). Tighter size cap
// than the proof-upload default — a signature is a small graphic.
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export const signatureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PNG, JPEG, WEBP.`));
      return;
    }
    cb(null, true);
  },
});
