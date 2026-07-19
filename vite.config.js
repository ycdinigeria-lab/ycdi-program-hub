import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The whole app used to build into one 580 kB file, so the login screen
// waited on code for the safeguarding register. React and Supabase are now
// split out, and each section loads when it is opened.
//
// Splitting the two libraries into their own files also means a normal
// deploy only invalidates the app chunk. Phones keep the 200 kB of library
// code they already have, which is most of the download.
//
// BATCH4-MARKER vite
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react'
          return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
})
