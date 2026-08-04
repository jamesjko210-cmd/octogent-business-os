#!/usr/bin/env node
process.argv.splice(2, 0, "notion");
await import("./no-key-workflow.mjs");
