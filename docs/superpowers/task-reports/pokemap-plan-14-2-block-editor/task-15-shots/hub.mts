// usage: tsx hub.mts <port> <root> <home>
import { createHub } from "file:///C:/Programming%20Projects/PokeMap/packages/server/src/hub.ts";
const [port, open, home] = process.argv.slice(2);
const hub = await createHub({ port: Number(port), open, home, prewarm: true });
const c = hub.current();
process.stdout.write(`hub on ${hub.port} (${c ? c.family + " " + c.info.root : "none"})\n`);
