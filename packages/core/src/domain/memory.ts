export type MemoryEntryType = "fact" | "decision" | "preference" | "handoff" | "research" | "note";

export type MemoryEntry = {
  id: string;
  type: MemoryEntryType;
  content: string;
  summary?: string;
  tags: string[];
  source: string;
  tentacleId?: string;
  createdAt: string;
  updatedAt: string;
};

export type MemorySnapshot = {
  entries: MemoryEntry[];
};
