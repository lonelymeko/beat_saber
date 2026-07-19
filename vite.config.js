import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [vue(), basicSsl()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['5f9cc70.r21.cpolar.top', '.cpolar.top'],
  },
})
