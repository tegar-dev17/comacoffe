import { describe, expect, it } from "vitest";
import { canTransition, isPaidStatus, resolveTransition } from "./state-machine.js";

describe("payment state machine", () => {
  it("allows pending to succeeded", () => {
    expect(canTransition("PENDING", "SUCCEEDED")).toBe(true);
    expect(resolveTransition("PENDING", "SUCCEEDED")).toBe("SUCCEEDED");
  });

  it("rejects succeeded to pending downgrade", () => {
    expect(resolveTransition("SUCCEEDED", "PENDING")).toBe("SUCCEEDED");
  });

  it("allows unknown recovery paths", () => {
    expect(resolveTransition("UNKNOWN", "SUCCEEDED")).toBe("SUCCEEDED");
  });

  it("identifies paid statuses", () => {
    expect(isPaidStatus("SUCCEEDED")).toBe(true);
    expect(isPaidStatus("PENDING")).toBe(false);
  });

  it("handles out-of-order weaker failed after succeeded", () => {
    expect(resolveTransition("SUCCEEDED", "FAILED")).toBe("SUCCEEDED");
  });
});
