const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Configuration - adjust paths to match your current setup
const CROSS_DEVICE_CONFIG = {
    // Use your current folder as base
    STORAGE_PATH: path.join(__dirname, 'shared-data'),
    
    // Network settings
    NETWORK: {
        PORT: 3000,
        FALLBACK_PORTS: [3001, 3002, 3003],
        HOST: '0.0.0.0',
        TIMEOUT: 10000,
        RETRY_ATTEMPTS: 3
    }
};

class CrossDeviceManager {
    constructor(serverUrl = null) {
        this.isServer = !serverUrl;
        this.serverUrl = serverUrl;
        this.dbPath = path.join(CROSS_DEVICE_CONFIG.STORAGE_PATH, 'database.json');
        this.deviceId = this.getDeviceId();
        this.isOnline = true;
        this.pendingWrites = [];
        
        this.initializeStorage();
        if (!this.isServer) {
            this.startHeartbeat();
        }
    }
    
    getDeviceId() {
        return crypto.createHash('md5')
            .update(`${os.hostname()}-${os.platform()}`)
            .digest('hex').substr(0, 8);
    }
    
    initializeStorage() {
        try {
            if (!fs.existsSync(CROSS_DEVICE_CONFIG.STORAGE_PATH)) {
                fs.mkdirSync(CROSS_DEVICE_CONFIG.STORAGE_PATH, { recursive: true });
            }
            
            if (!fs.existsSync(this.dbPath)) {
                const initialData = {
                    data: {},
                    projects: {},
                    created: new Date().toISOString()
                };
                fs.writeFileSync(this.dbPath, JSON.stringify(initialData, null, 2));
            }
        } catch (error) {
            console.error('Storage initialization failed:', error);
        }
    }
    
    // Read data (works offline)
    readData(key = null) {
        try {
            const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
            return key ? data.data[key] : data;
        } catch (error) {
            console.error('Read error:', error);
            return key ? null : { data: {}, projects: {} };
        }
    }
    
    // Write data (works offline, syncs when online)
    writeData(key, value) {
        if (!this.isServer && !this.isOnline) {
            this.pendingWrites.push({ key, value, timestamp: Date.now() });
            console.log(`📝 Queued for sync: ${key}`);
            return true;
        }
        
        try {
            const data = this.readData();
            data.data[key] = value;
            data.lastUpdated = new Date().toISOString();
            
            fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
            console.log(`✅ Saved: ${key}`);
            return true;
        } catch (error) {
            console.error('Write error:', error);
            if (!this.isServer) {
                this.pendingWrites.push({ key, value, timestamp: Date.now() });
            }
            return false;
        }
    }
    
    // Project-specific data
    getProjectData(projectName) {
        const data = this.readData();
        return data?.projects?.[projectName] || {};
    }
    
    setProjectData(projectName, projectData) {
        const data = this.readData();
        if (!data.projects) data.projects = {};
        data.projects[projectName] = {
            ...projectData,
            lastUpdated: new Date().toISOString(),
            device: this.deviceId
        };
        
        fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
        return true;
    }
    
    // Check connectivity to main computer
    async checkConnectivity() {
        if (this.isServer) return true;
        
        try {
            const axios = require('axios');
            await axios.get(`${this.serverUrl}/api/health`, { timeout: 5000 });
            this.isOnline = true;
            return true;
        } catch (error) {
            this.isOnline = false;
            return false;
        }
    }
    
    // Remote data operations
    async readRemoteData(key = null) {
        try {
            const axios = require('axios');
            const endpoint = key ? `/api/data/${key}` : '/api/data';
            const response = await axios.get(`${this.serverUrl}${endpoint}`);
            return response.data.data;
        } catch (error) {
            console.error('Remote read error:', error.message);
            return null;
        }
    }
    
    async writeRemoteData(key, value) {
        try {
            const axios = require('axios');
            const response = await axios.post(`${this.serverUrl}/api/data/${key}`, { value });
            return response.data.success;
        } catch (error) {
            console.error('Remote write error:', error.message);
            return false;
        }
    }
    
    // Heartbeat for connection monitoring
    startHeartbeat() {
        setInterval(async () => {
            const wasOnline = this.isOnline;
            await this.checkConnectivity();
            
            if (!wasOnline && this.isOnline) {
                console.log('🔗 Reconnected to main computer');
                this.syncPendingWrites();
            } else if (wasOnline && !this.isOnline) {
                console.log('📴 Working offline - will sync when reconnected');
            }
        }, 30000); // Check every 30 seconds
    }
    
    // Sync pending writes when reconnected
    async syncPendingWrites() {
        if (this.pendingWrites.length === 0) return;
        
        console.log(`🔄 Syncing ${this.pendingWrites.length} pending writes...`);
        const writes = [...this.pendingWrites];
        this.pendingWrites = [];
        
        for (const write of writes) {
            const success = await this.writeRemoteData(write.key, write.value);
            if (!success) {
                this.pendingWrites.push(write); // Re-queue failed writes
            }
        }
        
        console.log('✅ Sync completed');
    }
}

module.exports = { CrossDeviceManager, CROSS_DEVICE_CONFIG };