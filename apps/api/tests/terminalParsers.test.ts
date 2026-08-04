import { describe, expect, it } from "vitest";

import { parseTerminalAgentProvider } from "../src/createApiServer/terminalParsers";

describe("terminal parsers", () => {
  it("accepts Perplexity as a research agent provider", () => {
    expect(parseTerminalAgentProvider({ agentProvider: "perplexity" })).toEqual({
      agentProvider: "perplexity",
      error: null,
    });
  });

  it("accepts external management providers", () => {
    expect(parseTerminalAgentProvider({ agentProvider: "notebooklm" })).toEqual({
      agentProvider: "notebooklm",
      error: null,
    });
    expect(parseTerminalAgentProvider({ agentProvider: "notion" })).toEqual({
      agentProvider: "notion",
      error: null,
    });
    expect(parseTerminalAgentProvider({ agentProvider: "stitch" })).toEqual({
      agentProvider: "stitch",
      error: null,
    });
    expect(parseTerminalAgentProvider({ agentProvider: "antigravity" })).toEqual({
      agentProvider: "antigravity",
      error: null,
    });
  });
});
