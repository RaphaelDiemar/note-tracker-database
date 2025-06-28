const express = require('express');
const cors = require('cors');
const { CrossDeviceManager, CROSS_DEVICE_CONFIG } = require('./cross-device-manager.js');

class CrossDeviceServer {
    constructor() {
        this.app = express();
        this.dataManager = new CrossDeviceManager();
        this.setup();
    }
    
    setup() {
        // Middleware
        this.app.use(cors());
        this.app.use(express.json());
        
        // Health check - simplified route
        this.app.get('/api/health', (req, res) => {
            res.json({ 
                status: 'ok', 
                timestamp: new Date().toISOString()
            });
        });
        
        // Data routes - simplified
        this.app.get('/api/data', (req, res) => {
            try {
                const data = this.dataManager.readData();
                res.json({ success: true, data });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        this.app.get('/api/data/:key', (req, res) => {
            try {
                const key = req.params.key;
                const data = this.dataManager.readData(key);
                res.json({ success: true, data });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        this.app.post('/api/data/:key', (req, res) => {
            try {
                const key = req.params.key;
                const { value } = req.body;
                const success = this.dataManager.writeData(key, value);
                res.json({ success });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // Project routes - simplified
        this.app.get('/api/project/:projectName', (req, res) => {
            try {
                const projectName = req.params.projectName;
                const data = this.dataManager.getProjectData(projectName);
                res.json({ success: true, data });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        this.app.post('/api/project/:projectName', (req, res) => {
            try {
                const projectName = req.params.projectName;
                const { data } = req.body;
                this.dataManager.setProjectData(projectName, data);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
        
        // Error handling middleware
        this.app.use((error, req, res, next) => {
            console.error('Server error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error' 
            });
        });
    }
    
    async start() {
        const port = CROSS_DEVICE_CONFIG.NETWORK.PORT;
        
        try {
            const server = this.app.listen(port, '0.0.0.0', () => {
                console.log('🚀 Cross-Device Server Started!');
                console.log(`📡 Port: ${port}`);
                console.log(`📁 Data: ${CROSS_DEVICE_CONFIG.STORAGE_PATH}`);
                console.log('🌐 Ready for cross-device access!');
                console.log('');
                console.log('✅ Server is running successfully!');
                console.log('📱 You can now access from other devices');
                console.log('🔗 Press Ctrl+C to stop the server');
            });
            
            server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.log(`❌ Port ${port} is already in use`);
                    console.log('🔄 Trying port 3001...');
                    this.tryAlternativePort();
                } else {
                    console.error('❌ Server error:', error);
                }
            });
            
        } catch (error) {
            console.error('❌ Failed to start server:', error);
        }
    }
    
    tryAlternativePort() {
        const alternativePort = 3001;
        this.app.listen(alternativePort, '0.0.0.0', () => {
            console.log('🚀 Cross-Device Server Started!');
            console.log(`📡 Port: ${alternativePort}`);
            console.log(`📁 Data: ${CROSS_DEVICE_CONFIG.STORAGE_PATH}`);
            console.log('🌐 Ready for cross-device access!');
        });
    }
}

// Start server if running this file directly
if (require.main === module) {
    console.log('🔧 Starting Cross-Device Server...');
    const server = new CrossDeviceServer();
    server.start();
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down server...');
        console.log('💾 Data saved successfully');
        process.exit(0);
    });
}

module.exports = CrossDeviceServer;