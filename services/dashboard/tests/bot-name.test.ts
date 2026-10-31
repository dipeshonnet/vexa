import { describe, expect, it } from "vitest";
import { DEFAULT_BOT_NAME, savedBotName } from "../src/lib/bot-name";

describe("participant name", () => {
  it.each([null, "", "   ", "Vexa", "Vexa - Open Source Bot"])(
    "uses Notetaker for an unset or saved stock name (%s)", (stored) => {
      expect(savedBotName(stored)).toBe("Notetaker");
    },
  );

  it("preserves a custom participant name", () => {
    expect(savedBotName("  Team Notes  ")).toBe("Team Notes");
    expect(DEFAULT_BOT_NAME).toBe("Notetaker");
  });
});
