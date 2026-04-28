import express from "express";
import { getAuthToken } from "./config.js";
import { listProviders, queryZgCompute } from "./compute.js";
import { downloadAlphaContent, uploadAlphaContent } from "./storage.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.use((req, _res, next) => {
  console.log(`[0G Backend] ${req.method} ${req.path}`);
  next();
});

app.use((req, res, next) => {
  const authToken = getAuthToken();
  if (!authToken || req.path === "/health") {
    return next();
  }

  const header = req.header("authorization");
  if (header !== `Bearer ${authToken}`) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  next();
});

app.get("/health", (_req, res) => {
  res.json({ success: true, service: "0g-backend" });
});

app.get("/providers", async (_req, res) => {
  try {
    const providers = await listProviders();
    res.json({ success: true, providers });
  } catch (error: any) {
    console.error("[0G Backend] /providers failed:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/compute/query", async (req, res) => {
  try {
    const { messages, model } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: "messages is required" });
    }

    const result = await queryZgCompute(messages, model);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/storage/upload", async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      return res.status(400).json({ success: false, error: "content object is required" });
    }

    const result = await uploadAlphaContent(content);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/storage/:rootHash", async (req, res) => {
  try {
    const content = await downloadAlphaContent(req.params.rootHash);
    res.json({ success: true, content });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`0G backend listening on port ${port}`);
});
