// usage: node vite.mjs <ui root> <port>
const [root, port] = process.argv.slice(2);
const { createServer } = await import(`file:///${root}/node_modules/vite/dist/node/index.js`).catch(() => import(`file:///${root}/../../node_modules/vite/dist/node/index.js`));
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, server: { host: "127.0.0.1", port: Number(port), strictPort: true, proxy: { "/api": "http://127.0.0.1:5184" } } });
await server.listen();
console.log("VITE READY", port);
