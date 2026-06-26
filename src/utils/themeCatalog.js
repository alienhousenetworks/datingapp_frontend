export const BACKGROUND_PATTERNS = {
  FlameBlue: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 800'%3E%3Cpath fill='%230b1b3d' d='M0 0h800v800H0z'/%3E%3Cpath fill='%231a3b7c' d='M0 800c40-100 120-200 160-320S200 200 400 0h400v800z'/%3E%3Cpath fill='%232a5ab5' d='M100 800c40-150 80-250 120-350S300 200 500 0h300v800z'/%3E%3C/svg%3E")`,
  FlameRed: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 800'%3E%3Cpath fill='%233d0b0b' d='M0 0h800v800H0z'/%3E%3Cpath fill='%237c1a1a' d='M0 800c40-100 120-200 160-320S200 200 400 0h400v800z'/%3E%3Cpath fill='%23b52a2a' d='M100 800c40-150 80-250 120-350S300 200 500 0h300v800z'/%3E%3C/svg%3E")`,
  SquareSplash: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23b04a22'/%3E%3Crect x='10' y='10' width='80' height='80' fill='none' stroke='%238a3212' stroke-width='4'/%3E%3Crect x='25' y='25' width='50' height='50' fill='none' stroke='%23692108' stroke-width='4'/%3E%3C/svg%3E")`,
  PuzzleSplash: `radial-gradient(circle at center, #1b4b5e 0%, #0d2b38 100%), repeating-radial-gradient(circle at center, transparent 0, #1b4b5e 10px, transparent 15px, #266b85 20px, transparent 25px)`,
  SimpleFlame: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='60' viewBox='0 0 40 60'%3E%3Crect width='40' height='60' fill='%23581c0c'/%3E%3Cpath d='M20 0 Q40 30 20 60 Q0 30 20 0 Z' fill='%23a13718'/%3E%3C/svg%3E")`,
  AdvanceFlame: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='60' viewBox='0 0 40 60'%3E%3Crect width='40' height='60' fill='%230f3a47'/%3E%3Cpath d='M20 0 C40 20 30 50 20 60 C10 50 0 20 20 0 Z' fill='%2322768f'/%3E%3C/svg%3E")`,
  Flame1: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 800'%3E%3Cpath fill='%230b1b3d' d='M0 0h800v800H0z'/%3E%3Cpath fill='%231a3b7c' d='M0 800c40-100 120-200 160-320S200 200 400 0h400v800z'/%3E%3Cpath fill='%232a5ab5' d='M100 800c40-150 80-250 120-350S300 200 500 0h300v800z'/%3E%3C/svg%3E")`,
  PolaroidSplash: "radial-gradient(circle at 50% 50%, #064048 0%, #001214 100%), repeating-radial-gradient(circle at 0 0, transparent 0, #001214 20px, transparent 21px, #00D4AA 22px, transparent 23px)",
  ElegantFlame: "radial-gradient(ellipse at bottom, #1B2735 0%, #090A0F 100%), linear-gradient(135deg, #090A0F 25%, #1a1a2e 50%, #090A0F 75%)",
  B01: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 800'%3E%3Cpath fill='%230b1b3d' d='M0 0h800v800H0z'/%3E%3Cpath fill='%231a3b7c' d='M0 800c40-100 120-200 160-320S200 200 400 0h400v800z'/%3E%3Cpath fill='%232a5ab5' d='M100 800c40-150 80-250 120-350S300 200 500 0h300v800z'/%3E%3C/svg%3E")`,
  B02: `radial-gradient(circle at center, #1b4b5e 0%, #0d2b38 100%), repeating-radial-gradient(circle at center, transparent 0, #1b4b5e 10px, transparent 15px, #266b85 20px, transparent 25px)`,
  B03: "radial-gradient(circle at 50% 50%, #064048 0%, #001214 100%), repeating-radial-gradient(circle at 0 0, transparent 0, #001214 20px, transparent 21px, #00D4AA 22px, transparent 23px)",
};

const VARIANT_ACCENTS = {
  sunset: "#ff6b35",
  ocean: "#0077b6",
  midnight: "#3d348b",
  pink: "#ff1f6b",
  teal: "#00d4aa",
  violet: "#a855f7",
  gold: "#f5b800",
  coral: "#ff6fa3",
  ice: "#a5f3fc",
  emerald: "#10b981",
  rose: "#fb7185",
  slate: "#64748b",
  amber: "#f59e0b",
};

export function resolveThemeStyles(theme) {
  const layoutId = theme?.layout_id || "L01";
  const bgId = theme?.bg_id || "B01";
  const variantId = theme?.bg_variant_id || "B01-sunset";
  const token = theme?.color_token || variantId.split("-").pop() || "sunset";
  const accent = VARIANT_ACCENTS[token] || VARIANT_ACCENTS.sunset;
  const pattern =
    BACKGROUND_PATTERNS[bgId] ||
    BACKGROUND_PATTERNS.B01 ||
    BACKGROUND_PATTERNS.FlameBlue;
  const background = `linear-gradient(135deg, ${accent}55, ${accent}18), ${pattern}`;

  return {
    layoutId,
    bgId,
    variantId,
    accent,
    cardStyle: {
      background,
      borderColor: `${accent}44`,
      boxShadow: `0 8px 32px ${accent}22`,
    },
    accentBar: {
      background: `linear-gradient(90deg, ${accent}, transparent)`,
    },
    swatchStyle: {
      background: `radial-gradient(circle at 30% 30%, ${accent}, ${accent}88)`,
      borderColor: accent,
    },
  };
}