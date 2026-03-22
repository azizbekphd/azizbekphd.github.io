import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: mode === 'test' ? [react()] : [react(), mkcert()],
  base: '/',
}));
