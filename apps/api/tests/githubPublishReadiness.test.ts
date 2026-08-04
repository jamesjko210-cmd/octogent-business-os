import { describe, expect, it, vi } from "vitest";

import { readGithubPublishReadiness } from "../src/githubPublishReadiness";

describe("readGithubPublishReadiness", () => {
  it("blocks the upstream repository", async () => {
    const snapshot = await readGithubPublishReadiness({
      cwd: "/workspace",
      env: {},
      runCommand: vi.fn(async () => ({
        stdout: "https://github.com/hesamsheikh/octogent.git\n",
        stderr: "",
      })),
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        status: "needs_user_remote",
        origin: "https://github.com/hesamsheikh/octogent.git",
      }),
    );
  });

  it("blocks upstream aliases and redacts SCP-style remote users", async () => {
    await expect(
      readGithubPublishReadiness({
        cwd: "/workspace",
        runCommand: async () => ({
          stdout: "git@github.com:hesamsheikh/octogent.git\n",
          stderr: "",
        }),
      }),
    ).resolves.toEqual({
      status: "needs_user_remote",
      origin: "[redacted]@github.com:hesamsheikh/octogent.git",
      message:
        "Origin points to the upstream Octogent repository. Publishing is blocked until you set a user-owned remote.",
    });
  });

  it("requires exact approval and redacts credentials from the displayed remote", async () => {
    const origin = "https://token-value@github.com/jamesko/octogent-business.git";
    const runCommand = vi.fn(async () => ({ stdout: `${origin}\n`, stderr: "" }));
    const unapproved = await readGithubPublishReadiness({ cwd: "/workspace", env: {}, runCommand });
    const approved = await readGithubPublishReadiness({
      cwd: "/workspace",
      env: { OCTOGENT_GITHUB_PUBLISH_ORIGIN: origin },
      runCommand,
    });

    expect(unapproved.status).toBe("needs_approval");
    expect(unapproved.origin).toBe("https://[redacted]@github.com/jamesko/octogent-business.git");
    expect(approved.status).toBe("ready");
  });
});
