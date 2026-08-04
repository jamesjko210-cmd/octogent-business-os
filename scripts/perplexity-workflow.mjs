#!/usr/bin/env node
process.argv.splice(2, 0, "perplexity");
await import("./no-key-workflow.mjs");
