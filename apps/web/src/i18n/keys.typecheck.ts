import type { TFunction } from "i18next";

// Compiled by the existing web typecheck gate, never imported into the app bundle.
// Unused @ts-expect-error directives fail the build if typed keys stop being checked.
export function assertTranslationKeyTypes(common: TFunction<"common">, editor: TFunction<"editor">) {
  common("desktop.start");
  editor("shell.undo");
  editor("shell.windowsCount", { count: 2, formattedCount: "2" });
  // @ts-expect-error unknown common namespace key
  common("desktop.thisKeyDoesNotExist");
  // @ts-expect-error keys must belong to the selected namespace
  common("shell.undo");
  // @ts-expect-error a default value cannot bypass strict key checks
  editor("shell.thisKeyDoesNotExist", { defaultValue: "Fallback" });
}
