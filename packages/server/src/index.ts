import "dotenv/config";
import express from "express";
import cors from "cors";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeIncident, parseFailure, fromGreptileFinding, fetchGreptileFindings } from "@afr/incident";
import { openIndex, indexTrace } from "@afr/enricher";
import { listTraces, loadTrace, fileAtStep, indexPathFor, REPO_ROOT, TRACE_DIRS } from "./traces.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    traces: listTraces().length,
    openai_key: Boolean(process.env.OPENAI_API_KEY),
    modal_endpoint: Boolean(process.env.AFR_MODAL_ENDPOINT),
  });
});

app.get("/api/sessions", (_req, res) => {
  res.json({ sessions: listTraces() });
});

app.get("/api/traces/:id", (req, res) => {
  const loaded = loadTrace(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: `no trace for session ${req.params.id}` });
    return;
  }
  res.json({ summary: loaded.summary, events: loaded.events });
});

app.get("/api/traces/:id/file", (req, res) => {
  const path = String(req.query.path ?? "");
  const step = Number(req.query.step ?? 0);
  const loaded = loadTrace(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "no such session" });
    return;
  }
  const content = fileAtStep(req.params.id, loaded.events, path, step);
  if (content === null) {
    res.status(404).json({ error: `no snapshot of ${path} at or before step ${step}` });
    return;
  }
  res.json({ path, step, content });
});

/** Rebuild the SQLite index from a trace on disk (used after a fresh capture). */
app.post("/api/traces/:id/index", (req, res) => {
  const loaded = loadTrace(req.params.id);
  if (!loaded) {
    res.status(404).json({ error: "no such session" });
    return;
  }
  const indexPath = indexPathFor(req.params.id);
  const db = openIndex(indexPath);
  try {
    indexTrace(db, loaded.events, loaded.summary.path);
    res.json({ ok: true, index: indexPath });
  } finally {
    db.close();
  }
});

app.post("/api/incident", async (req, res) => {
  const { session_id, text, finding, model } = req.body ?? {};
  const loaded = session_id ? loadTrace(session_id) : null;
  if (!loaded) {
    res.status(404).json({ error: "unknown session_id" });
    return;
  }
  try {
    const artifact = finding ? fromGreptileFinding(finding) : parseFailure(String(text ?? ""));
    if (artifact.frames.length === 0) {
      res.status(400).json({ error: "no file:line references found in that failure text" });
      return;
    }
    const result = await analyzeIncident({
      events: loaded.events,
      artifact,
      indexPath: indexPathFor(session_id),
      ...(model ? { model } : {}),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/greptile", async (req, res) => {
  const pr = Number(req.query.pr ?? 0);
  const repo = String(req.query.repo ?? process.env.GITHUB_REPO ?? "");
  // Saved findings work offline and are still a truthful demo (INTEGRATIONS §3b).
  const saved = join(REPO_ROOT, "demo", "greptile-finding.json");
  if (!pr || !repo) {
    if (existsSync(saved)) {
      res.json({ source: "saved", findings: [JSON.parse(readFileSync(saved, "utf8"))] });
      return;
    }
    res.status(400).json({ error: "pass ?pr=<n>&repo=owner/name, or save demo/greptile-finding.json" });
    return;
  }
  try {
    const findings = await fetchGreptileFindings({ repo, pr });
    res.json({ source: "github", findings });
  } catch (err) {
    if (existsSync(saved)) {
      res.json({ source: "saved", warning: (err as Error).message, findings: [JSON.parse(readFileSync(saved, "utf8"))] });
      return;
    }
    res.status(502).json({ error: (err as Error).message });
  }
});

/** Sandboxed re-run. Fail soft: hand back the exact local command if Modal is down. */
app.post("/api/replay", async (req, res) => {
  const { session_id, from_step, correction } = req.body ?? {};
  const fallbackCommand = `modal run modal/replay_sandbox.py --trace ${session_id} --from-step ${from_step}`;
  const endpoint = process.env.AFR_MODAL_ENDPOINT;
  if (!endpoint) {
    res.status(503).json({ error: "AFR_MODAL_ENDPOINT is not set", fallback_command: fallbackCommand });
    return;
  }
  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id, from_step, correction }),
    });
    const body = await upstream.text();
    res.status(upstream.status).type("application/json").send(body);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message, fallback_command: fallbackCommand });
  }
});

const port = Number(process.env.AFR_PORT ?? 8787);
app.listen(port, () => {
  console.log(`afr trace api → http://localhost:${port}`);
  console.log(`  trace dirs: ${TRACE_DIRS.join(", ")}`);
  console.log(`  traces:     ${listTraces().length}`);
});
