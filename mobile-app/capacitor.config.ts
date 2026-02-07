import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.fourlucky.gpstracker',
    appName: 'GPS Tracker',
    webDir: 'www',
    server: {
        // Point directly to your VPS - the app will load this URL
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
