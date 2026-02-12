import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.fourlucky.gpstracker',
    appName: 'GPS Tracker',
    webDir: 'www',
    server: {
        // Point directly to your VPS User App
        url: 'http://143.14.200.117',
        cleartext: true,  // Allow HTTP (not HTTPS)
    },
    android: {
        allowMixedContent: true,  // Allow HTTP content
    },
    ios: {
        // iOS requires additional config for HTTP
        contentInset: 'automatic',
    },
};

export default config;
