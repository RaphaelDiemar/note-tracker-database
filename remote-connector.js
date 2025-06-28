const { CrossDeviceManager } = require('./cross-device-manager.js');

// CHANGE THIS to your main computer's IP address
const MAIN_COMPUTER_IP = '192.168.1.100'; // ← Update this!
const PORT = '3000';

class RemoteConnector {
    constructor(customIP = null) {
        const serverUrl = `http://${customIP || MAIN_COMPUTER_IP}:${PORT}`;
        this.dataManager = new CrossDeviceManager(serverUrl);
        console.log(`🔗 Connecting to: ${serverUrl}`);
    }
    
    // Test connection
    async testConnection() {
        console.log('🔍 Testing connection...');
        const isOnline = await this.dataManager.checkConnectivity();
        if (isOnline) {
            console.log('✅ Connected to main computer!');
        } else {
            console.log('❌ Cannot reach main computer');
        }
        return isOnline;
    }
    
    // Save data to main computer
    async save(key, value) {
        console.log(`💾 Saving: ${key}`);
        const success = await this.dataManager.writeRemoteData(key, value);
        if (success) {
            console.log('✅ Saved successfully!');
        } else {
            console.log('❌ Save failed');
        }
        return success;
    }
    
    // Load data from main computer
    async load(key) {
        console.log(`📁 Loading: ${key}`);
        const data = await this.dataManager.readRemoteData(key);
        if (data) {
            console.log('✅ Loaded successfully!');
        } else {
            console.log('❌ Load failed');
        }
        return data;
    }
    
    // Get all data
    async getAllData() {
        return await this.dataManager.readRemoteData();
    }
}

module.exports = RemoteConnector;

// Example usage if running directly
if (require.main === module) {
    (async () => {
        const remote = new RemoteConnector();
        
        // Test connection
        const connected = await remote.testConnection();
        
        if (connected) {
            // Test saving and loading
            await remote.save('test-from-remote', {
                message: 'Hello from remote device!',
                timestamp: new Date(),
                device: 'laptop'
            });
            
            const data = await remote.load('test-from-remote');
            console.log('📊 Retrieved data:', data);
        }
    })();
}