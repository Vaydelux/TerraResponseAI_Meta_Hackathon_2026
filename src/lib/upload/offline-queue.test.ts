import { describe, expect, it } from "vitest";
import { canReplayOfflineUpload } from "./offline-queue";

describe("private offline evidence ownership", () => {
  it("replays only drafts bound to the current authenticated user", () => {
    expect(canReplayOfflineUpload({ ownerId: "reporter-a" }, "reporter-a")).toBe(true);
    expect(canReplayOfflineUpload({ ownerId: "reporter-a" }, "reporter-b")).toBe(false);
    expect(canReplayOfflineUpload({ ownerId: "reporter-a" }, "")).toBe(false);
  });

  it("does not replay old ownerless drafts after an account switch", () => {
    expect(canReplayOfflineUpload({ ownerId: "" }, "reporter-a")).toBe(false);
    expect(canReplayOfflineUpload({ ownerId: undefined as unknown as string }, "reporter-a")).toBe(false);
  });
});
