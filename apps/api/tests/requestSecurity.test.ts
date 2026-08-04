import { describe, expect, it } from "vitest";

import { isAllowedHostHeader, isAllowedOriginHeader } from "../src/createApiServer/security";

describe("management-plane request security", () => {
  it("keeps the local management plane loopback-only even when the legacy remote flag is set", () => {
    expect(isAllowedHostHeader("attacker.example:8787", true)).toBe(false);
    expect(isAllowedOriginHeader("https://attacker.example", true)).toBe(false);
    expect(isAllowedHostHeader("127.0.0.1:8787", true)).toBe(true);
    expect(isAllowedOriginHeader("http://localhost:5173", true)).toBe(true);
  });
});
