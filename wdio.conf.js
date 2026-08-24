export const config = {
    //
    // ====================
    // Runner Configuration
    // ====================
    //
    runner: 'local',
    
    //
    // ==================
    // Specify Test Files
    // ==================
    //
    specs: [
        './test/specs/**/*.js'
    ],
    // Patterns to exclude.
    exclude: [
        // 'path/to/excluded/files'
    ],
    //
    // ============
    // Capabilities
    // ============
    //
    maxInstances: 1,
    capabilities: [{
        maxInstances: 1,
        browserName: 'chrome',
        'goog:chromeOptions': {
            args: ['--headless', '--disable-gpu']
        }
    }],
    
    //
    // ===================
    // Test Configurations
    // ===================
    //
    logLevel: 'info',
    bail: 0,
    baseUrl: 'http://localhost',
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
    
    // Tauri Service
    services: ['tauri'],
    
    framework: 'mocha',
    reporters: ['spec'],
    
    mochaOpts: {
        ui: 'bdd',
        timeout: 60000
    },
    
    //
    // =====
    // Hooks
    // =====
    //
    afterTest: async function(test, context, { error, result, duration, passed, retries }) {
        if (error) {
            const fs = require('fs');
            const path = require('path');
            const screenshotDir = path.join(process.cwd(), '.agent-feedback', 'screenshots');
            if (!fs.existsSync(screenshotDir)) {
                fs.mkdirSync(screenshotDir, { recursive: true });
            }
            const name = test.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            await browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
        }
    }
}
