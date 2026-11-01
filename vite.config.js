import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
// HTTPS (self-signed) so the microphone works for players joining over the local network.
export default defineConfig({
  plugins: [basicSsl()],
  server: { host: true, port: 5173, allowedHosts: true, proxy: { '/api': 'http://localhost:8787', '/ws': { target: 'ws://localhost:8787', ws: true } } },
});
