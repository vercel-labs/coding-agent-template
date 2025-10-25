import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: [
      '.vercel.run',
      'sb-37qid9ih7grp.vercel.run'
    ]
  }
})
