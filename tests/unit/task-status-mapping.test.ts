import { describe, expect, it } from "vitest";
import { taskCompletePatch, taskReopenPatch } from "@/modules/tasks/status";

describe("taskCompletePatch", () => {
  it("sets status=COMPLETED and completedAt=now", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    expect(taskCompletePatch(now)).toEqual({ status: "COMPLETED", completedAt: now });
  });
});

describe("taskReopenPatch - Reopen-Verhalten", () => {
  it("resets status to OPEN and clears completedAt", () => {
    expect(taskReopenPatch()).toEqual({ status: "OPEN", completedAt: null });
  });
});
