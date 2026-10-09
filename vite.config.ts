import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relativa: el build estático funciona en cualquier hosting/carpeta
export default defineConfig({
  plugins: [react()],
  base: './',
})
