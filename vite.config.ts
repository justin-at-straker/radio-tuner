import { Readable } from "node:stream"
import { fileURLToPath, URL } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type Plugin } from "vite"

/**
 * Runs the Vercel functions in api/ under `vite dev` too, the way Vercel
 * does: each file's exported POST (or GET) gets a web Request and returns a
 * Response, streamed back as it comes. So the typewriter and the letters page
 * work locally. Environment comes from .env.local.
 */
function vercelFunctions(): Plugin {
  return {
    name: "vercel-functions-in-dev",
    apply: "serve",
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ""))
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/([\w-]+)(?:\?.*)?$/)
        if (!match) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`)
          const handler = mod[req.method ?? "GET"]
          if (typeof handler !== "function") {
            res.statusCode = 405
            return res.end()
          }
          const url = new URL(req.url!, `http://${req.headers.host}`)
          const hasBody = req.method !== "GET" && req.method !== "HEAD"
          const request = new Request(url, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
            duplex: "half", // Node's fetch needs this for a streamed body
          })
          const response: Response = await handler(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          if (!response.body) return res.end()
          Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(res)
        } catch (e) {
          server.ssrFixStacktrace(e as Error)
          console.error(e)
          res.statusCode = 500
          res.end(String(e))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), vercelFunctions()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
})
