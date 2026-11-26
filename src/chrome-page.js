import { outputsOf } from "./outputs.js";
import fs from "node:fs";
import { serializeChat } from "./markdown.js";
import { STAGES } from "./stages.js";

export function artifactTitle(session) {
  try {
    const html = fs.readFileSync(session.file, "utf8");
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const t = m && m[1].trim();
    if (t) return t.replace(/<[^>]*>/g, "");
  } catch {
    // unreadable file: fall back to the default title
  }
  return "my-lavish-axi";
}

function quoteArg(p) {
  return /[\s"'`$&|;<>()*?!#~^%{}\[\]\\]/.test(p) ? JSON.stringify(p) : p;
}

function workflowView(wf, baseUrl) {
  if (!wf) return null;
  const stages = {};
  for (const s of STAGES) {
    const st = wf.stages[s];
    stages[s] = { status: st.status, url: st.key ? `${baseUrl}/session/${st.key}` : null, key: st.key ?? null };
  }
  return { id: wf.id, name: wf.name, current: wf.current, stages };
}

/** The data the review page (src/routes/session.tsx) loads from /api/:key/page. */
export function chromeData(session, { baseUrl, canResume = false, workflow = null, artifactBase = `/artifact/${session.key}` } = {}) {
  const file = session.source_file ?? session.file;
  return {
    key: session.key,
    file: session.file,
    status: session.status,
    ended_by: session.ended_by ?? null,
    chat: serializeChat(session.chat ?? []),
    claude_session_id: session.claude_session_id ?? null,
    can_resume: Boolean(canResume),
    stage: session.stage ?? null,
    stage_source: session.stage_source ?? null,
    has_plan: Boolean(session.source_file) || Boolean(session.stage),
    revision: session.revision ?? 0,
    decision: session.decision?.value ?? null,
    poll_command: `see poll ${quoteArg(file)}${session.stage ? ` --stage ${session.stage}` : ""}`,
    history: (session.history ?? []).map((h) => ({ ended_at: h.ended_at ?? null, ended_by: h.ended_by ?? null, chat: serializeChat(h.chat ?? []) })),
    workflow: workflowView(workflow, baseUrl ?? ""),
    artifact_base: artifactBase,
    outputs: outputsOf(session).map((o) => ({ id: o.id, file: o.file, kind: o.kind, revision: o.revision ?? 0 })),
  };
}
