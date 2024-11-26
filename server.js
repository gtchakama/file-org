const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const archiver = require('archiver');
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
    try {
        const uploadedFiles = req.files.map(file => ({
            name: file.originalname,
            size: file.size,
            category: getCategoryFromMimetype(file.mimetype),
            path: file.path.replace(__dirname, '')
        }));
        
        res.json({ success: true, files: uploadedFiles });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: 'Upload failed' });
    }
});

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
    try {
        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
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
    } catch (error) {
        console.error('Error creating zip:', error);
        res.status(500).json({ error: 'Failed to create zip file' });
    }
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});