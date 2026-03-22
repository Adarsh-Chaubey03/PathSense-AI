import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import app from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST?.trim() || "0.0.0.0";

function getLanIpv4Address() {
  const networkInterfaces = os.networkInterfaces();

  for (const addresses of Object.values(networkInterfaces)) {
    if (!addresses) {
      continue;
    }

    for (const addressInfo of addresses) {
      if (
        addressInfo.family === "IPv4" &&
        !addressInfo.internal &&
        !addressInfo.address.startsWith("169.254.")
      ) {
        return addressInfo.address;
      }
    }
  }

  return null;
}

const onListen = () => {
  console.log(`Server listening on http://localhost:${port}`);

  if (host === "0.0.0.0") {
    const lanIp = getLanIpv4Address();
    if (lanIp) {
      console.log(`Server LAN URL: http://${lanIp}:${port}`);
    }
    console.log(`LAN access enabled on port ${port}`);
  } else {
    console.log(`Server bound host: ${host}`);
  }
};

app.listen(port, host, onListen);
