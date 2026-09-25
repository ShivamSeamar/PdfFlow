import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import convertRoutes from './routes/convert.js';
import protectRoutes from './routes/protect.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'pdfflow-backend' }));

app.use('/api/convert', convertRoutes);
app.use('/api', protectRoutes); // exposes /api/protect and /api/unlock

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/pdfflow';

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.warn('MongoDB connection failed (job history will not persist):', err.message));

app.listen(PORT, () => console.log(`PdfFlow backend listening on http://localhost:${PORT}`));
