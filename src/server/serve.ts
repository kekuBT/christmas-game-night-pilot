import { LocalServer } from "./http.js";
const port = Number(process.env.PORT ?? 3000);
const server = new LocalServer();
const actual = await server.listen(port);
console.log(`Christmas Game Night server on http://localhost:${actual} (web app at / after npm run build:web)`);
