import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('ci-logs', { recursive: true });
copyFileSync('android/app/build/outputs/apk/debug/app-debug.apk', 'ci-logs/app-debug.apk');
console.log('Preserved ci-logs/app-debug.apk before F-Droid cleanup');
