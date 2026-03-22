import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import app from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST?.trim() || undefined;

const onListen = () => {
  const displayHost = !host || host === "0.0.0.0" ? "localhost" : host;
  console.log(`Server listening on http://${displayHost}:${port}`);
  if (!host || host === "0.0.0.0") {
    console.log(`LAN access enabled on port ${port}`);
  }
};

if (host) {
  app.listen(port, host, onListen);
} else {
  app.listen(port, onListen);
}
