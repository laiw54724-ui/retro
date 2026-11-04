import { z } from "zod";

export const WindowChromePresetSchema = z.enum(["classic-95", "classic-98", "compact-98"]);
export const WindowControlActionSchema = z.enum(["minimize", "maximize", "close"]);

/** Omitted sections are automatic: render them only when the app supplies a slot. */
export const WindowChromeSectionsSchema = z.object({
  menuBar: z.boolean().optional(),
  toolbar: z.boolean().optional(),
  statusBar: z.boolean().optional(),
  footerActions: z.boolean().optional()
}).strict();

/**
 * Serializable presentation preferences shared by every window type.
 * App content, React nodes, callbacks, and arbitrary CSS belong outside this
 * contract. Keep this schema optional on a window so legacy documents do not
 * acquire persisted chrome merely by being loaded or migrated.
 */
export const WindowChromeSchema = z.object({
  preset: WindowChromePresetSchema.default("classic-98"),
  controls: z.array(WindowControlActionSchema)
    .max(3)
    .refine((controls) => new Set(controls).size === controls.length, "Window controls must be unique")
    .default(() => [...WindowControlActionSchema.options]),
  showIcon: z.boolean().default(true),
  density: z.enum(["normal", "compact"]).default("normal"),
  sections: WindowChromeSectionsSchema.optional()
}).strict();

export type WindowChromePreset = z.output<typeof WindowChromePresetSchema>;
export type WindowControlAction = z.output<typeof WindowControlActionSchema>;
export type WindowChromeSection = keyof z.output<typeof WindowChromeSectionsSchema>;
export type WindowChromeConfig = z.output<typeof WindowChromeSchema>;
export type WindowChromeInput = z.input<typeof WindowChromeSchema>;

/** Resolve render defaults without adding chrome to the source document. */
export function resolveWindowChrome(input?: WindowChromeInput): WindowChromeConfig {
  return WindowChromeSchema.parse(input ?? {});
}
