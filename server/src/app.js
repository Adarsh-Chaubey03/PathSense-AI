import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import contactsRouter from "./routes/contacts.js";
import fallRoutes from "./routes/fallRoutes.ts";
import fallDetectRoutes from "./routes/fall.routes.js";

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.json({
    message: "Express server is running.",
    runtime: "Node.js + Bun"
  });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

// Contact management routes
app.use("/api/contacts", contactsRouter);

// Fall detection routes
app.use("/api", fallRoutes);
app.use("/api", fallDetectRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    message: "Internal server error"
  });
});

export default app;
