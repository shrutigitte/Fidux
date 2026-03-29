import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var backendProxyTarget = env.VITE_DEV_BACKEND_PROXY_TARGET || 'http://localhost:3002';
    return {
        plugins: [react()],
        server: {
            port: 5173,
            proxy: {
                '/api': {
                    target: backendProxyTarget,
                    changeOrigin: true,
                },
            },
        },
    };
});
