const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const archiver = require('archiver');
const sharp = require('sharp');
const pdf = require('pdf-parse');
const crypto = require('crypto');
const app = express();
const port = 3000;

const createDirectories = async () => {
    const categories = ['images', 'documents', 'audio', 'video', 'archives', 'others'];
    const uploadDir = path.join(__dirname, 'uploads');
    
    try {
        await fs.mkdir(uploadDir, { recursive: true });
        for (const category of categories) {
            await fs.mkdir(path.join(uploadDir, category), { recursive: true });
        }
    } catch (error) {
        console.error('Error creating directories:', error);
    }
};

createDirectories();

const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const category = getCategoryFromMimetype(file.mimetype);
        const categoryPath = path.join(__dirname, 'uploads', category);
        cb(null, categoryPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Helper function to determine category based on mimetype
function getCategoryFromMimetype(mimetype) {
    if (mimetype.startsWith('image/')) return 'images';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.match(/pdf|msword|officedocument|text/)) return 'documents';
    if (mimetype.match(/zip|rar|tar|7z/)) return 'archives';
    return 'others';
}

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Handle file upload
app.post('/upload', upload.array('files'), async (req, res) => {
    // Check for existing files and create versions
    const versions = await handleFileVersions(req.files);
    res.json({ success: true, files: versions });
});

async function handleFileVersions(files) {
    // Implement versioning logic
}

// Get organized files
app.get('/files', async (req, res) => {
    try {
        const uploadDir = path.join(__dirname, 'uploads');
        const categories = ['images', 'documents', 'audio', 'video', 'archives', 'others'];
        const organizedFiles = {};

        for (const category of categories) {
            const categoryPath = path.join(uploadDir, category);
            try {
                const files = await fs.readdir(categoryPath);
                if (files.length > 0) {
                    organizedFiles[category] = await Promise.all(
                        files.map(async (filename) => {
                            const filePath = path.join(categoryPath, filename);
                            const stats = await fs.stat(filePath);
                            return {
                                name: filename,
                                size: stats.size,
                                path: `/uploads/${category}/${filename}`
                            };
                        })
                    );
                }
            } catch (error) {
                console.error(`Error reading ${category} directory:`, error);
                organizedFiles[category] = [];
            }
        }

        res.json(organizedFiles);
    } catch (error) {
        console.error('Error getting files:', error);
        res.status(500).json({ error: 'Failed to get files' });
    }
});

// Download all files as zip
app.get('/download-zip', async (req, res) => {
    const { compression = 'normal' } = req.query;
    const levels = {
        'low': 1,
        'normal': 6,
        'high': 9
    };
    
    const archive = archiver('zip', {
        zlib: { level: levels[compression] }
    });

    // Set the headers
    res.attachment('organized_files.zip');
    archive.pipe(res);

    const uploadDir = path.join(__dirname, 'uploads');
    const categories = ['images', 'documents', 'audio', 'video', 'archives', 'others'];

    // Add files to the zip
    for (const category of categories) {
        const categoryPath = path.join(uploadDir, category);
        try {
            const files = await fs.readdir(categoryPath);
            if (files.length > 0) { // Only add directories that contain files
                files.forEach(file => {
                    archive.file(path.join(categoryPath, file), { name: `${category}/${file}` });
                });
            }
        } catch (error) {
            console.error(`Error reading ${category} directory:`, error);
        }
    }

    await archive.finalize();
});

// Clear all files
app.post('/clear-files', async (req, res) => {
    try {
        const uploadDir = path.join(__dirname, 'uploads');
        const categories = ['images', 'documents', 'audio', 'video', 'archives', 'others'];

        for (const category of categories) {
            const categoryPath = path.join(uploadDir, category);
            try {
                const files = await fs.readdir(categoryPath);
                for (const file of files) {
                    await fs.unlink(path.join(categoryPath, file));
                }
            } catch (error) {
                console.error(`Error clearing ${category} directory:`, error);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing files:', error);
        res.status(500).json({ error: 'Failed to clear files' });
    }
});

// Add new endpoint for previews
app.get('/preview/:category/:filename', async (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.category, req.params.filename);
    const mimeType = getMimeType(req.params.filename);
    
    try {
        if (mimeType.startsWith('image/')) {
            const thumbnail = await sharp(filePath)
                .resize(200, 200, { fit: 'inside' })
                .toBuffer();
            res.type(mimeType).send(thumbnail);
        } else if (mimeType === 'application/pdf') {
            const dataBuffer = await fs.readFile(filePath);
            const data = await pdf(dataBuffer);
            res.json({ preview: data.text.substring(0, 500) });
        } else {
            res.status(400).json({ error: 'Preview not available' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Preview generation failed' });
    }
});

// Add sharing routes
app.post('/share/:category/:filename', async (req, res) => {
    const shareId = crypto.randomBytes(16).toString('hex');
    // Store share info in database/file
    const shareLink = `${req.protocol}://${req.get('host')}/shared/${shareId}`;
    res.json({ shareLink });
});

app.get('/shared/:shareId', async (req, res) => {
    // Validate share ID and serve file
});

// Add search endpoint
app.get('/search', async (req, res) => {
    const { query, category, type } = req.query;
    try {
        const results = await searchFiles(query, category, type);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'Search failed' });
    }
});

async function searchFiles(query, category, type) {
    // Implement file search logic
}

// Add analytics endpoints
app.get('/analytics', async (req, res) => {
    try {
        const stats = await getFileStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

async function getFileStats() {
    const uploadDir = path.join(__dirname, 'uploads');
    const categories = ['images', 'documents', 'audio', 'video', 'archives', 'others'];
    const stats = {
        totalSize: 0,
        totalFiles: 0,
        categoryCounts: {},
        categorySize: {}
    };

    for (const category of categories) {
        const categoryPath = path.join(uploadDir, category);
        try {
            const files = await fs.readdir(categoryPath);
            stats.categoryCounts[category] = files.length;
            stats.totalFiles += files.length;

            let categorySize = 0;
            for (const file of files) {
                const fileStat = await fs.stat(path.join(categoryPath, file));
                categorySize += fileStat.size;
            }
            stats.categorySize[category] = categorySize;
            stats.totalSize += categorySize;
        } catch (error) {
            console.error(`Error reading ${category} directory:`, error);
            stats.categoryCounts[category] = 0;
            stats.categorySize[category] = 0;
        }
    }

    return stats;
}

app.post('/batch', async (req, res) => {
    const { operation, files } = req.body;
    try {
        switch (operation) {
            case 'move':
                await batchMove(files);
                break;
            case 'delete':
                await batchDelete(files);
                break;
            // Add more operations
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Batch operation failed' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});