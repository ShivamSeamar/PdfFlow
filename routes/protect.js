import { Router } from 'express';
import multer from 'multer';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Document from '../models/Document.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });
const router = Router();

const QPDF = process.env.QPDF_PATH || 'qpdf';

/**
 * Real PDF password protection/removal is a standardized encryption format
 * (RC4/AES on the PDF's cross-reference and streams) that pdf-lib does not
 * implement, so this is handled server-side with `qpdf`, a well-established
 * open-source CLI built exactly for this:
 *   Ubuntu/Debian: sudo apt-get install qpdf
 *   Mac:           brew install qpdf
 */
router.post('/protect', upload.single('file'), async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'A password is required.' });

  const doc = await Document.create({
    originalName: req.file.originalname,
    operation: 'protect',
    status: 'processing',
    inputSizeBytes: req.file.size,
  });

  const outPath = req.file.path + '-protected.pdf';
  execFile(
    QPDF,
    ['--encrypt', password, password, '256', '--', req.file.path, outPath],
    { timeout: 60000 },
    async (err, stdout, stderr) => {
      if (err) {
        doc.status = 'failed';
        doc.errorMessage = stderr || err.message;
        await doc.save();
        return res.status(500).json({
          error: 'Could not protect PDF. Make sure `qpdf` is installed on the server.',
          detail: stderr || err.message,
        });
      }
      doc.status = 'done';
      doc.outputPath = outPath;
      doc.outputSizeBytes = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
      await doc.save();
      res.download(outPath, req.file.originalname.replace(/\.pdf$/i, '-protected.pdf'), () => {
        fs.unlink(req.file.path, () => {});
        fs.unlink(outPath, () => {});
      });
    }
  );
});

router.post('/unlock', upload.single('file'), async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'The PDF password is required to unlock it.' });

  const doc = await Document.create({
    originalName: req.file.originalname,
    operation: 'unlock',
    status: 'processing',
    inputSizeBytes: req.file.size,
  });

  const outPath = req.file.path + '-unlocked.pdf';
  execFile(
    QPDF,
    [`--password=${password}`, '--decrypt', '--', req.file.path, outPath],
    { timeout: 60000 },
    async (err, stdout, stderr) => {
      if (err) {
        doc.status = 'failed';
        doc.errorMessage = stderr || err.message;
        await doc.save();
        return res.status(500).json({
          error: 'Could not unlock PDF. Check the password, and make sure `qpdf` is installed on the server.',
          detail: stderr || err.message,
        });
      }
      doc.status = 'done';
      doc.outputPath = outPath;
      doc.outputSizeBytes = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
      await doc.save();
      res.download(outPath, req.file.originalname.replace(/\.pdf$/i, '-unlocked.pdf'), () => {
        fs.unlink(req.file.path, () => {});
        fs.unlink(outPath, () => {});
      });
    }
  );
});

export default router;
