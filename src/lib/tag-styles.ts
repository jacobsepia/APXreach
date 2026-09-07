/*
 * Tag colours, kept apart from the queries.
 *
 * The chips render in a client component, and anything it imports is bundled
 * for the browser — so a styling helper must not live in a module that also
 * imports the database. Pure, no dependencies, safe on either side.
 */

export const tagColors = ["plum", "lime", "amber", "rose", "sky", "slate"] as const;
export type TagColor = (typeof tagColors)[number];

/** The chip styles, one per colour, so a workspace's tags read as a set. */
export const tagStyles: Record<TagColor, string> = {
  plum: "bg-[var(--tint-strong)] text-[var(--accent-primary)]",
  lime: "bg-[#eef7dd] text-[#4d7c0f]",
  amber: "bg-[#fef3c7] text-[#a16207]",
  rose: "bg-[#fee2e2] text-[#b91c1c]",
  sky: "bg-[#e0f2fe] text-[#0369a1]",
  slate: "bg-[#eef1f4] text-[#475569]",
};

export function tagStyle(color: string): string {
  return tagStyles[(color as TagColor) in tagStyles ? (color as TagColor) : "plum"];
}
