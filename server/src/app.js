import cors from "cors";
import express from "express";
import helmet from "helmet";
import contactsRouter from "./routes/contacts.js";
import fallRoutes from "./routes/fallRoutes.ts";
import fallDetectRoutes from "./routes/fall.routes.js";

const app = express();
let requestSequence = 0;

function createRequestId() {
  requestSequence = (requestSequence + 1) % 1_000_000;
  return `req-${Date.now()}-${requestSequence}`;
}

function getRequestBodyInfo(body) {
  if (!body || typeof body !== "object") {
    return "body=none";
  }

  const keys = Object.keys(body);
  const preview = JSON.stringify(body).slice(0, 400);
  return `bodyKeys=${keys.length} bodyPreview=${preview}`;
}

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const receivedAt = new Date().toISOString();
  const userAgent = req.headers["user-agent"] ?? "unknown";
  const forwardedFor = req.headers["x-forwarded-for"];
  const sourceIp =
    typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0].trim()
      : req.ip;

  const requestSize = req.headers["content-length"] ?? "0";
  const queryString = Object.keys(req.query ?? {}).length
    ? JSON.stringify(req.query)
    : "{}";
  const bodyInfo = getRequestBodyInfo(req.body);

  console.log(
    `[HTTP][IN] id=${requestId} ts=${receivedAt} ${req.method} ${req.originalUrl} ip=${sourceIp} ua=${userAgent} size=${requestSize} query=${queryString} ${bodyInfo}`,
  );

  res.setHeader("x-request-id", requestId);

  res.on("finish", () => {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAt;
    const responseSize = res.getHeader("content-length") ?? "0";

    console.log(
      `[HTTP][OUT] id=${requestId} ts=${completedAt} ${req.method} ${req.originalUrl} status=${res.statusCode} durationMs=${durationMs} size=${responseSize}`,
    );
  });

  res.on("close", () => {
    if (!res.writableEnded) {
      const closedAt = new Date().toISOString();
      const durationMs = Date.now() - startedAt;
      console.log(
        `[HTTP][ABORT] id=${requestId} ts=${closedAt} ${req.method} ${req.originalUrl} durationMs=${durationMs}`,
      );
    }
  });

  next();
});

app.get("/", (_req, res) => {
  res.json({
    message: "Express server is running.",
    runtime: "Node.js + Bun",
  });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Contact management routes
app.use("/api/contacts", contactsRouter);

// Fall detection routes
app.use("/api", fallRoutes);
app.use("/api", fallDetectRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    message: "Internal server error",
  });
});

export default app;
