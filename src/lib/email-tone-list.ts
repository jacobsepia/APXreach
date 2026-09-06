/*
 * The four tones, on their own so the composer can import them without
 * dragging the server-side rewrite machinery into the browser bundle.
 */

export const tones = {
  professional: {
    label: "Professional",
    hint: "Polished, confident, and businesslike.",
    instruction:
      "polished, confident and businesslike. Complete sentences, courteous but not stiff, no slang and no exclamation marks.",
  },
  friendly: {
    label: "Friendly",
    hint: "Warm, natural, and conversational.",
    instruction:
      "warm, natural and conversational, the way a person writes to someone they like working with. Contractions are fine; keep it genuine, not gushing.",
  },
  direct: {
    label: "Direct",
    hint: "Concise, clear, and action-focused.",
    instruction:
      "concise, clear and action-focused. Lead with the point, cut filler and hedging, and make the next step unmistakable. Shorter than the original is good.",
  },
  empathetic: {
    label: "Empathetic",
    hint: "Considerate and understanding, especially for sensitive follow-ups.",
    instruction:
      "considerate and understanding, suited to a sensitive follow-up such as an overdue balance or a problem. Acknowledge the other person's situation, stay respectful and calm, and still say clearly what is needed.",
  },
} as const;

export type Tone = keyof typeof tones;
export const toneList = Object.keys(tones) as Tone[];
export function isTone(value: unknown): value is Tone {
  return typeof value === "string" && Object.hasOwn(tones, value);
}
