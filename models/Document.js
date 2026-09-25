import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    operation: {
      type: String,
      enum: [
        'edit',
        'compress',
        'split',
        'merge',
        'jpg-to-pdf',
        'pdf-to-word',
        'pdf-to-excel',
        'excel-to-pdf',
        'protect',
        'unlock',
        'organize',
        'crop',
      ],
      required: true,
    },
    status: { type: String, enum: ['pending', 'processing', 'done', 'failed'], default: 'pending' },
    inputSizeBytes: Number,
    outputSizeBytes: Number,
    outputPath: String,
    errorMessage: String,
  },
  { timestamps: true }
);

export default mongoose.model('Document', documentSchema);
