#!/usr/bin/env node
import { spawn } from "node:child_process";

const PROVIDERS = {
  perplexity: {
    label: "Perplexity",
    defaultUrl: "https://www.perplexity.ai/",
    envUrl: "OCTOGENT_PERPLEXITY_URL",
    role: "Stage 1: live-source scouting, market checks, competitor research, and citations.",
    handoff:
      "Return candidate sources, source dates, key claims, disagreement, and open questions for NotebookLM.",
  },
  notebooklm: {
    label: "NotebookLM",
    defaultUrl: "https://notebooklm.google.com/",
    envUrl: "OCTOGENT_NOTEBOOKLM_URL",
    role: "Stage 2: curated source-grounded Q&A, source comparison, and source selection.",
    handoff:
      "Return selected sources, rejected-source notes, source-grounded answers, and conflicts for Notion.",
  },
  notion: {
    label: "Notion",
    defaultUrl: "https://www.notion.com/",
    envUrl: "OCTOGENT_NOTION_URL",
    role: "Stage 3: durable research brief, source index, decisions, BMC notes, and next tasks.",
    handoff:
      "Store the final brief and return linked decisions, open questions, and Codex execution tasks.",
  },
};

const providerId = process.argv[2];
const topic = process.argv.slice(3).join(" ").trim();
const provider = PROVIDERS[providerId];

if (!provider) {
  console.error("Usage: no-key-workflow.mjs <perplexity|notebooklm|notion> [research topic]");
  process.exit(1);
}

const url = process.env[provider.envUrl]?.trim() || provider.defaultUrl;

console.log(`${provider.label} no-API-key workflow`);
console.log(`Role: ${provider.role}`);
console.log(`URL: ${url}`);
console.log(`Topic: ${topic || "(not provided)"}`);
console.log(`Handoff: ${provider.handoff}`);
console.log("Policy: no API keys. Use the logged-in app/browser workflow and record the handoff.");

if (process.env.OCTOGENT_WORKFLOW_DRY_RUN === "1" || process.env.CI === "1") {
  process.exit(0);
}

const opener =
  process.platform === "darwin"
    ? { file: "open", args: [url] }
    : process.platform === "win32"
      ? { file: "cmd", args: ["/c", "start", "", url] }
      : { file: "xdg-open", args: [url] };

const child = spawn(opener.file, opener.args, {
  detached: true,
  stdio: "ignore",
});
child.unref();
