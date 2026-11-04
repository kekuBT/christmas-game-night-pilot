import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Demo / playground only. The library itself is consumed as source (src/index.ts).
export default defineConfig({
  plugins: [react()],
  root: '.',
});
