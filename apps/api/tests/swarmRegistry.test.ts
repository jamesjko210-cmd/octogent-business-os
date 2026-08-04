import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createSwarmRegistryStore, listSwarmRegistry } from "../src/swarmRegistry";

describe("listSwarmRegistry", () => {
  it("keeps game-business and research roles separate while deriving live state", () => {
    const swarms = listSwarmRegistry([
      {
        id: "codex-executor",
        title: "Codex Executor",
        role: "Scoped implementation",
        tentacleId: "game-business",
        preferredProvider: "codex",
        purpose: "Builds and tests.",
        spawnReason: "Launch for scoped work.",
        memoryAccess: "shared-project-memory",
        state: "working",
        providerConnection: "shell_started_unverified",
        currentActivity: "testing: Running checks.",
        terminalIds: ["codex-worker"],
      },
      {
        id: "research-triad",
        title: "Research Triad",
        role: "Research",
        tentacleId: "research",
        preferredProvider: "gemini-cli",
        purpose: "Researches.",
        spawnReason: "Launch for research.",
        memoryAccess: "shared-project-memory",
        state: "prepared",
        providerConnection: "not_started",
        currentActivity: "Prepared to start a scoped task; no provider session is running.",
        terminalIds: ["research-worker"],
      },
    ]);

    expect(swarms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "game-business",
          state: "working",
          workingCount: 1,
          activeRoles: [
            expect.objectContaining({
              id: "codex-executor",
              currentActivity: "testing: Running checks.",
            }),
          ],
        }),
        expect.objectContaining({
          id: "research",
          state: "prepared",
          preparedCount: 1,
          activeRoles: [expect.objectContaining({ id: "research-triad" })],
        }),
      ]),
    );
  });

  it("includes an operator-defined project swarm without changing the default teams", () => {
    const agents = [
      {
        id: "research-triad",
        title: "Research Triad",
        role: "Research",
        tentacleId: "research",
        preferredProvider: "gemini-cli" as const,
        purpose: "Researches.",
        spawnReason: "Launch for research.",
        memoryAccess: "shared-project-memory" as const,
        state: "not_launched" as const,
        providerConnection: "not_started" as const,
        currentActivity: "Not launched.",
        terminalIds: [],
      },
    ];
    const swarms = listSwarmRegistry(agents, [
      {
        id: "school-project",
        title: "School Project",
        purpose: "Keeps a separate school lane.",
        agentIds: ["research-triad"],
      },
    ]);

    expect(swarms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "game-business" }),
        expect.objectContaining({ id: "research" }),
        expect.objectContaining({ id: "school-project", title: "School Project", roleCount: 1 }),
      ]),
    );
  });

  it("persists a valid local project swarm and rejects a duplicate ID", () => {
    const projectStateDir = mkdtempSync(join(tmpdir(), "octogent-swarms-"));
    const agents = [
      {
        id: "research-triad",
        title: "Research Triad",
        role: "Research",
        tentacleId: "research",
        preferredProvider: "gemini-cli" as const,
        purpose: "Researches.",
        spawnReason: "Launch for research.",
        memoryAccess: "shared-project-memory" as const,
        state: "not_launched" as const,
        providerConnection: "not_started" as const,
        currentActivity: "Not launched.",
        terminalIds: [],
      },
    ];
    try {
      const store = createSwarmRegistryStore(projectStateDir);
      expect(
        store.create(
          {
            id: "school-project",
            title: "School Project",
            purpose: "Keeps a separate school lane.",
            agentIds: ["research-triad"],
          },
          agents,
        ),
      ).toMatchObject({ id: "school-project" });
      expect(createSwarmRegistryStore(projectStateDir).list()).toEqual([
        expect.objectContaining({ id: "school-project" }),
      ]);
      expect(() =>
        store.create(
          {
            id: "school-project",
            title: "Duplicate",
            purpose: "Duplicate.",
            agentIds: ["research-triad"],
          },
          agents,
        ),
      ).toThrow("already in use");
    } finally {
      rmSync(projectStateDir, { force: true, recursive: true });
    }
  });
});
