#!/usr/bin/env node
process.argv.splice(2, 0, "notebooklm");
await import("./no-key-workflow.mjs");
