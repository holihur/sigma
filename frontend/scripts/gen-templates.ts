// @ts-nocheck
/**
 * Generates the built-in template documents embedded by the Go backend.
 * Run with: pnpm gen:templates
 */
import fs from "node:fs";
import path from "node:path";

let tick = 1_760_000_000_000;
const registry = new Map();

const solid = (color, opacity) => (opacity === undefined ? { type: "solid", color } : { type: "solid", color, opacity });
const grad = (angle, ...stops) => ({
  type: "linear",
  angle,
  stops: stops.map(([color, position], i) => ({ color, position: position ?? i / Math.max(stops.length - 1, 1) })),
});
const shadow = (x, y, blur, spread, color) => ({ x, y, blur, spread, color });
const link = (pageId, frameId, transition = "instant") => ({ action: "navigate", targetPageId: pageId, targetFrameId: frameId, transition });

function node(type, props, children = []) {
  const n = {
    id: props.id,
    type,
    name: props.name || type,
    x: props.x ?? 0,
    y: props.y ?? 0,
    width: props.width ?? 100,
    height: props.height ?? 100,
    rotation: 0,
    opacity: props.opacity ?? 1,
    visible: props.visible ?? true,
    locked: false,
    fill: props.fill ?? null,
    stroke: props.stroke ?? null,
    strokeWidth: props.strokeWidth ?? 1,
    radius: props.radius ?? 0,
    shadow: props.shadow ?? null,
    blur: props.blur ?? 0,
    children: [],
    parentId: props.parentId ?? null,
    clip: props.clip ?? false,
    text: props.text ?? "",
    fontSize: props.fontSize ?? 16,
    fontFamily: "Inter Variable",
    fontWeight: props.fontWeight ?? 400,
    lineHeight: props.lineHeight ?? 1.4,
    letterSpacing: props.letterSpacing ?? 0,
    textAlign: props.textAlign ?? "left",
    verticalAlign: props.verticalAlign ?? "top",
    src: props.src ?? "",
    objectFit: "cover",
    link: props.link ?? null,
    ts: ++tick,
  };
  n.children = children.map((c) => c.id);
  for (const c of children) c.parentId = n.id;
  registry.set(n.id, n);
  return n;
}

const text = (id, name, content, x, y, width, height, opts = {}) =>
  node("text", { id, name, text: content, x, y, width, height, fill: solid(opts.color ?? "#111827"), fontSize: opts.size ?? 16, fontWeight: opts.weight ?? 400, lineHeight: opts.lineHeight ?? 1.4, letterSpacing: opts.letterSpacing ?? 0, textAlign: opts.align ?? "left", verticalAlign: opts.valign ?? "top", opacity: opts.opacity ?? 1, link: opts.link });

const rect = (id, name, x, y, width, height, opts = {}) =>
  node("rect", { id, name, x, y, width, height, fill: opts.fill ?? solid("#ffffff"), stroke: opts.stroke, strokeWidth: opts.strokeWidth ?? 1, radius: opts.radius ?? 0, shadow: opts.shadow, opacity: opts.opacity ?? 1, blur: opts.blur ?? 0, link: opts.link });

const ellipse = (id, name, x, y, width, height, opts = {}) =>
  node("ellipse", { id, name, x, y, width, height, fill: opts.fill ?? solid("#ffffff"), stroke: opts.stroke, strokeWidth: opts.strokeWidth ?? 1, opacity: opts.opacity ?? 1, blur: opts.blur ?? 0, shadow: opts.shadow });

const frame = (id, name, x, y, width, height, opts = {}, children = []) =>
  node("frame", { id, name, x, y, width, height, fill: opts.fill ?? solid("#ffffff"), radius: opts.radius ?? 0, clip: opts.clip ?? true, shadow: opts.shadow, opacity: opts.opacity ?? 1 }, children);

const page = (id, name, roots) => ({
  id,
  name,
  nodes: Object.fromEntries(collect(roots).map((n) => [n.id, n])),
  rootIds: roots.map((r) => r.id),
  ts: ++tick,
});

function collect(roots) {
  const out = [];
  const seen = new Set();
  const walk = (n) => {
    if (!n || seen.has(n.id)) return;
    seen.add(n.id);
    out.push(n);
    for (const id of n.children || []) walk(registry.get(id));
  };
  for (const n of roots) walk(n);
  return out;
}

/* ------------------------------------------------------------------ */
/*  Mobile app onboarding                                              */
/* ------------------------------------------------------------------ */

const MP = "mp_onboarding";
const MS = "mp_system";
const M1 = "mf_onboard_1";
const M2 = "mf_onboard_2";
const M3 = "mf_onboard_3";

function statusBar(prefix, dark = true) {
  return [
    text(`${prefix}_time`, "Time", "9:41", 28, 18, 50, 18, { size: 13, weight: 600, color: dark ? "#FFFFFF" : "#111827" }),
    rect(`${prefix}_sig1`, "Signal", 300, 24, 3, 6, { radius: 1, fill: solid(dark ? "#FFFFFF" : "#111827") }),
    rect(`${prefix}_sig2`, "Signal", 305, 22, 3, 8, { radius: 1, fill: solid(dark ? "#FFFFFF" : "#111827") }),
    rect(`${prefix}_sig3`, "Signal", 310, 20, 3, 10, { radius: 1, fill: solid(dark ? "#FFFFFF" : "#111827") }),
    rect(`${prefix}_battery`, "Battery", 320, 20, 22, 11, { radius: 3, fill: solid(dark ? "#FFFFFF" : "#111827", 0.25), stroke: solid(dark ? "#FFFFFF" : "#111827", 0.5), strokeWidth: 1 }),
    rect(`${prefix}_battery_fill`, "Battery level", 322, 22, 15, 7, { radius: 2, fill: solid(dark ? "#FFFFFF" : "#111827") }),
  ];
}

const mobile1 = frame(M1, "Onboarding · 01", 0, 0, 390, 844, { fill: solid("#0B0A12"), radius: 0 }, [
  ellipse("m1_glow1", "Purple glow", -160, -200, 560, 560, { fill: grad(135, ["#7C5CFF", 0], ["#7C5CFF00", 1]), opacity: 0.75, blur: 70 }),
  ellipse("m1_glow2", "Pink glow", 210, 470, 360, 360, { fill: grad(135, ["#F472B6", 0], ["#F472B600", 1]), opacity: 0.5, blur: 70 }),
  ...statusBar("m1"),
  rect("m1_pill", "Badge", 28, 82, 132, 28, { radius: 14, fill: solid("#7C5CFF", 0.18), stroke: solid("#A78BFA", 0.25) }),
  text("m1_pill_text", "Badge label", "NEW · 2 MIN READ", 42, 89, 116, 14, { size: 9, weight: 600, color: "#C4B5FD", letterSpacing: 0.8 }),
  text("m1_heading", "Headline", "Design at the\nspeed of thought.", 28, 270, 334, 96, { size: 38, weight: 700, color: "#FFFFFF", lineHeight: 1.12, letterSpacing: -1 }),
  text("m1_body", "Body", "Turn rough ideas into interactive prototypes. Build, test and share — all on one infinite canvas.", 28, 390, 320, 70, { size: 14, weight: 400, color: "#A9A5B8", lineHeight: 1.65 }),
  rect("m1_card", "Illustration", 28, 492, 334, 190, { radius: 26, fill: grad(135, ["#7C5CFF", 0], ["#4C1D95", 1]), shadow: shadow(0, 18, 40, -12, "rgba(124,92,255,.55)") }),
  rect("m1_card_screen", "Mini screen", 196, 516, 150, 104, { radius: 14, fill: solid("#FFFFFF", 0.13), stroke: solid("#FFFFFF", 0.18) }),
  rect("m1_card_bar1", "Bar", 210, 532, 58, 8, { radius: 4, fill: solid("#FFFFFF", 0.55) }),
  rect("m1_card_bar2", "Bar", 210, 548, 92, 6, { radius: 3, fill: solid("#FFFFFF", 0.24) }),
  rect("m1_card_chart", "Chart", 210, 568, 122, 36, { radius: 8, fill: grad(90, ["#F472B6", 0], ["#A78BFA", 1]), opacity: 0.85 }),
  ellipse("m1_card_circle", "Avatar", 56, 518, 54, 54, { fill: solid("#FFFFFF", 0.9) }),
  text("m1_card_num", "01", "01", 70, 530, 32, 30, { size: 16, weight: 700, color: "#6D4AFF" }),
  text("m1_card_aa", "Aa", "Aa", 56, 590, 130, 70, { size: 62, weight: 700, color: "#FFFFFF", lineHeight: 1 }),
  rect("m1_dot1", "Dot", 28, 712, 20, 4, { radius: 2, fill: solid("#7C5CFF") }),
  rect("m1_dot2", "Dot", 54, 712, 6, 4, { radius: 2, fill: solid("#FFFFFF", 0.2) }),
  rect("m1_dot3", "Dot", 66, 712, 6, 4, { radius: 2, fill: solid("#FFFFFF", 0.2) }),
  rect("m1_cta", "Get started button", 28, 738, 334, 62, { radius: 18, fill: solid("#7C5CFF"), shadow: shadow(0, 10, 28, -8, "rgba(124,92,255,.7)"), link: link(MP, M2, "slide-left") }),
  text("m1_cta_text", "Get started", "Get started", 28, 738, 334, 62, { size: 15, weight: 600, color: "#FFFFFF", align: "center", valign: "middle" }),
]);

const mobile2 = frame(M2, "Onboarding · 02", 470, 0, 390, 844, { fill: solid("#F8F6FF") }, [
  ellipse("m2_glow1", "Glow", 200, -140, 380, 380, { fill: grad(135, ["#E9D5FF", 0], ["#E9D5FF00", 1]), opacity: 0.9, blur: 50 }),
  ellipse("m2_glow2", "Glow", -120, 560, 320, 320, { fill: grad(135, ["#FBCFE8", 0], ["#FBCFE800", 1]), opacity: 0.8, blur: 50 }),
  ...statusBar("m2", false),
  rect("m2_back", "Back button", 24, 64, 38, 38, { radius: 19, fill: solid("#FFFFFF"), stroke: solid("#E7E2F5"), shadow: shadow(0, 4, 10, -4, "rgba(76,29,149,.14)"), link: { action: "back", transition: "dissolve" } }),
  text("m2_back_icon", "Back", "←", 24, 64, 38, 38, { size: 18, weight: 500, color: "#4C1D95", align: "center", valign: "middle" }),
  text("m2_step", "Step", "1 of 3", 320, 73, 46, 18, { size: 10, weight: 600, color: "#7C6AA8", align: "right" }),
  rect("m2_hero", "Hero", 24, 124, 342, 344, { radius: 30, fill: grad(150, ["#FBCFE8", 0], ["#C4B5FD", 0.55], ["#A78BFA", 1]), shadow: shadow(0, 24, 50, -18, "rgba(124,92,255,.35)") }),
  ellipse("m2_hero_c1", "Shape", 66, 170, 170, 170, { fill: solid("#FFFFFF", 0.32) }),
  ellipse("m2_hero_c2", "Shape", 186, 246, 118, 118, { fill: solid("#7C5CFF", 0.5) }),
  rect("m2_hero_panel", "Panel", 64, 306, 262, 118, { radius: 18, fill: solid("#FFFFFF", 0.82) }),
  rect("m2_hero_line1", "Line", 84, 328, 82, 8, { radius: 4, fill: solid("#C4B5FD") }),
  rect("m2_hero_line2", "Line", 84, 346, 150, 6, { radius: 3, fill: solid("#E9D5FF") }),
  rect("m2_hero_btn", "Mini button", 84, 372, 96, 32, { radius: 10, fill: solid("#7C5CFF") }),
  text("m2_hero_btn_text", "Open", "Open", 84, 372, 96, 32, { size: 11, weight: 600, color: "#FFFFFF", align: "center", valign: "middle" }),
  text("m2_heading", "Headline", "Your team,\nin sync.", 24, 500, 280, 84, { size: 36, weight: 700, color: "#171421", lineHeight: 1.1, letterSpacing: -0.8 }),
  text("m2_body", "Body", "Comment, review and iterate together. Every change is live for everyone.", 24, 594, 330, 52, { size: 13, weight: 400, color: "#6B6478", lineHeight: 1.6 }),
  rect("m2_feat1_icon", "Icon", 24, 664, 34, 34, { radius: 10, fill: solid("#EDE9FE") }),
  text("m2_feat1_glyph", "Icon", "✦", 24, 664, 34, 34, { size: 14, weight: 600, color: "#7C5CFF", align: "center", valign: "middle" }),
  text("m2_feat1", "Feature", "Real-time collaboration", 68, 671, 250, 20, { size: 13, weight: 500, color: "#272130" }),
  rect("m2_feat2_icon", "Icon", 24, 710, 34, 34, { radius: 10, fill: solid("#FCE7F3") }),
  text("m2_feat2_glyph", "Icon", "◎", 24, 710, 34, 34, { size: 14, weight: 600, color: "#DB2777", align: "center", valign: "middle" }),
  text("m2_feat2", "Feature", "Pixel-perfect prototypes", 68, 717, 250, 20, { size: 13, weight: 500, color: "#272130" }),
  rect("m2_cta", "Primary button", 24, 762, 342, 58, { radius: 17, fill: solid("#171421"), shadow: shadow(0, 10, 24, -10, "rgba(23,20,33,.45)"), link: link(MP, M3, "slide-left") }),
  text("m2_cta_text", "Create project", "Create your first project", 24, 762, 342, 58, { size: 14, weight: 600, color: "#FFFFFF", align: "center", valign: "middle" }),
]);

const mobile3 = frame(M3, "Onboarding · 03", 940, 0, 390, 844, { fill: solid("#0B0A12") }, [
  ellipse("m3_glow", "Glow", -100, 160, 620, 620, { fill: grad(135, ["#7C5CFF", 0], ["#7C5CFF00", 1]), opacity: 0.65, blur: 80 }),
  ...statusBar("m3"),
  text("m3_step", "Step", "3 of 3", 28, 82, 80, 18, { size: 10, weight: 600, color: "#8B85A0", letterSpacing: 1 }),
  rect("m3_check", "Success", 145, 236, 100, 100, { radius: 50, fill: solid("#A3E635"), shadow: shadow(0, 22, 60, -12, "rgba(163,230,53,.55)") }),
  text("m3_check_icon", "Check", "✓", 145, 236, 100, 100, { size: 42, weight: 700, color: "#0B0A12", align: "center", valign: "middle" }),
  text("m3_heading", "Headline", "You’re\nall set.", 28, 384, 334, 100, { size: 44, weight: 700, color: "#FFFFFF", lineHeight: 1.08, letterSpacing: -1 }),
  text("m3_body", "Body", "Your workspace is ready. Invite your team and start building something people love.", 28, 508, 320, 66, { size: 14, weight: 400, color: "#A9A5B8", lineHeight: 1.65 }),
  rect("m3_cta", "Open workspace", 28, 620, 334, 60, { radius: 18, fill: solid("#7C5CFF"), shadow: shadow(0, 12, 32, -10, "rgba(124,92,255,.7)"), link: link(MP, M1, "dissolve") }),
  text("m3_cta_text", "Open workspace", "Open workspace", 28, 620, 334, 60, { size: 15, weight: 600, color: "#FFFFFF", align: "center", valign: "middle" }),
  rect("m3_secondary", "Invite teammates", 28, 694, 334, 58, { radius: 18, fill: solid("#FFFFFF", 0.05), stroke: solid("#FFFFFF", 0.14) }),
  text("m3_secondary_text", "Invite teammates", "Invite teammates", 28, 694, 334, 58, { size: 14, weight: 500, color: "#EFEAFE", align: "center", valign: "middle" }),
  text("m3_hint", "Hint", "You can always change this later in settings.", 28, 782, 334, 20, { size: 10, color: "#6F6A80", align: "center" }),
  rect("m3_confetti1", "Confetti", 86, 190, 8, 8, { radius: 2, fill: solid("#F472B6"), opacity: 0.8 }),
  rect("m3_confetti2", "Confetti", 300, 310, 10, 10, { radius: 3, fill: solid("#A3E635"), opacity: 0.8 }),
  rect("m3_confetti3", "Confetti", 74, 424, 6, 12, { radius: 2, fill: solid("#60A5FA"), opacity: 0.8 }),
  rect("m3_confetti4", "Confetti", 312, 460, 6, 6, { radius: 3, fill: solid("#FBBF24"), opacity: 0.8 }),
]);

// Design system page
const system = frame("mf_system", "Design foundations", 0, 0, 900, 640, { fill: solid("#F8F6FF"), radius: 0 }, [
  text("ds_title", "Title", "Design foundations", 48, 44, 420, 44, { size: 30, weight: 700, color: "#171421", letterSpacing: -0.6 }),
  text("ds_sub", "Subtitle", "A shared language for the mobile onboarding flow.", 48, 92, 460, 24, { size: 13, color: "#6B6478" }),
  text("ds_colors_label", "Colors", "Color", 48, 148, 200, 20, { size: 11, weight: 600, color: "#8B85A0", letterSpacing: 0.8 }),
  ...["#7C5CFF", "#F472B6", "#A3E635", "#0B0A12", "#F8F6FF"].map((color, i) =>
    rect(`ds_swatch_${i}`, "Swatch", 48 + i * 148, 176, 128, 84, { radius: 16, fill: solid(color), stroke: solid("#000000", 0.06), shadow: color === "#F8F6FF" ? shadow(0, 8, 20, -8, "rgba(23,20,33,.18)") : undefined }),
  ),
  text("ds_type_label", "Type", "Typography", 48, 302, 200, 20, { size: 11, weight: 600, color: "#8B85A0", letterSpacing: 0.8 }),
  text("ds_type1", "Display", "Design at the speed of thought.", 48, 330, 600, 62, { size: 38, weight: 700, color: "#171421", lineHeight: 1.1, letterSpacing: -1 }),
  text("ds_type2", "Body", "The quick brown fox jumps over the lazy dog. Build realistic flows and test them with your team.", 48, 414, 600, 50, { size: 14, color: "#6B6478", lineHeight: 1.6 }),
  text("ds_buttons_label", "Buttons", "Components", 48, 498, 200, 20, { size: 11, weight: 600, color: "#8B85A0", letterSpacing: 0.8 }),
  rect("ds_btn_primary", "Primary button", 48, 528, 180, 52, { radius: 16, fill: solid("#7C5CFF"), shadow: shadow(0, 10, 24, -10, "rgba(124,92,255,.55)") }),
  text("ds_btn_primary_text", "Label", "Primary action", 48, 528, 180, 52, { size: 13, weight: 600, color: "#FFFFFF", align: "center", valign: "middle" }),
  rect("ds_btn_secondary", "Secondary button", 244, 528, 180, 52, { radius: 16, fill: solid("#FFFFFF"), stroke: solid("#E7E2F5") }),
  text("ds_btn_secondary_text", "Label", "Secondary", 244, 528, 180, 52, { size: 13, weight: 500, color: "#171421", align: "center", valign: "middle" }),
  rect("ds_btn_dark", "Dark button", 440, 528, 180, 52, { radius: 16, fill: solid("#171421") }),
  text("ds_btn_dark_text", "Label", "Dark action", 440, 528, 180, 52, { size: 13, weight: 600, color: "#FFFFFF", align: "center", valign: "middle" }),
  rect("ds_card", "Preview card", 676, 302, 176, 278, { radius: 24, fill: solid("#FFFFFF"), stroke: solid("#E7E2F5"), shadow: shadow(0, 16, 40, -18, "rgba(23,20,33,.18)") }),
  rect("ds_card_img", "Preview image", 692, 318, 144, 140, { radius: 16, fill: grad(135, ["#7C5CFF", 0], ["#F472B6", 1]) }),
  text("ds_card_title", "Card title", "Profile card", 692, 474, 144, 20, { size: 13, weight: 600, color: "#171421" }),
  text("ds_card_body", "Card body", "Reusable patterns keep the product consistent.", 692, 498, 144, 40, { size: 10, color: "#6B6478", lineHeight: 1.5 }),
  rect("ds_card_btn", "Card action", 692, 546, 144, 26, { radius: 8, fill: solid("#7C5CFF", 0.12) }),
  text("ds_card_btn_text", "Action", "View details", 692, 546, 144, 26, { size: 10, weight: 600, color: "#6D4AFF", align: "center", valign: "middle" }),
]);

const mobileDoc = {
  pages: [
    page(MP, "Onboarding", [mobile1, mobile2, mobile3]),
    page(MS, "Design system", [system]),
  ],
  tombstones: {},
};

/* ------------------------------------------------------------------ */
/*  Northwind landing page                                             */
/* ------------------------------------------------------------------ */

const WP = "wp_landing";
const WPR = "wp_pricing";
const WL = "wf_landing";
const WC = "wf_pricing";

const landing = frame(WL, "Landing", 0, 0, 1440, 1024, { fill: solid("#F7F7F9"), radius: 0 }, [
  text("wl_logo", "Logo", "northwind", 64, 28, 140, 26, { size: 19, weight: 700, color: "#111827", letterSpacing: -0.4 }),
  text("wl_nav_product", "Nav", "Product", 506, 34, 64, 20, { size: 13, weight: 500, color: "#4B5563" }),
  text("wl_nav_solutions", "Nav", "Solutions", 586, 34, 72, 20, { size: 13, weight: 500, color: "#4B5563" }),
  text("wl_nav_pricing", "Nav", "Pricing", 674, 34, 56, 20, { size: 13, weight: 500, color: "#4B5563", link: link(WPR, WC, "dissolve") }),
  text("wl_nav_docs", "Nav", "Docs", 746, 34, 44, 20, { size: 13, weight: 500, color: "#4B5563" }),
  text("wl_signin", "Sign in", "Sign in", 1174, 34, 56, 20, { size: 13, weight: 500, color: "#111827" }),
  rect("wl_cta_nav", "Start free", 1252, 24, 124, 36, { radius: 10, fill: solid("#111827"), link: link(WPR, WC, "dissolve") }),
  text("wl_cta_nav_text", "Start free", "Start free", 1252, 24, 124, 36, { size: 12, weight: 600, color: "#FFFFFF", align: "center", valign: "middle" }),

  ellipse("wl_glow1", "Glow", 380, -100, 760, 500, { fill: grad(180, ["#E9E4FF", 0], ["#F7F7F900", 1]), opacity: 0.9, blur: 50 }),
  rect("wl_pill", "Badge", 596, 132, 248, 32, { radius: 16, fill: solid("#FFFFFF"), stroke: solid("#E5E7EB"), shadow: shadow(0, 4, 12, -4, "rgba(17,24,39,.08)") }),
  ellipse("wl_pill_dot", "Dot", 612, 145, 6, 6, { fill: solid("#7C5CFF") }),
  text("wl_pill_text", "Badge", "New · AI-assisted workflows", 626, 142, 206, 14, { size: 11, weight: 500, color: "#4B5563" }),
  text("wl_h1", "Headline", "Ship interfaces\npeople love.", 260, 194, 920, 168, { size: 76, weight: 700, color: "#0F1115", lineHeight: 1.03, letterSpacing: -3, align: "center" }),
  text("wl_sub", "Subheadline", "Northwind brings design, prototyping and feedback into one fast, focused workspace for modern product teams.", 360, 384, 720, 56, { size: 17, color: "#6B7280", lineHeight: 1.6, align: "center" }),
  rect("wl_hero_cta", "Get started", 570, 466, 150, 48, { radius: 12, fill: solid("#7C5CFF"), shadow: shadow(0, 10, 24, -10, "rgba(124,92,255,.6)") }),
  text("wl_hero_cta_text", "Get started", "Get started", 570, 466, 150, 48, { size: 13, weight: 600, color: "#FFFFFF", align: "center", valign: "middle" }),
  rect("wl_hero_secondary", "Book a demo", 732, 466, 138, 48, { radius: 12, fill: solid("#FFFFFF"), stroke: solid("#E5E7EB") }),
  text("wl_hero_secondary_text", "Book a demo", "Book a demo", 732, 466, 138, 48, { size: 13, weight: 600, color: "#111827", align: "center", valign: "middle" }),
  text("wl_proof", "Social proof", "Trusted by 4,000+ product teams", 560, 540, 320, 18, { size: 11, color: "#9CA3AF", align: "center" }),

  rect("wl_shot", "Product preview", 180, 590, 1080, 430, { radius: 24, fill: solid("#FFFFFF"), stroke: solid("#E5E7EB"), shadow: shadow(0, 40, 90, -30, "rgba(17,24,39,.25)") }),
  rect("wl_shot_sidebar", "Sidebar", 180, 590, 200, 430, { radius: 24, fill: solid("#FBFBFD"), stroke: solid("#EEF0F4") }),
  rect("wl_shot_logo", "Logo", 204, 618, 80, 10, { radius: 5, fill: solid("#111827") }),
  rect("wl_shot_nav1", "Nav", 204, 660, 136, 30, { radius: 8, fill: solid("#7C5CFF", 0.12) }),
  rect("wl_shot_nav1_dot", "Dot", 214, 671, 8, 8, { radius: 2, fill: solid("#7C5CFF") }),
  text("wl_shot_nav1_text", "Nav", "Overview", 232, 671, 90, 12, { size: 10, weight: 600, color: "#4C1D95" }),
  ...Array.from({ length: 5 }).map((_, i) => rect(`wl_shot_nav_${i}`, "Nav", 214, 706 + i * 30, i % 2 ? 92 : 116, 10, { radius: 5, fill: solid("#9CA3AF", 0.35) })),
  text("wl_shot_title", "Title", "Weekly overview", 412, 622, 240, 26, { size: 18, weight: 600, color: "#111827" }),
  text("wl_shot_sub", "Subtitle", "Your team shipped 18 updates this week.", 412, 652, 400, 18, { size: 11, color: "#9CA3AF" }),
  ...Array.from({ length: 4 }).map((_, i) =>
    rect(`wl_shot_kpi_${i}`, "KPI", 412 + i * 202, 690, 186, 88, { radius: 12, fill: solid("#FFFFFF"), stroke: solid("#EEF0F4") }),
  ),
  ...[0, 1, 2, 3].map((i) => text(`wl_shot_kpi_label_${i}`, "Label", ["Active users", "Conversions", "Avg. session", "NPS"][i], 424 + i * 202, 706, 120, 14, { size: 9, color: "#9CA3AF" })),
  ...[0, 1, 2, 3].map((i) => text(`wl_shot_kpi_value_${i}`, "Value", ["24.8k", "6.4%", "4m 12s", "68"][i], 424 + i * 202, 726, 140, 30, { size: 22, weight: 700, color: "#111827", letterSpacing: -0.5 })),
  rect("wl_shot_chart", "Chart", 412, 798, 578, 194, { radius: 12, fill: solid("#FFFFFF"), stroke: solid("#EEF0F4") }),
  text("wl_shot_chart_title", "Chart", "Revenue", 428, 814, 120, 16, { size: 11, weight: 600, color: "#111827" }),
  ...Array.from({ length: 12 }).map((_, i) => {
    const heights = [54, 76, 48, 92, 70, 110, 84, 130, 102, 118, 142, 126];
    return rect(`wl_shot_bar_${i}`, "Bar", 440 + i * 44, 962 - heights[i], 24, heights[i], { radius: 5, fill: solid(i === 11 ? "#7C5CFF" : "#DDD6FE") });
  }),
  rect("wl_shot_right", "Activity", 1006, 798, 230, 194, { radius: 12, fill: solid("#FFFFFF"), stroke: solid("#EEF0F4") }),
  text("wl_shot_right_title", "Title", "Recent activity", 1022, 814, 160, 16, { size: 11, weight: 600, color: "#111827" }),
  ...Array.from({ length: 4 }).map((_, i) => ellipse(`wl_shot_avatar_${i}`, "Avatar", 1022, 842 + i * 32, 20, 20, { fill: solid(["#C4B5FD", "#FBCFE8", "#BFDBFE", "#BBF7D0"][i]) })),
  ...Array.from({ length: 4 }).map((_, i) => rect(`wl_shot_activity_${i}`, "Line", 1052, 847 + i * 32, i === 3 ? 92 : 140, 8, { radius: 4, fill: solid("#E5E7EB") })),

  // Logo strip + features
  text("wl_logos_label", "Logos", "POWERING PRODUCT TEAMS AT", 590, 1050, 260, 16, { size: 10, weight: 600, color: "#9CA3AF", letterSpacing: 1.6, align: "center" }),
]);

// Landing is taller than 1024; include feature section in a second frame for clarity.
const landing2 = frame("wf_landing_features", "Features", 0, 1120, 1440, 820, { fill: solid("#FFFFFF"), radius: 0 }, [
  text("wf_eyebrow", "Eyebrow", "WHY NORTHWIND", 640, 64, 160, 16, { size: 10, weight: 700, color: "#7C5CFF", letterSpacing: 1.6, align: "center" }),
  text("wf_h2", "Headline", "Everything you need to go from idea to launch.", 260, 96, 920, 110, { size: 44, weight: 700, color: "#0F1115", lineHeight: 1.12, letterSpacing: -1.4, align: "center" }),
  ...Array.from({ length: 3 }).map((_, i) => {
    const titles = ["Design together", "Prototype in minutes", "Ship with confidence"];
    const bodies = [
      "Multiplayer canvas with live cursors, comments and version history built in.",
      "Turn frames into clickable flows. Share a link and test with real users.",
      "Handoff-ready specs and exports that stay in sync with your design.",
    ];
    const accents = ["#7C5CFF", "#F472B6", "#0EA5E9"];
    return [
      rect(`wf_feat_${i}`, "Feature card", 120 + i * 416, 250, 376, 300, { radius: 20, fill: solid("#F9FAFB"), stroke: solid("#EEF0F4") }),
      rect(`wf_feat_icon_${i}`, "Icon", 152 + i * 416, 282, 44, 44, { radius: 12, fill: solid(accents[i], 0.14) }),
      ellipse(`wf_feat_dot_${i}`, "Dot", 167 + i * 416, 297, 14, 14, { fill: solid(accents[i]) }),
      text(`wf_feat_title_${i}`, "Title", titles[i], 152 + i * 416, 350, 300, 28, { size: 20, weight: 600, color: "#111827", letterSpacing: -0.3 }),
      text(`wf_feat_body_${i}`, "Body", bodies[i], 152 + i * 416, 392, 304, 70, { size: 13, color: "#6B7280", lineHeight: 1.65 }),
      rect(`wf_feat_link_${i}`, "Link", 152 + i * 416, 486, 96, 20, { radius: 0, fill: solid(accents[i], 0.001) }),
      text(`wf_feat_link_text_${i}`, "Link", "Learn more →", 152 + i * 416, 484, 120, 20, { size: 11, weight: 600, color: accents[i] }),
    ];
  }).flat(),
  rect("wf_band", "CTA band", 120, 606, 1200, 150, { radius: 24, fill: grad(120, ["#111827", 0], ["#312E81", 1]) }),
  text("wf_band_title", "CTA", "Ready to build something people love?", 160, 640, 700, 34, { size: 26, weight: 600, color: "#FFFFFF", letterSpacing: -0.5 }),
  text("wf_band_sub", "CTA", "Start free. Invite your team in seconds.", 160, 684, 500, 20, { size: 13, color: "#C7D2FE" }),
  rect("wf_band_btn", "CTA button", 1150, 660, 130, 44, { radius: 11, fill: solid("#FFFFFF") }),
  text("wf_band_btn_text", "CTA", "Start free", 1150, 660, 130, 44, { size: 13, weight: 600, color: "#111827", align: "center", valign: "middle" }),
]);

const pricing = frame(WC, "Pricing", 0, 0, 1440, 1024, { fill: solid("#F7F7F9"), radius: 0 }, [
  text("wc_logo", "Logo", "northwind", 64, 28, 140, 26, { size: 19, weight: 700, color: "#111827", letterSpacing: -0.4 }),
  text("wc_back", "Back", "← Product", 520, 34, 76, 20, { size: 13, weight: 500, color: "#4B5563", link: link(WP, WL, "dissolve") }),
  text("wc_nav_pricing", "Nav", "Pricing", 640, 34, 56, 20, { size: 13, weight: 600, color: "#111827" }),
  text("wc_nav_docs", "Nav", "Docs", 712, 34, 44, 20, { size: 13, weight: 500, color: "#4B5563" }),
  rect("wc_cta_nav", "Start free", 1252, 24, 124, 36, { radius: 10, fill: solid("#111827") }),
  text("wc_cta_nav_text", "Start free", "Start free", 1252, 24, 124, 36, { size: 12, weight: 600, color: "#FFFFFF", align: "center", valign: "middle" }),
  text("wc_h1", "Headline", "Simple pricing for every team.", 240, 130, 960, 70, { size: 48, weight: 700, color: "#0F1115", align: "center", letterSpacing: -1.6 }),
  text("wc_sub", "Subheadline", "Start free, upgrade when you grow. No seat minimums, no surprises.", 420, 212, 600, 24, { size: 14, color: "#6B7280", align: "center" }),
  ...Array.from({ length: 3 }).map((_, i) => {
    const names = ["Starter", "Team", "Enterprise"];
    const prices = ["$0", "$16", "Custom"];
    const descs = ["For solo makers exploring ideas.", "For product teams shipping together.", "For organizations at scale."];
    const primary = i === 1;
    return [
      rect(`wc_plan_${i}`, "Plan", 200 + i * 360, 290, 320, 470, { radius: 22, fill: solid(primary ? "#111827" : "#FFFFFF"), stroke: solid(primary ? "#111827" : "#E5E7EB"), shadow: primary ? shadow(0, 30, 70, -28, "rgba(17,24,39,.5)") : shadow(0, 10, 30, -20, "rgba(17,24,39,.16)") }),
      text(`wc_plan_name_${i}`, "Plan", names[i], 228 + i * 360, 322, 200, 24, { size: 15, weight: 600, color: primary ? "#FFFFFF" : "#111827" }),
      text(`wc_plan_desc_${i}`, "Plan", descs[i], 228 + i * 360, 352, 260, 20, { size: 11, color: primary ? "#9CA3AF" : "#6B7280" }),
      text(`wc_plan_price_${i}`, "Price", prices[i], 228 + i * 360, 390, 240, 54, { size: 44, weight: 700, color: primary ? "#FFFFFF" : "#111827", letterSpacing: -1.5 }),
      text(`wc_plan_period_${i}`, "Period", i === 2 ? "annual contract" : "per editor / month", 228 + i * 360, 446, 220, 18, { size: 10, color: primary ? "#9CA3AF" : "#9CA3AF" }),
      rect(`wc_plan_btn_${i}`, "Plan CTA", 228 + i * 360, 486, 264, 44, { radius: 11, fill: solid(primary ? "#FFFFFF" : "#F3F4F6"), link: i === 0 ? link(WP, WL, "dissolve") : undefined }),
      text(`wc_plan_btn_text_${i}`, "Plan CTA", i === 0 ? "Start free" : i === 1 ? "Start 14-day trial" : "Talk to sales", 228 + i * 360, 486, 264, 44, { size: 12, weight: 600, color: primary ? "#111827" : "#111827", align: "center", valign: "middle" }),
      ...[0, 1, 2, 3, 4].map((j) => [
        ellipse(`wc_check_${i}_${j}`, "Check", 228 + i * 360, 558 + j * 34, 16, 16, { fill: solid(primary ? "#7C5CFF" : "#EDE9FE") }),
        text(`wc_check_icon_${i}_${j}`, "Check", "✓", 228 + i * 360, 558 + j * 34, 16, 16, { size: 9, weight: 700, color: primary ? "#FFFFFF" : "#6D4AFF", align: "center", valign: "middle" }),
        text(`wc_feat_${i}_${j}`, "Feature", ["Unlimited personal files", "Real-time collaboration", "Commenting & review", "Version history", "Prototype links"][j], 252 + i * 360, 559 + j * 34, 220, 16, { size: 11, color: primary ? "#D1D5DB" : "#4B5563" }),
      ]).flat(),
    ];
  }).flat(),
  text("wc_note", "Note", "All plans include unlimited viewers. Prices in USD.", 520, 800, 400, 20, { size: 10, color: "#9CA3AF", align: "center" }),
]);

const websiteDoc = {
  pages: [page(WP, "Landing", [landing, landing2]), page(WPR, "Pricing", [pricing])],
  tombstones: {},
};

/* ------------------------------------------------------------------ */
/*  Analytics dashboard                                                */
/* ------------------------------------------------------------------ */

const DP = "dp_overview";
const DM = "dp_mobile";
const DO = "df_overview";
const DMOB = "df_mobile";

const navItems = ["Overview", "Reports", "Customers", "Products", "Settings"];
const navIcons = ["◫", "▤", "◉", "◇", "⚙"];

const overview = frame(DO, "Analytics · Desktop", 0, 0, 1280, 832, { fill: solid("#0E1117"), radius: 0 }, [
  rect("do_sidebar", "Sidebar", 0, 0, 232, 832, { fill: solid("#12161F"), radius: 0 }),
  rect("do_logo", "Logo", 24, 26, 30, 30, { radius: 8, fill: grad(135, ["#7C5CFF", 0], ["#4F46E5", 1]) }),
  text("do_logo_mark", "Logo", "Σ", 24, 26, 30, 30, { size: 15, weight: 700, color: "#FFFFFF", align: "center", valign: "middle" }),
  text("do_brand", "Brand", "Sigma Analytics", 64, 32, 140, 20, { size: 13, weight: 600, color: "#F9FAFB" }),
  text("do_workspace", "Workspace", "NORTHWIND / GROWTH", 24, 76, 180, 14, { size: 9, weight: 600, color: "#6B7280", letterSpacing: 1 }),
  ...navItems.map((label, i) => {
    const active = i === 0;
    return [
      rect(`do_nav_${i}`, "Nav item", 14, 108 + i * 42, 204, 36, { radius: 9, fill: solid(active ? "#7C5CFF" : "#FFFFFF", active ? 0.16 : 0.001) }),
      text(`do_nav_icon_${i}`, "Icon", navIcons[i], 26, 108 + i * 42, 20, 36, { size: 13, color: active ? "#A78BFA" : "#6B7280", align: "center", valign: "middle" }),
      text(`do_nav_label_${i}`, "Nav", label, 52, 108 + i * 42, 130, 36, { size: 12, weight: active ? 600 : 500, color: active ? "#F5F3FF" : "#9CA3AF", valign: "middle" }),
    ];
  }).flat(),
  rect("do_divider", "Divider", 24, 330, 184, 1, { fill: solid("#FFFFFF", 0.06), radius: 0 }),
  text("do_projects_label", "Label", "PROJECTS", 24, 350, 100, 14, { size: 9, weight: 600, color: "#6B7280", letterSpacing: 1 }),
  ...["Acquisition", "Activation", "Retention"].map((p, i) => [
    ellipse(`do_proj_dot_${i}`, "Dot", 26, 380 + i * 30, 7, 7, { fill: solid(["#7C5CFF", "#F472B6", "#22D3EE"][i]) }),
    text(`do_proj_${i}`, "Project", p, 44, 374 + i * 30, 150, 18, { size: 11, color: "#9CA3AF" }),
  ]).flat(),
  rect("do_user_card", "User", 14, 744, 204, 64, { radius: 12, fill: solid("#FFFFFF", 0.04), stroke: solid("#FFFFFF", 0.06) }),
  ellipse("do_user_avatar", "Avatar", 26, 758, 34, 34, { fill: grad(135, ["#FBCFE8", 0], ["#C4B5FD", 1]) }),
  text("do_user_name", "User", "Maya Chen", 70, 760, 120, 18, { size: 11, weight: 600, color: "#F3F4F6" }),
  text("do_user_role", "User", "Growth lead", 70, 778, 120, 16, { size: 9, color: "#6B7280" }),

  text("do_title", "Title", "Overview", 264, 30, 240, 30, { size: 22, weight: 600, color: "#F9FAFB", letterSpacing: -0.4 }),
  text("do_subtitle", "Subtitle", "Track how your product grows across channels and cohorts.", 264, 64, 500, 20, { size: 11, color: "#6B7280" }),
  rect("do_search", "Search", 784, 30, 220, 34, { radius: 9, fill: solid("#FFFFFF", 0.04), stroke: solid("#FFFFFF", 0.07) }),
  text("do_search_icon", "Search", "⌕", 794, 30, 18, 34, { size: 14, color: "#6B7280", valign: "middle" }),
  text("do_search_text", "Search", "Search reports…", 816, 30, 160, 34, { size: 10, color: "#6B7280", valign: "middle" }),
  ...["#C4B5FD", "#FBCFE8", "#BFDBFE"].map((color, i) => [
    ellipse(`do_avatar_${i}`, "Avatar", 1026 + i * 22, 33, 26, 26, { fill: solid(color), stroke: solid("#0E1117"), strokeWidth: 2 }),
    text(`do_avatar_text_${i}`, "Avatar", ["M", "J", "A"][i], 1026 + i * 22, 33, 26, 26, { size: 9, weight: 700, color: "#111827", align: "center", valign: "middle" }),
  ]).flat(),
  rect("do_mobile_btn", "Mobile view", 1114, 30, 66, 34, { radius: 8, fill: solid("#FFFFFF", 0.04), stroke: solid("#FFFFFF", 0.08), link: link(DM, DMOB, "slide-left") }),
  text("do_mobile_btn_text", "Mobile view", "Mobile", 1114, 30, 66, 34, { size: 10, weight: 500, color: "#D1D5DB", align: "center", valign: "middle" }),
  rect("do_export", "New report", 1190, 30, 66, 34, { radius: 8, fill: solid("#7C5CFF") }),
  text("do_export_text", "New report", "Export", 1190, 30, 66, 34, { size: 10, weight: 600, color: "#FFFFFF", align: "center", valign: "middle" }),

  ...Array.from({ length: 4 }).map((_, i) => {
    const labels = ["Total revenue", "Active users", "Conversion", "Churn rate"];
    const values = ["$128,430", "24,892", "6.42%", "1.8%"];
    const deltas = ["+12.4%", "+8.1%", "+2.3%", "-0.4%"];
    const colors = ["#A78BFA", "#F472B6", "#34D399", "#FBBF24"];
    return [
      rect(`do_kpi_${i}`, "KPI card", 264 + i * 248, 108, 228, 116, { radius: 14, fill: solid("#141924"), stroke: solid("#FFFFFF", 0.06), shadow: shadow(0, 10, 30, -20, "rgba(0,0,0,.5)") }),
      text(`do_kpi_label_${i}`, "Label", labels[i], 282 + i * 248, 126, 160, 16, { size: 10, color: "#6B7280" }),
      text(`do_kpi_value_${i}`, "Value", values[i], 282 + i * 248, 148, 180, 34, { size: 24, weight: 600, color: "#F9FAFB", letterSpacing: -0.8 }),
      text(`do_kpi_delta_${i}`, "Delta", deltas[i], 282 + i * 248, 190, 80, 16, { size: 9, weight: 600, color: colors[i] }),
      text(`do_kpi_meta_${i}`, "Meta", "vs last month", 350 + i * 248, 190, 110, 16, { size: 9, color: "#4B5563" }),
      ...Array.from({ length: 8 }).map((__, j) =>
        rect(`do_spark_${i}_${j}`, "Spark", 282 + i * 248 + j * 20, 206 - [8, 18, 12, 24, 20, 30, 26, 34][j], 12, [8, 18, 12, 24, 20, 30, 26, 34][j], { radius: 2, fill: solid(colors[i], 0.35 + j * 0.05) }),
      ),
    ];
  }).flat(),

  rect("do_chart", "Revenue chart", 264, 248, 700, 300, { radius: 14, fill: solid("#141924"), stroke: solid("#FFFFFF", 0.06) }),
  text("do_chart_title", "Chart title", "Revenue overview", 284, 268, 240, 20, { size: 13, weight: 600, color: "#F3F4F6" }),
  text("do_chart_sub", "Chart subtitle", "Monthly recurring revenue · last 12 months", 284, 290, 340, 16, { size: 9, color: "#6B7280" }),
  rect("do_chart_pill", "Chart filter", 860, 266, 84, 26, { radius: 7, fill: solid("#FFFFFF", 0.05) }),
  text("do_chart_pill_text", "Filter", "This year ▾", 860, 266, 84, 26, { size: 9, color: "#9CA3AF", align: "center", valign: "middle" }),
  ...Array.from({ length: 5 }).map((_, i) => [
    text(`do_grid_label_${i}`, "Axis", `$${[120, 90, 60, 30, 0][i]}k`, 782, 326 + i * 40, 46, 14, { size: 8, color: "#4B5563", align: "right" }),
    rect(`do_grid_line_${i}`, "Grid", 284, 334 + i * 40, 564, 1, { fill: solid("#FFFFFF", 0.045), radius: 0 }),
  ]).flat(),
  ...Array.from({ length: 12 }).map((_, i) => {
    const h = [64, 88, 58, 104, 82, 126, 96, 144, 112, 132, 158, 142][i];
    return rect(`do_bar_${i}`, "Bar", 304 + i * 44, 494 - h, 26, h, { radius: 4, fill: grad(180, ["#8B5CF6", 0], ["#4C1D95", 1]), opacity: i === 11 ? 1 : 0.75 });
  }),
  ...Array.from({ length: 12 }).map((_, i) =>
    text(`do_month_${i}`, "Month", ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"][i], 304 + i * 44, 502, 26, 14, { size: 8, color: "#4B5563", align: "center" }),
  ),

  rect("do_channels", "Channels", 984, 248, 272, 300, { radius: 14, fill: solid("#141924"), stroke: solid("#FFFFFF", 0.06) }),
  text("do_channels_title", "Title", "Top channels", 1002, 268, 200, 20, { size: 13, weight: 600, color: "#F3F4F6" }),
  ...["Organic search", "Direct", "Referral", "Social", "Email"].map((label, i) => {
    const values = [42, 28, 16, 9, 5];
    const colors = ["#7C5CFF", "#F472B6", "#34D399", "#FBBF24", "#60A5FA"];
    return [
      text(`do_ch_label_${i}`, "Channel", label, 1002, 304 + i * 46, 140, 16, { size: 10, color: "#D1D5DB" }),
      text(`do_ch_value_${i}`, "Value", `${values[i]}%`, 1188, 304 + i * 46, 50, 16, { size: 10, weight: 600, color: "#F3F4F6", align: "right" }),
      rect(`do_ch_track_${i}`, "Track", 1002, 324 + i * 46, 236, 5, { radius: 3, fill: solid("#FFFFFF", 0.06) }),
      rect(`do_ch_bar_${i}`, "Bar", 1002, 324 + i * 46, 236 * (values[i] / 45), 5, { radius: 3, fill: solid(colors[i]) }),
    ];
  }).flat(),

  rect("do_table", "Table", 264, 572, 700, 232, { radius: 14, fill: solid("#141924"), stroke: solid("#FFFFFF", 0.06) }),
  text("do_table_title", "Title", "Recent conversions", 284, 590, 220, 20, { size: 13, weight: 600, color: "#F3F4F6" }),
  text("do_table_view", "Link", "View all →", 886, 592, 60, 16, { size: 9, color: "#A78BFA", align: "right" }),
  ...["Customer", "Plan", "Amount", "Status", "Date"].map((h, i) => text(`do_th_${i}`, "Header", h, 284 + [0, 240, 360, 470, 580][i], 626, 100, 16, { size: 8, weight: 600, color: "#4B5563", letterSpacing: 0.4 })),
  ...[0, 1, 2, 3].map((i) => {
    const names = ["Acme Inc.", "Linear Labs", "Vercel", "Raycast"];
    const plans = ["Enterprise", "Team", "Team", "Pro"];
    const amounts = ["$2,400", "$960", "$1,920", "$320"];
    const dates = ["Today", "Yesterday", "2d ago", "3d ago"];
    const colors = ["#C4B5FD", "#FBCFE8", "#BFDBFE", "#BBF7D0"];
    return [
      rect(`do_row_sep_${i}`, "Separator", 284, 650 + i * 36, 660, 1, { fill: solid("#FFFFFF", 0.04), radius: 0 }),
      ellipse(`do_row_avatar_${i}`, "Avatar", 284, 660 + i * 36, 20, 20, { fill: solid(colors[i]) }),
      text(`do_row_name_${i}`, "Customer", names[i], 314, 660 + i * 36, 160, 20, { size: 10, weight: 500, color: "#E5E7EB", valign: "middle" }),
      text(`do_row_plan_${i}`, "Plan", plans[i], 524, 660 + i * 36, 90, 20, { size: 9, color: "#9CA3AF", valign: "middle" }),
      text(`do_row_amount_${i}`, "Amount", amounts[i], 644, 660 + i * 36, 80, 20, { size: 9, weight: 600, color: "#E5E7EB", valign: "middle" }),
      rect(`do_row_badge_${i}`, "Badge", 754, 666 + i * 36, 58, 18, { radius: 9, fill: solid(i === 3 ? "#FBBF24" : "#34D399", 0.14) }),
      text(`do_row_status_${i}`, "Status", i === 3 ? "Pending" : "Paid", 754, 666 + i * 36, 58, 18, { size: 8, weight: 600, color: i === 3 ? "#FBBF24" : "#34D399", align: "center", valign: "middle" }),
      text(`do_row_date_${i}`, "Date", dates[i], 864, 660 + i * 36, 80, 20, { size: 9, color: "#6B7280", align: "right", valign: "middle" }),
    ];
  }).flat(),

  rect("do_goal", "Goal card", 984, 572, 272, 232, { radius: 14, fill: grad(135, ["#4C1D95", 0], ["#1E1B4B", 1]), stroke: solid("#FFFFFF", 0.08) }),
  text("do_goal_label", "Label", "QUARTERLY GOAL", 1002, 590, 180, 16, { size: 8, weight: 600, color: "#C4B5FD", letterSpacing: 1 }),
  text("do_goal_value", "Value", "$412k", 1002, 618, 200, 44, { size: 28, weight: 700, color: "#FFFFFF", letterSpacing: -1 }),
  text("do_goal_meta", "Meta", "of $500k target", 1002, 662, 160, 16, { size: 9, color: "#A5B4FC" }),
  rect("do_goal_track", "Track", 1002, 692, 236, 8, { radius: 4, fill: solid("#FFFFFF", 0.12) }),
  rect("do_goal_bar", "Progress", 1002, 692, 195, 8, { radius: 4, fill: solid("#A78BFA") }),
  text("do_goal_pct", "Percent", "82%", 1188, 710, 50, 16, { size: 10, weight: 600, color: "#DDD6FE", align: "right" }),
  text("do_goal_hint", "Hint", "You’re 12 days ahead of pace.", 1002, 744, 220, 16, { size: 9, color: "#C4B5FD" }),
  text("do_goal_hint2", "Hint", "Keep the momentum going.", 1002, 760, 220, 16, { size: 9, color: "#8B85A0" }),
]);

const mobileDashboard = frame(DMOB, "Analytics · Mobile", 1360, 0, 390, 844, { fill: solid("#0E1117"), radius: 0 }, [
  ...statusBar("dm", true),
  text("dm_title", "Title", "Overview", 24, 64, 200, 30, { size: 24, weight: 600, color: "#F9FAFB", letterSpacing: -0.6 }),
  text("dm_sub", "Subtitle", "Last 30 days · all channels", 24, 98, 260, 18, { size: 10, color: "#6B7280" }),
  ellipse("dm_avatar", "Avatar", 326, 66, 36, 36, { fill: grad(135, ["#FBCFE8", 0], ["#C4B5FD", 1]) }),
  rect("dm_card", "Revenue card", 24, 136, 342, 154, { radius: 18, fill: grad(135, ["#4C1D95", 0], ["#1E1B4B", 1]), stroke: solid("#FFFFFF", 0.08) }),
  text("dm_card_label", "Label", "Total revenue", 44, 154, 160, 16, { size: 9, color: "#C4B5FD" }),
  text("dm_card_value", "Value", "$128,430", 44, 176, 220, 38, { size: 28, weight: 700, color: "#FFFFFF", letterSpacing: -1 }),
  text("dm_card_delta", "Delta", "↑ 12.4% vs last month", 44, 220, 220, 16, { size: 9, weight: 500, color: "#A7F3D0" }),
  ...Array.from({ length: 10 }).map((_, i) => rect(`dm_spark_${i}`, "Spark", 44 + i * 26, 254 - [10, 18, 14, 26, 20, 30, 24, 34, 28, 38][i], 16, [10, 18, 14, 26, 20, 30, 24, 34, 28, 38][i], { radius: 2, fill: solid("#A78BFA", 0.4 + i * 0.06) })),
  ...Array.from({ length: 3 }).map((_, i) => [
    rect(`dm_kpi_${i}`, "KPI", 24 + i * 118, 310, 106, 88, { radius: 14, fill: solid("#141924"), stroke: solid("#FFFFFF", 0.06) }),
    text(`dm_kpi_label_${i}`, "Label", ["Active users", "Conversion", "Churn"][i], 38 + i * 118, 326, 90, 14, { size: 8, color: "#6B7280" }),
    text(`dm_kpi_value_${i}`, "Value", ["24.8k", "6.4%", "1.8%"][i], 38 + i * 118, 346, 90, 26, { size: 18, weight: 600, color: "#F9FAFB" }),
    text(`dm_kpi_delta_${i}`, "Delta", ["+8.1%", "+2.3%", "-0.4%"][i], 38 + i * 118, 378, 60, 14, { size: 8, weight: 600, color: ["#34D399", "#34D399", "#FBBF24"][i] }),
  ]).flat(),
  rect("dm_chart", "Chart card", 24, 418, 342, 232, { radius: 16, fill: solid("#141924"), stroke: solid("#FFFFFF", 0.06) }),
  text("dm_chart_title", "Title", "Revenue", 42, 436, 200, 18, { size: 12, weight: 600, color: "#F3F4F6" }),
  text("dm_chart_sub", "Subtitle", "Last 12 months", 42, 456, 200, 14, { size: 8, color: "#6B7280" }),
  ...Array.from({ length: 12 }).map((_, i) => {
    const h = [42, 58, 38, 70, 54, 84, 64, 96, 74, 88, 106, 94][i];
    return rect(`dm_bar_${i}`, "Bar", 44 + i * 26, 570 - h, 14, h, { radius: 3, fill: grad(180, ["#8B5CF6", 0], ["#4C1D95", 1]) });
  }),
  ...Array.from({ length: 6 }).map((_, i) => text(`dm_month_${i}`, "Month", ["J", "M", "M", "J", "S", "N"][i], 44 + i * 52, 578, 14, 12, { size: 7, color: "#4B5563", align: "center" })),
  rect("dm_channels", "Channels", 24, 668, 342, 120, { radius: 16, fill: solid("#141924"), stroke: solid("#FFFFFF", 0.06) }),
  text("dm_channels_title", "Title", "Top channels", 42, 684, 200, 18, { size: 11, weight: 600, color: "#F3F4F6" }),
  ...["Organic", "Direct", "Referral"].map((label, i) => [
    text(`dm_ch_label_${i}`, "Channel", label, 42, 710 + i * 22, 120, 14, { size: 8, color: "#D1D5DB" }),
    rect(`dm_ch_track_${i}`, "Track", 140, 716 + i * 22, 160, 4, { radius: 2, fill: solid("#FFFFFF", 0.06) }),
    rect(`dm_ch_bar_${i}`, "Bar", 140, 716 + i * 22, [120, 86, 48][i], 4, { radius: 2, fill: solid(["#7C5CFF", "#F472B6", "#34D399"][i]) }),
    text(`dm_ch_val_${i}`, "Value", ["42%", "28%", "16%"][i], 312, 710 + i * 22, 40, 14, { size: 8, weight: 600, color: "#9CA3AF", align: "right" }),
  ]).flat(),
  rect("dm_back", "Back to desktop", 24, 800, 342, 30, { radius: 8, fill: solid("#FFFFFF", 0.04), stroke: solid("#FFFFFF", 0.06), link: { action: "back", transition: "slide-left" } }),
  text("dm_back_text", "Back", "← Back to desktop", 24, 800, 342, 30, { size: 9, weight: 500, color: "#9CA3AF", align: "center", valign: "middle" }),
]);

const dashboardDoc = {
  pages: [page(DP, "Overview", [overview]), page(DM, "Mobile", [mobileDashboard])],
  tombstones: {},
};

/* ------------------------------------------------------------------ */

const outDir = path.resolve(process.cwd(), "../backend/internal/templates");
fs.mkdirSync(outDir, { recursive: true });

const templates = [
  {
    meta: {
      id: "mobile",
      name: "Mobile app",
      description: "A 3-step onboarding flow with prototype links and a design system page.",
      accent: "#7C5CFF",
      icon: "smartphone",
    },
    doc: mobileDoc,
  },
  {
    meta: {
      id: "website",
      name: "Landing page",
      description: "A polished SaaS marketing site with features and a linked pricing page.",
      accent: "#F472B6",
      icon: "globe",
    },
    doc: websiteDoc,
  },
  {
    meta: {
      id: "dashboard",
      name: "Analytics dashboard",
      description: "A data-rich desktop dashboard with KPIs, charts and a mobile companion.",
      accent: "#34D399",
      icon: "layout-dashboard",
    },
    doc: dashboardDoc,
  },
];

for (const t of templates) {
  fs.writeFileSync(path.join(outDir, `${t.meta.id}.json`), JSON.stringify(t, null, 2));
  const nodes = t.doc.pages.reduce((n, p) => n + Object.keys(p.nodes).length, 0);
  console.log(`wrote ${t.meta.id}.json (${t.doc.pages.length} pages, ${nodes} layers)`);
}
