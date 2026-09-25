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

/**
 * PDF -> WORD and PDF -> EXCEL are genuinely server-side jobs — there is no
 * reliable, license-safe way to reconstruct editable Word paragraphs or
 * Excel tables from arbitrary PDF layout purely in the browser.
 *
 * Two supported strategies (pick one and wire it in below):
 *
 *  1. LibreOffice headless (self-hosted, free):
 *     `soffice --headless --convert-to docx input.pdf`
 *     Good general text conversion; table fidelity for PDF -> Excel is weak
 *     because LibreOffice treats the PDF as a Writer/Impress document, not a
 *     Calc one, so for PDF -> Excel you typically still want option 2 for
 *     real table extraction (camelot / tabula, or a cloud OCR-table API).
 *
 *  2. A cloud conversion API (CloudConvert, Adobe PDF Services, ConvertAPI):
 *     Swap the exec() calls below for a fetch() to that provider using
 *     process.env.CONVERSION_API_KEY.
 *
 * The route below implements strategy 1 (LibreOffice) since it requires no
 * external account, and fails gracefully with a clear error if `soffice`
 * isn't installed on the host — install it with:
 *   Ubuntu/Debian: sudo apt-get install libreoffice
 *   Mac:           brew install --cask libreoffice
 */
function convertWithLibreOffice(inputPath, outDir, targetFormat) {
  return new Promise((resolve, reject) => {
    execFile(
      'soffice',
      ['--headless', '--convert-to', targetFormat, '--outdir', outDir, inputPath],
      { timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`LibreOffice conversion failed: ${stderr || err.message}`));
        resolve(stdout);
      }
    );
  });
}

router.post('/pdf-to-word', upload.single('file'), async (req, res) => {
  const doc = await Document.create({
    originalName: req.file.originalname,
    operation: 'pdf-to-word',
    status: 'processing',
    inputSizeBytes: req.file.size,
  });

  try {
    await convertWithLibreOffice(req.file.path, uploadDir, 'docx');
    const outName = req.file.filename + '.docx';
    const outPath = path.join(uploadDir, outName);
    if (!fs.existsSync(outPath)) throw new Error('Conversion produced no output file.');

    doc.status = 'done';
    doc.outputPath = outPath;
    doc.outputSizeBytes = fs.statSync(outPath).size;
    await doc.save();

    res.download(outPath, req.file.originalname.replace(/\.pdf$/i, '.docx'), () => {
      fs.unlink(req.file.path, () => {});
      fs.unlink(outPath, () => {});
    });
  } catch (err) {
    doc.status = 'failed';
    doc.errorMessage = err.message;
    await doc.save();
    res.status(500).json({
      error:
        'PDF to Word conversion failed. Make sure LibreOffice (`soffice`) is installed on the server, or configure a cloud conversion provider in convert.js.',
      detail: err.message,
    });
  }
});

router.post('/pdf-to-excel', upload.single('file'), async (req, res) => {
  const doc = await Document.create({
    originalName: req.file.originalname,
    operation: 'pdf-to-excel',
    status: 'processing',
    inputSizeBytes: req.file.size,
  });

  try {
    // LibreOffice can target "xlsx" too, but it only produces good results
    // when the PDF's content is already tabular. For scanned or free-form
    // PDFs, integrate a table-extraction service (camelot-py, tabula, or a
    // cloud OCR-table API) here instead.
    await convertWithLibreOffice(req.file.path, uploadDir, 'xlsx');
    const outName = req.file.filename + '.xlsx';
    const outPath = path.join(uploadDir, outName);
    if (!fs.existsSync(outPath)) throw new Error('Conversion produced no output file.');

    doc.status = 'done';
    doc.outputPath = outPath;
    doc.outputSizeBytes = fs.statSync(outPath).size;
    await doc.save();

    res.download(outPath, req.file.originalname.replace(/\.pdf$/i, '.xlsx'), () => {
      fs.unlink(req.file.path, () => {});
      fs.unlink(outPath, () => {});
    });
  } catch (err) {
    doc.status = 'failed';
    doc.errorMessage = err.message;
    await doc.save();
    res.status(500).json({
      error:
        'PDF to Excel conversion failed. Make sure LibreOffice (`soffice`) is installed on the server, or configure a table-extraction/cloud provider in convert.js.',
      detail: err.message,
    });
  }
});

export default router;
