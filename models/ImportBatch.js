const mongoose = require('mongoose');

const ImportBatchSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        // No standalone index here: userId is the leading key of the compound
        // index below, and MongoDB uses an index prefix for queries on userId alone.
    },
    filename: {
        type: String,
        trim: true,
        default: '',
    },
    fileHash: {
        type: String,
        trim: true,
        default: '',
    },
    totalRows: {
        type: Number,
        required: true,
        default: 0,
    },
    imported: {
        type: Number,
        required: true,
        default: 0,
    },
    skipped: {
        type: Number,
        required: true,
        default: 0,
    },
    failed: {
        type: Number,
        required: true,
        default: 0,
    },
}, {
    timestamps: { createdAt: true, updatedAt: false },
});

ImportBatchSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ImportBatch', ImportBatchSchema);
