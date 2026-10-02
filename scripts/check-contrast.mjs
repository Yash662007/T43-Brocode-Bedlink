function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function luminance(r, g, b) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrast(hex1, hex2) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  const l1 = luminance(r1, g1, b1);
  const l2 = luminance(r2, g2, b2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

const pairs = [
  // Light mode
  { name: "Light: text (#0F1720) on bg (#F6F7F9)", fg: "#0F1720", bg: "#F6F7F9" },
  { name: "Light: text (#0F1720) on surface (#FFFFFF)", fg: "#0F1720", bg: "#FFFFFF" },
  { name: "Light: text-2 (#465263) on bg (#F6F7F9)", fg: "#465263", bg: "#F6F7F9" },
  { name: "Light: text-2 (#465263) on surface (#FFFFFF)", fg: "#465263", bg: "#FFFFFF" },
  { name: "Light: accent (#0A5CC7) on bg (#F6F7F9)", fg: "#0A5CC7", bg: "#F6F7F9" },
  { name: "Light: accent (#0A5CC7) on surface (#FFFFFF)", fg: "#0A5CC7", bg: "#FFFFFF" },
  { name: "Light: accent-text-on (#FFFFFF) on accent (#0A5CC7)", fg: "#FFFFFF", bg: "#0A5CC7" },
  { name: "Light: ok text (#0F7B3F) on ok surface (#E6F4EC)", fg: "#0F7B3F", bg: "#E6F4EC" },
  { name: "Light: warn text (#8A5300) on warn surface (#FFF1D6)", fg: "#8A5300", bg: "#FFF1D6" },
  {
    name: "Light: danger text (#B42318) on danger surface (#FDECEA)",
    fg: "#B42318",
    bg: "#FDECEA",
  },
  {
    name: "Light: unknown text (#566070) on unknown surface (#E9ECF1)",
    fg: "#566070",
    bg: "#E9ECF1",
  },

  // Dark mode
  { name: "Dark: text (#E8EDF2) on bg (#0E1318)", fg: "#E8EDF2", bg: "#0E1318" },
  { name: "Dark: text (#E8EDF2) on surface (#161D24)", fg: "#E8EDF2", bg: "#161D24" },
  { name: "Dark: text-2 (#A8B3BF) on bg (#0E1318)", fg: "#A8B3BF", bg: "#0E1318" },
  { name: "Dark: text-2 (#A8B3BF) on surface (#161D24)", fg: "#A8B3BF", bg: "#161D24" },
  { name: "Dark: accent (#6AA6FF) on bg (#0E1318)", fg: "#6AA6FF", bg: "#0E1318" },
  { name: "Dark: accent (#6AA6FF) on surface (#161D24)", fg: "#6AA6FF", bg: "#161D24" },
  { name: "Dark: accent-text-on (#0A1424) on accent (#6AA6FF)", fg: "#0A1424", bg: "#6AA6FF" },
  { name: "Dark: ok text (#4CC38A) on ok surface (#12301F)", fg: "#4CC38A", bg: "#12301F" },
  { name: "Dark: warn text (#F2B24C) on warn surface (#3A2A0C)", fg: "#F2B24C", bg: "#3A2A0C" },
  { name: "Dark: danger text (#FF7A6E) on danger surface (#3C1713)", fg: "#FF7A6E", bg: "#3C1713" },
  {
    name: "Dark: unknown text (#9AA6B4) on unknown surface (#232C36)",
    fg: "#9AA6B4",
    bg: "#232C36",
  },
];

for (const p of pairs) {
  const cr = contrast(p.fg, p.bg);
  console.log(
    `${p.name} => ${cr.toFixed(2)}:1 [${cr >= 7 ? "AAA" : cr >= 4.5 ? "AA" : cr >= 3 ? "AA-Large/UI" : "FAIL"}]`,
  );
}
