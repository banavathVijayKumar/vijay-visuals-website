// Shared typography stacks. The named faces are used only when already
// installed locally; every stack ends in dependable system fonts so missing
// Google Fonts connectivity never changes layout or readability.
export const FONT_STACKS = {
  luxury: "Cinzel, Georgia, 'Times New Roman', serif",
  sans: "'Plus Jakarta Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  script: "'Great Vibes', 'Brush Script MT', cursive",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

export function getTenantFontStack(fontFamily: string | undefined): string {
  return fontFamily === 'Cinzel' ? FONT_STACKS.luxury : FONT_STACKS.sans;
}
