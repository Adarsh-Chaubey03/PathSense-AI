import "dotenv/config";
import app from "./app.js";

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`Server listening on http://${displayHost}:${port}`);
  if (host === "0.0.0.0") {
    console.log(`LAN access enabled on port ${port}`);
  }
});
