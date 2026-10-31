export const DEFAULT_BOT_NAME = "Notetaker";

/** Keep a custom participant name and refresh saved stock names. */
export function savedBotName(value: string | null): string {
  const name = value?.trim();
  return !name || name === "Vexa" || name === "Vexa - Open Source Bot"
    ? DEFAULT_BOT_NAME
    : name;
}
