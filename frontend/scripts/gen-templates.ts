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
    fontFamily: props.fontFamily ?? "Inter Variable",
    fontWeight: props.fontWeight ?? 400,
    lineHeight: props.lineHeight ?? 1.4,
    letterSpacing: props.letterSpacing ?? 0,
    textAlign: props.textAlign ?? "left",
    verticalAlign: props.verticalAlign ?? "top",
    src: props.src ?? "",
    objectFit: "cover",
    link: props.link ?? null,
    points: [],
    closed: false,
    component: props.component ?? false,
    componentId: props.componentId ?? null,
    ts: ++tick,
  };
  n.children = children.map((c) => c.id);
  for (const c of children) c.parentId = n.id;
  registry.set(n.id, n);
  return n;
}

const text = (id, name, content, x, y, width, height, opts = {}) =>
  node("text", { id, name, text: content, x, y, width, height, fill: solid(opts.color ?? "#111827"), fontSize: opts.size ?? 16, fontWeight: opts.weight ?? 400, lineHeight: opts.lineHeight ?? 1.4, letterSpacing: opts.letterSpacing ?? 0, textAlign: opts.align ?? "left", verticalAlign: opts.valign ?? "top", opacity: opts.opacity ?? 1, link: opts.link, fontFamily: opts.family });

const rect = (id, name, x, y, width, height, opts = {}) =>
  node("rect", { id, name, x, y, width, height, fill: opts.fill ?? solid("#ffffff"), stroke: opts.stroke, strokeWidth: opts.strokeWidth ?? 1, radius: opts.radius ?? 0, shadow: opts.shadow, opacity: opts.opacity ?? 1, blur: opts.blur ?? 0, link: opts.link });

const ellipse = (id, name, x, y, width, height, opts = {}) =>
  node("ellipse", { id, name, x, y, width, height, fill: opts.fill ?? solid("#ffffff"), stroke: opts.stroke, strokeWidth: opts.strokeWidth ?? 1, opacity: opts.opacity ?? 1, blur: opts.blur ?? 0, shadow: opts.shadow });

const frame = (id, name, x, y, width, height, opts = {}, children = []) =>
  node("frame", { id, name, x, y, width, height, fill: opts.fill ?? solid("#ffffff"), radius: opts.radius ?? 0, clip: opts.clip ?? true, shadow: opts.shadow, opacity: opts.opacity ?? 1, component: opts.component ?? false }, children);

const image = (id, name, src, x, y, width, height, opts = {}) =>
  node("image", { id, name, src, x, y, width, height, radius: opts.radius ?? 0, fill: opts.fill ?? null, opacity: opts.opacity ?? 1 });

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
/*  Common design-system foundations board                            */
/* ------------------------------------------------------------------ */

function foundations(prefix, title, subtitle, colors, opts) {
  const swatches = colors.map(([name, color], i) => [
    rect(`${prefix}_sw_${i}`, name, 48 + i * 136, 180, 120, 78, { radius: 14, fill: solid(color), stroke: solid("#000000", 0.06) }),
    text(`${prefix}_sw_l_${i}`, name, name, 48 + i * 136, 266, 120, 16, { size: 9, weight: 500, color: opts.muted }),
  ]).flat();
  return frame(`${prefix}_found`, `${title} foundations`, 0, 0, 900, 640, { fill: solid(opts.bg), radius: 0 }, [
    text(`${prefix}_fd_title`, "Title", `${title} foundations`, 48, 44, 600, 38, { size: 30, weight: 700, color: opts.text, family: opts.family, letterSpacing: -0.6 }),
    text(`${prefix}_fd_sub`, "Subtitle", subtitle, 48, 88, 700, 22, { size: 13, color: opts.muted, family: opts.family }),
    text(`${prefix}_fd_color`, "Colors", "Color tokens", 48, 142, 220, 20, { size: 10, weight: 700, color: opts.muted, letterSpacing: 0.8, family: opts.family }),
    ...swatches,
    text(`${prefix}_fd_type`, "Type", "Type scale", 48, 316, 220, 20, { size: 10, weight: 700, color: opts.muted, letterSpacing: 0.8, family: opts.family }),
    text(`${prefix}_fd_display`, "Display", "Design with confidence", 48, 344, 560, 54, { size: 34, weight: 700, color: opts.text, lineHeight: 1.1, letterSpacing: -0.8, family: opts.family }),
    text(`${prefix}_fd_body`, "Body", "A shared language keeps teams fast, consistent and accessible across every surface.", 48, 410, 600, 44, { size: 13, color: opts.muted, lineHeight: 1.6, family: opts.family }),
    text(`${prefix}_fd_comp`, "Components", "Components", 48, 486, 220, 20, { size: 10, weight: 700, color: opts.muted, letterSpacing: 0.8, family: opts.family }),
    rect(`${prefix}_fd_btn1`, "Primary button", 48, 516, 168, 46, { radius: opts.radius, fill: solid(opts.primary) }),
    text(`${prefix}_fd_btn1_t`, "Label", "Primary", 48, 516, 168, 46, { size: 12, weight: 600, color: opts.onPrimary, align: "center", valign: "middle", family: opts.family }),
    rect(`${prefix}_fd_btn2`, "Secondary button", 232, 516, 168, 46, { radius: opts.radius, fill: solid(opts.surface), stroke: solid(opts.border), strokeWidth: 1 }),
    text(`${prefix}_fd_btn2_t`, "Label", "Secondary", 232, 516, 168, 46, { size: 12, weight: 600, color: opts.text, align: "center", valign: "middle", family: opts.family }),
    rect(`${prefix}_fd_chip`, "Chip", 48, 582, 96, 30, { radius: 999, fill: solid(opts.chip) }),
    text(`${prefix}_fd_chip_t`, "Chip", "Filter chip", 48, 582, 96, 30, { size: 10, weight: 600, color: opts.primary, align: "center", valign: "middle", family: opts.family }),
    rect(`${prefix}_fd_card`, "Card", 676, 316, 176, 296, { radius: opts.radius, fill: solid(opts.surface), stroke: solid(opts.border), strokeWidth: 1, shadow: shadow(0, 12, 30, -18, "rgba(0,0,0,.22)") }),
    rect(`${prefix}_fd_card_media`, "Card media", 692, 332, 144, 132, { radius: Math.max(8, opts.radius - 4), fill: solid(opts.primary, 0.9) }),
    text(`${prefix}_fd_card_title`, "Card title", "Reusable card", 692, 482, 144, 18, { size: 12, weight: 600, color: opts.text, family: opts.family }),
    text(`${prefix}_fd_card_body`, "Card body", "Tokens and components stay in sync.", 692, 504, 144, 34, { size: 9, color: opts.muted, lineHeight: 1.5, family: opts.family }),
    rect(`${prefix}_fd_card_btn`, "Card action", 692, 556, 144, 30, { radius: Math.max(6, opts.radius - 4), fill: solid(opts.primary, 0.12) }),
    text(`${prefix}_fd_card_btn_t`, "Action", "View details", 692, 556, 144, 30, { size: 9, weight: 600, color: opts.primary, align: "center", valign: "middle", family: opts.family }),
  ]);
}


/* ------------------------------------------------------------------ */
/*  Shared component library board                                    */
/* ------------------------------------------------------------------ */

function componentBoard(prefix, title, opts) {
  const component = (id, name, x, y, w, h, fill, radius, children) =>
    frame(`${prefix}_${id}`, name, x, y, w, h, {
      fill: typeof fill === "string" ? solid(fill) : fill ?? solid(opts.surface),
      radius: radius ?? opts.radius,
      component: true,
    }, children);
  return frame(`${prefix}_components`, `${title} components`, 0, 0, 1200, 900, { fill: solid(opts.bg), radius: 0 }, [
    text(`${prefix}_c_title`, "Title", "Components", 48, 40, 420, 42, { size: 30, weight: 700, color: opts.text, family: opts.family }),
    text(`${prefix}_c_sub`, "Subtitle", "Reusable controls from the " + title + " language. Every framed control is a main component.", 48, 86, 820, 22, { size: 13, color: opts.muted, family: opts.family }),
    text(`${prefix}_c_actions`, "Section", "Actions", 48, 132, 200, 20, { size: 10, weight: 700, color: opts.muted, letterSpacing: 0.8, family: opts.family }),

    component("btn_primary", "Button / Primary", 48, 160, 156, 44, solid(opts.primary), opts.radius, [
      text(`${prefix}_bp_t`, "Label", "Primary", 0, 0, 156, 44, { size: 12, weight: 600, color: opts.onPrimary, align: "center", valign: "middle", family: opts.family }),
    ]),
    component("btn_secondary", "Button / Secondary", 220, 160, 156, 44, solid(opts.surface), opts.radius, [
      rect(`${prefix}_bs_border`, "Border", 0, 0, 156, 44, { fill: solid(opts.surface), stroke: solid(opts.border), radius: opts.radius }),
      text(`${prefix}_bs_t`, "Label", "Secondary", 0, 0, 156, 44, { size: 12, weight: 600, color: opts.text, align: "center", valign: "middle", family: opts.family }),
    ]),
    component("btn_ghost", "Button / Ghost", 392, 160, 140, 44, solid(opts.surface), opts.radius, [
      text(`${prefix}_bg_t`, "Label", "Ghost", 0, 0, 140, 44, { size: 12, weight: 600, color: opts.primary, align: "center", valign: "middle", family: opts.family }),
    ]),
    component("btn_danger", "Button / Danger", 548, 160, 140, 44, solid(opts.danger), opts.radius, [
      text(`${prefix}_bd_t`, "Label", "Delete", 0, 0, 140, 44, { size: 12, weight: 600, color: "#FFFFFF", align: "center", valign: "middle", family: opts.family }),
    ]),

    text(`${prefix}_c_inputs`, "Section", "Inputs", 48, 234, 200, 20, { size: 10, weight: 700, color: opts.muted, letterSpacing: 0.8, family: opts.family }),
    component("input", "Input / Text", 48, 262, 300, 78, undefined, opts.radius, [
      text(`${prefix}_in_l`, "Label", "Email address", 0, 0, 300, 18, { size: 11, weight: 600, color: opts.text, family: opts.family }),
      rect(`${prefix}_in_f`, "Field", 0, 26, 300, 42, { fill: solid(opts.surface), stroke: solid(opts.border), radius: opts.radius }),
      text(`${prefix}_in_p`, "Placeholder", "you@company.com", 14, 26, 270, 42, { size: 12, color: opts.muted, valign: "middle", family: opts.family }),
    ]),
    component("select", "Input / Select", 376, 262, 240, 78, undefined, opts.radius, [
      text(`${prefix}_sel_l`, "Label", "Role", 0, 0, 240, 18, { size: 11, weight: 600, color: opts.text, family: opts.family }),
      rect(`${prefix}_sel_f`, "Field", 0, 26, 240, 42, { fill: solid(opts.surface), stroke: solid(opts.border), radius: opts.radius }),
      text(`${prefix}_sel_v`, "Value", "Designer", 14, 26, 190, 42, { size: 12, color: opts.text, valign: "middle", family: opts.family }),
      text(`${prefix}_sel_c`, "Chevron", "⌄", 208, 26, 20, 42, { size: 14, color: opts.muted, valign: "middle", family: opts.family }),
    ]),
    component("search", "Input / Search", 644, 262, 300, 44, solid(opts.surface), opts.radius, [
      text(`${prefix}_se_i`, "Icon", "⌕", 14, 0, 24, 44, { size: 16, color: opts.muted, valign: "middle", family: opts.family }),
      text(`${prefix}_se_p`, "Placeholder", "Search components", 44, 0, 240, 44, { size: 12, color: opts.muted, valign: "middle", family: opts.family }),
    ]),

    text(`${prefix}_c_controls`, "Section", "Selection & controls", 48, 378, 260, 20, { size: 10, weight: 700, color: opts.muted, letterSpacing: 0.8, family: opts.family }),
    component("checkbox", "Control / Checkbox", 48, 406, 160, 28, undefined, 0, [
      rect(`${prefix}_cb_b`, "Box", 0, 4, 20, 20, { radius: 4, fill: solid(opts.primary) }),
      text(`${prefix}_cb_c`, "Check", "✓", 0, 4, 20, 20, { size: 11, weight: 700, color: "#FFFFFF", align: "center", valign: "middle", family: opts.family }),
      text(`${prefix}_cb_t`, "Label", "Remember me", 30, 4, 130, 20, { size: 12, color: opts.text, valign: "middle", family: opts.family }),
    ]),
    component("radio", "Control / Radio", 236, 406, 160, 28, undefined, 0, [
      ellipse(`${prefix}_rd_o`, "Outer", 0, 4, 20, 20, { fill: solid(opts.surface), stroke: solid(opts.primary), strokeWidth: 2 }),
      ellipse(`${prefix}_rd_i`, "Inner", 5, 9, 10, 10, { fill: solid(opts.primary) }),
      text(`${prefix}_rd_t`, "Label", "Team plan", 30, 4, 120, 20, { size: 12, color: opts.text, valign: "middle", family: opts.family }),
    ]),
    component("switch", "Control / Switch", 424, 406, 150, 28, undefined, 0, [
      text(`${prefix}_sw_t`, "Label", "Notifications", 0, 4, 90, 20, { size: 12, color: opts.text, valign: "middle", family: opts.family }),
      rect(`${prefix}_sw_tr`, "Track", 100, 4, 44, 22, { radius: 11, fill: solid(opts.primary) }),
      ellipse(`${prefix}_sw_k`, "Knob", 120, 6, 18, 18, { fill: solid("#FFFFFF") }),
    ]),
    component("slider", "Control / Slider", 604, 406, 250, 28, undefined, 0, [
      text(`${prefix}_sl_t`, "Label", "Volume", 0, 4, 60, 20, { size: 12, color: opts.text, valign: "middle", family: opts.family }),
      rect(`${prefix}_sl_tr`, "Track", 68, 15, 180, 4, { radius: 2, fill: solid(opts.border) }),
      rect(`${prefix}_sl_fill`, "Fill", 68, 15, 108, 4, { radius: 2, fill: solid(opts.primary) }),
      ellipse(`${prefix}_sl_k`, "Knob", 168, 9, 16, 16, { fill: solid("#FFFFFF"), stroke: solid(opts.primary), strokeWidth: 2 }),
    ]),

    text(`${prefix}_c_display`, "Section", "Data display", 48, 466, 260, 20, { size: 10, weight: 700, color: opts.muted, letterSpacing: 0.8, family: opts.family }),
    component("tags", "Tag / Status", 48, 494, 250, 30, undefined, 0, [
      rect(`${prefix}_tag1`, "Tag", 0, 0, 72, 26, { radius: 999, fill: solid(opts.chip) }),
      text(`${prefix}_tag1_t`, "Tag", "Active", 0, 0, 72, 26, { size: 10, weight: 600, color: opts.primary, align: "center", valign: "middle", family: opts.family }),
      rect(`${prefix}_tag2`, "Tag", 84, 0, 74, 26, { radius: 999, fill: solid(opts.chip) }),
      text(`${prefix}_tag2_t`, "Tag", "Review", 84, 0, 74, 26, { size: 10, weight: 600, color: opts.primary, align: "center", valign: "middle", family: opts.family }),
      rect(`${prefix}_tag3`, "Tag", 170, 0, 70, 26, { radius: 999, fill: solid(opts.danger, 0.12) }),
      text(`${prefix}_tag3_t`, "Tag", "Alert", 170, 0, 70, 26, { size: 10, weight: 600, color: opts.danger, align: "center", valign: "middle", family: opts.family }),
    ]),
    component("avatar", "Avatar / User", 334, 494, 240, 56, undefined, 0, [
      ellipse(`${prefix}_av_bg`, "Avatar", 0, 0, 44, 44, { fill: solid(opts.chip) }),
      text(`${prefix}_av_t`, "Initials", "MC", 0, 0, 44, 44, { size: 13, weight: 700, color: opts.primary, align: "center", valign: "middle", family: opts.family }),
      text(`${prefix}_av_n`, "Name", "Maya Chen", 58, 4, 170, 18, { size: 12, weight: 600, color: opts.text, family: opts.family }),
      text(`${prefix}_av_e`, "Email", "maya@company.com", 58, 24, 180, 16, { size: 10, color: opts.muted, family: opts.family }),
    ]),
    component("card", "Card / Basic", 48, 566, 330, 222, solid(opts.surface), opts.radius, [
      rect(`${prefix}_cd_media`, "Media", 0, 0, 330, 108, { fill: solid(opts.primary), radius: opts.radius }),
      text(`${prefix}_cd_t`, "Title", "Project card", 18, 126, 290, 22, { size: 14, weight: 600, color: opts.text, family: opts.family }),
      text(`${prefix}_cd_b`, "Body", "A reusable container with consistent spacing, radius and surface treatment.", 18, 154, 290, 40, { size: 11, color: opts.muted, lineHeight: 1.5, family: opts.family }),
      rect(`${prefix}_cd_btn`, "Action", 18, 202, 100, 24, { radius: Math.max(2, opts.radius - 2), fill: solid(opts.chip) }),
      text(`${prefix}_cd_btn_t`, "Action", "Open →", 18, 202, 100, 24, { size: 10, weight: 600, color: opts.primary, align: "center", valign: "middle", family: opts.family }),
    ]),
    component("modal", "Dialog / Confirmation", 400, 566, 360, 232, solid(opts.surface), opts.radius, [
      text(`${prefix}_md_t`, "Title", "Delete project?", 20, 18, 300, 24, { size: 15, weight: 600, color: opts.text, family: opts.family }),
      text(`${prefix}_md_b`, "Body", "This action cannot be undone. All project data will be permanently removed.", 20, 50, 320, 44, { size: 11, color: opts.muted, lineHeight: 1.5, family: opts.family }),
      rect(`${prefix}_md_cancel`, "Secondary", 188, 184, 72, 30, { radius: Math.max(2, opts.radius - 2), fill: solid(opts.surface), stroke: solid(opts.border) }),
      text(`${prefix}_md_cancel_t`, "Label", "Cancel", 188, 184, 72, 30, { size: 10, weight: 600, color: opts.text, align: "center", valign: "middle", family: opts.family }),
      rect(`${prefix}_md_delete`, "Danger", 270, 184, 70, 30, { radius: Math.max(2, opts.radius - 2), fill: solid(opts.danger) }),
      text(`${prefix}_md_delete_t`, "Label", "Delete", 270, 184, 70, 30, { size: 10, weight: 600, color: "#FFFFFF", align: "center", valign: "middle", family: opts.family }),
    ]),
    component("table", "Table / Compact", 782, 566, 370, 270, solid(opts.surface), opts.radius, [
      text(`${prefix}_tb_t`, "Title", "Team members", 16, 14, 240, 20, { size: 12, weight: 600, color: opts.text, family: opts.family }),
      text(`${prefix}_tb_a`, "Action", "View all", 300, 14, 54, 18, { size: 9, color: opts.primary, align: "right", family: opts.family }),
      rect(`${prefix}_tb_head`, "Header", 0, 44, 370, 28, { fill: solid(opts.bg) }),
      ...["Name", "Role", "Status"].map((h, i) => text(`${prefix}_tb_h_${i}`, "Header", h, 16 + [0, 148, 266][i], 50, 90, 16, { size: 8, weight: 600, color: opts.muted, family: opts.family })),
      ...[["Maya Chen", "Designer", "Active"], ["Noah Patel", "Engineer", "Active"], ["Lena Park", "PM", "Away"], ["Owen Diaz", "Research", "Active"]].map(([name, role, status], i) => [
        ...(i > 0 ? [rect(`${prefix}_tb_sep_${i}`, "Separator", 16, 76 + i * 42, 338, 1, { fill: solid(opts.border) })] : []),
        ellipse(`${prefix}_tb_av_${i}`, "Avatar", 16, 88 + i * 42, 22, 22, { fill: solid(opts.chip) }),
        text(`${prefix}_tb_name_${i}`, "Name", name, 46, 88 + i * 42, 100, 22, { size: 9, weight: 500, color: opts.text, valign: "middle", family: opts.family }),
        text(`${prefix}_tb_role_${i}`, "Role", role, 164, 88 + i * 42, 90, 22, { size: 9, color: opts.muted, valign: "middle", family: opts.family }),
        ellipse(`${prefix}_tb_dot_${i}`, "Status dot", 282, 96 + i * 42, 6, 6, { fill: solid(status === "Away" ? opts.danger : opts.primary) }),
        text(`${prefix}_tb_status_${i}`, "Status", status, 294, 88 + i * 42, 60, 22, { size: 8, color: opts.muted, valign: "middle", family: opts.family }),
      ]).flat(),
    ]),

    text(`${prefix}_c_nav`, "Section", "Navigation", 48, 806, 260, 20, { size: 10, weight: 700, color: opts.muted, letterSpacing: 0.8, family: opts.family }),
    component("tabs", "Tabs / Underline", 48, 834, 320, 36, undefined, 0, [
      text(`${prefix}_tab1`, "Tab", "Overview", 0, 0, 88, 34, { size: 12, weight: 600, color: opts.primary, valign: "middle", family: opts.family }),
      rect(`${prefix}_tab_ind`, "Indicator", 0, 32, 88, 2, { fill: solid(opts.primary) }),
      text(`${prefix}_tab2`, "Tab", "Activity", 100, 0, 80, 34, { size: 12, color: opts.muted, valign: "middle", family: opts.family }),
      text(`${prefix}_tab3`, "Tab", "Settings", 192, 0, 80, 34, { size: 12, color: opts.muted, valign: "middle", family: opts.family }),
    ]),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Material Design 3                                                  */
/* ------------------------------------------------------------------ */

const materialHome = frame("mat_home", "Material 3 · Home", 0, 0, 390, 844, { fill: solid("#FFFBFE") }, [
  ...statusBar("mat", false),
  text("mat_brand", "App title", "Material 3", 28, 58, 220, 28, { size: 22, weight: 500, color: "#1D1B20", family: "Roboto" }),
  ellipse("mat_avatar", "Avatar", 326, 56, 36, 36, { fill: solid("#EADDFF") }),
  text("mat_avatar_t", "Avatar", "M", 326, 56, 36, 36, { size: 14, weight: 600, color: "#6750A4", align: "center", valign: "middle", family: "Roboto" }),
  text("mat_hello", "Greeting", "Hello, Maya", 28, 118, 300, 44, { size: 32, weight: 400, color: "#1D1B20", family: "Roboto", letterSpacing: -0.4 }),
  text("mat_sub", "Subtitle", "What would you like to create today?", 28, 166, 330, 22, { size: 14, color: "#49454F", family: "Roboto" }),
  rect("mat_search", "Search bar", 28, 210, 334, 56, { radius: 28, fill: solid("#F3EDF7") }),
  text("mat_search_icon", "Search", "⌕", 48, 210, 28, 56, { size: 22, color: "#49454F", valign: "middle", family: "Roboto" }),
  text("mat_search_t", "Search", "Search your workspace", 84, 210, 240, 56, { size: 14, color: "#79747E", valign: "middle", family: "Roboto" }),
  text("mat_quick", "Section", "Quick actions", 28, 294, 220, 24, { size: 16, weight: 500, color: "#1D1B20", family: "Roboto" }),
  ...["Create", "Templates", "Team", "Recent"].map((label, i) => {
    const x = 28 + (i % 2) * 171;
    const y = 330 + Math.floor(i / 2) * 132;
    const bg = ["#EADDFF", "#D0BCFF", "#FFD8E4", "#E8DEF8"][i];
    const fg = ["#21005D", "#21005D", "#31111D", "#1D192B"][i];
    return [
      rect(`mat_q_${i}`, `${label} card`, x, y, 163, 120, { radius: 16, fill: solid(bg) }),
      text(`mat_q_glyph_${i}`, "Icon", ["✦", "▦", "◎", "↺"][i], x + 16, y + 16, 32, 32, { size: 22, weight: 600, color: fg, family: "Roboto" }),
      text(`mat_q_t_${i}`, "Label", label, x + 16, y + 82, 130, 22, { size: 13, weight: 500, color: fg, family: "Roboto" }),
    ];
  }).flat(),
  rect("mat_fab", "Floating action button", 306, 700, 56, 56, { radius: 16, fill: solid("#6750A4"), shadow: shadow(0, 10, 24, -8, "rgba(103,80,164,.55)") }),
  text("mat_fab_t", "Add", "+", 306, 700, 56, 56, { size: 26, weight: 400, color: "#FFFFFF", align: "center", valign: "middle", family: "Roboto" }),
  rect("mat_nav", "Navigation bar", 28, 774, 334, 54, { radius: 27, fill: solid("#F3EDF7") }),
  rect("mat_nav_active", "Active indicator", 48, 782, 74, 38, { radius: 19, fill: solid("#E8DEF8") }),
  ...["⌂", "⌕", "◎"].map((g, i) => text(`mat_nav_${i}`, "Nav icon", g, 64 + i * 108, 774, 42, 54, { size: 18, color: i === 0 ? "#1D192B" : "#49454F", align: "center", valign: "middle", family: "Roboto" })),
]);

const materialFound = foundations("mat", "Material 3", "Material You tokens, Roboto type scale and expressive components.", [
  ["Primary", "#6750A4"], ["Primary container", "#EADDFF"], ["Secondary", "#625B71"], ["Tertiary", "#7D5260"], ["Surface", "#FFFBFE"], ["Error", "#B3261E"],
], { bg: "#FFFBFE", surface: "#FFFFFF", text: "#1D1B20", muted: "#49454F", primary: "#6750A4", onPrimary: "#FFFFFF", border: "#CAC4D0", chip: "#E8DEF8", radius: 16, family: "Roboto" });

const materialComponents = componentBoard("matc", "Material 3", {
  bg: "#FFFBFE", surface: "#FFFFFF", text: "#1D1B20", muted: "#49454F", primary: "#6750A4", onPrimary: "#FFFFFF", border: "#CAC4D0", chip: "#E8DEF8", danger: "#B3261E", radius: 16, family: "Roboto",
});
const materialDoc = {
  pages: [page("mat_page", "Home", [materialHome]), page("mat_found_page", "Foundations", [materialFound]), page("mat_components_page", "Components", [materialComponents])],
  tombstones: {},
};

/* ------------------------------------------------------------------ */
/*  Apple Human Interface Guidelines                                   */
/* ------------------------------------------------------------------ */

const iosHome = frame("ios_home", "iOS · Settings", 0, 0, 390, 844, { fill: solid("#F2F2F7") }, [
  ...statusBar("ios", false),
  text("ios_title", "Title", "Settings", 28, 54, 334, 28, { size: 17, weight: 600, color: "#000000", align: "center", family: "SF Pro Display" }),
  text("ios_large", "Large title", "Settings", 24, 106, 300, 48, { size: 34, weight: 700, color: "#000000", family: "SF Pro Display", letterSpacing: -0.6 }),
  rect("ios_profile", "Profile card", 20, 174, 350, 82, { radius: 14, fill: solid("#FFFFFF") }),
  ellipse("ios_avatar", "Avatar", 36, 190, 50, 50, { fill: solid("#007AFF") }),
  text("ios_avatar_t", "Avatar", "M", 36, 190, 50, 50, { size: 20, weight: 600, color: "#FFFFFF", align: "center", valign: "middle", family: "SF Pro Display" }),
  text("ios_name", "Name", "Maya Chen", 100, 194, 200, 22, { size: 17, weight: 600, color: "#000000", family: "SF Pro Display" }),
  text("ios_email", "Email", "maya@northwind.dev", 100, 218, 220, 18, { size: 13, color: "#8E8E93", family: "SF Pro Display" }),
  text("ios_chev", "Chevron", "›", 338, 190, 20, 50, { size: 26, color: "#C7C7CC", valign: "middle", family: "SF Pro Display" }),
  rect("ios_group1", "Preferences group", 20, 272, 350, 214, { radius: 14, fill: solid("#FFFFFF") }),
  ...[
    ["Wi-Fi", "Northwind 5G", "◉"],
    ["Bluetooth", "On", "◆"],
    ["Notifications", "Banners, sounds", "◒"],
    ["Focus", "Work", "☾"],
  ].map(([label, value, glyph], i) => [
    ...(i > 0 ? [rect(`ios_sep_${i}`, "Separator", 60, 272 + i * 53, 294, 1, { fill: solid("#E5E5EA") })] : []),
    rect(`ios_icon_${i}`, "Icon", 36, 286 + i * 53, 30, 30, { radius: 8, fill: solid(["#007AFF", "#007AFF", "#FF3B30", "#5856D6"][i]) }),
    text(`ios_glyph_${i}`, "Glyph", glyph, 36, 286 + i * 53, 30, 30, { size: 14, color: "#FFFFFF", align: "center", valign: "middle", family: "SF Pro Display" }),
    text(`ios_label_${i}`, "Label", label, 78, 286 + i * 53, 160, 30, { size: 16, color: "#000000", valign: "middle", family: "SF Pro Display" }),
    text(`ios_value_${i}`, "Value", value, 210, 286 + i * 53, 110, 30, { size: 14, color: "#8E8E93", align: "right", valign: "middle", family: "SF Pro Display" }),
    text(`ios_chev_${i}`, "Chevron", "›", 334, 286 + i * 53, 18, 30, { size: 22, color: "#C7C7CC", valign: "middle", family: "SF Pro Display" }),
  ]).flat(),
  rect("ios_group2", "Privacy group", 20, 502, 350, 156, { radius: 14, fill: solid("#FFFFFF") }),
  text("ios_privacy", "Section label", "Privacy & Security", 36, 516, 250, 18, { size: 12, weight: 600, color: "#8E8E93", family: "SF Pro Display" }),
  rect("ios_toggle_track", "Toggle", 300, 548, 50, 30, { radius: 15, fill: solid("#34C759") }),
  ellipse("ios_toggle_knob", "Toggle knob", 322, 550, 26, 26, { fill: solid("#FFFFFF"), shadow: shadow(0, 1, 3, 0, "rgba(0,0,0,.2)") }),
  text("ios_toggle_label", "Label", "Face ID for purchases", 36, 548, 240, 30, { size: 16, color: "#000000", valign: "middle", family: "SF Pro Display" }),
  rect("ios_sep2", "Separator", 60, 594, 294, 1, { fill: solid("#E5E5EA") }),
  text("ios_privacy2", "Label", "App privacy report", 36, 612, 240, 30, { size: 16, color: "#000000", valign: "middle", family: "SF Pro Display" }),
  text("ios_chev2", "Chevron", "›", 334, 612, 18, 30, { size: 22, color: "#C7C7CC", valign: "middle", family: "SF Pro Display" }),
  rect("ios_btn", "Primary button", 20, 690, 350, 50, { radius: 12, fill: solid("#007AFF") }),
  text("ios_btn_t", "Label", "Save changes", 20, 690, 350, 50, { size: 17, weight: 600, color: "#FFFFFF", align: "center", valign: "middle", family: "SF Pro Display" }),
  rect("ios_tabbar", "Tab bar", 0, 770, 390, 74, { fill: solid("#FFFFFF"), stroke: solid("#E5E5EA") }),
  ...["⌂", "⌕", "＋", "♡", "◎"].map((g, i) => text(`ios_tab_${i}`, "Tab", g, 20 + i * 72, 780, 40, 44, { size: 20, color: i === 0 ? "#007AFF" : "#8E8E93", align: "center", valign: "middle", family: "SF Pro Display" })),
]);

const iosFound = foundations("ios", "Apple HIG", "Human Interface Guidelines colors, SF Pro type and grouped controls.", [
  ["Blue", "#007AFF"], ["Green", "#34C759"], ["Red", "#FF3B30"], ["Orange", "#FF9500"], ["Grouped bg", "#F2F2F7"], ["Label", "#000000"],
], { bg: "#F2F2F7", surface: "#FFFFFF", text: "#000000", muted: "#8E8E93", primary: "#007AFF", onPrimary: "#FFFFFF", border: "#D1D1D6", chip: "#E5F1FF", radius: 12, family: "SF Pro Display" });

const iosComponents = componentBoard("iosc", "Apple HIG", {
  bg: "#F2F2F7", surface: "#FFFFFF", text: "#000000", muted: "#8E8E93", primary: "#007AFF", onPrimary: "#FFFFFF", border: "#D1D1D6", chip: "#E5F1FF", danger: "#FF3B30", radius: 12, family: "SF Pro Display",
});
const iosDoc = {
  pages: [page("ios_page", "Settings", [iosHome]), page("ios_found_page", "Foundations", [iosFound]), page("ios_components_page", "Components", [iosComponents])],
  tombstones: {},
};

/* ------------------------------------------------------------------ */
/*  Fluent 2                                                           */
/* ------------------------------------------------------------------ */

const fluentHome = frame("flu_home", "Fluent 2 · Dashboard", 0, 0, 1440, 900, { fill: solid("#F5F5F5") }, [
  rect("flu_header", "Command bar", 0, 0, 1440, 56, { fill: solid("#FFFFFF"), stroke: solid("#E0E0E0") }),
  rect("flu_logo", "Logo", 24, 18, 20, 20, { radius: 4, fill: solid("#0F6CBD") }),
  text("flu_brand", "Brand", "Fluent 2", 56, 16, 160, 24, { size: 15, weight: 600, color: "#242424", family: "Segoe UI" }),
  rect("flu_search", "Search", 360, 12, 360, 32, { radius: 4, fill: solid("#FFFFFF"), stroke: solid("#D1D1D1") }),
  text("flu_search_t", "Search", "Search", 376, 12, 320, 32, { size: 12, color: "#616161", valign: "middle", family: "Segoe UI" }),
  ellipse("flu_avatar", "Avatar", 1388, 14, 28, 28, { fill: solid("#0F6CBD") }),
  text("flu_avatar_t", "Avatar", "M", 1388, 14, 28, 28, { size: 11, weight: 600, color: "#FFFFFF", align: "center", valign: "middle", family: "Segoe UI" }),
  rect("flu_sidebar", "Navigation", 0, 56, 240, 844, { fill: solid("#FFFFFF"), stroke: solid("#E0E0E0") }),
  ...[["⌂", "Home"], ["▦", "Workspaces"], ["◫", "Projects"], ["◎", "People"], ["⚙", "Settings"]].map(([g, label], i) => [
    ...(i === 1 ? [rect(`flu_nav_active_${i}`, "Active nav", 8, 80 + i * 44, 224, 36, { radius: 4, fill: solid("#EBF3FC") })] : []),
    text(`flu_nav_icon_${i}`, "Icon", g, 20, 80 + i * 44, 24, 36, { size: 15, color: i === 1 ? "#0F6CBD" : "#616161", valign: "middle", family: "Segoe UI" }),
    text(`flu_nav_label_${i}`, "Label", label, 52, 80 + i * 44, 150, 36, { size: 13, weight: i === 1 ? 600 : 400, color: i === 1 ? "#0F6CBD" : "#242424", valign: "middle", family: "Segoe UI" }),
  ]).flat(),
  text("flu_title", "Title", "Workspace overview", 280, 96, 480, 38, { size: 28, weight: 600, color: "#242424", family: "Segoe UI" }),
  text("flu_sub", "Subtitle", "Track projects, people and recent activity in one place.", 280, 138, 600, 22, { size: 13, color: "#616161", family: "Segoe UI" }),
  rect("flu_primary", "Primary button", 1210, 100, 150, 34, { radius: 4, fill: solid("#0F6CBD") }),
  text("flu_primary_t", "Label", "New project", 1210, 100, 150, 34, { size: 12, weight: 600, color: "#FFFFFF", align: "center", valign: "middle", family: "Segoe UI" }),
  ...[["Active projects", "24", "+3 this week"], ["Team members", "128", "+12 this month"], ["Tasks completed", "1,284", "82% on time"]].map(([label, value, meta], i) => [
    rect(`flu_card_${i}`, "Metric card", 280 + i * 366, 188, 340, 126, { radius: 8, fill: solid("#FFFFFF"), stroke: solid("#E0E0E0"), shadow: shadow(0, 2, 8, -4, "rgba(0,0,0,.12)") }),
    text(`flu_card_l_${i}`, "Label", label, 300 + i * 366, 206, 260, 18, { size: 12, color: "#616161", family: "Segoe UI" }),
    text(`flu_card_v_${i}`, "Value", value, 300 + i * 366, 232, 260, 38, { size: 30, weight: 600, color: "#242424", family: "Segoe UI" }),
    text(`flu_card_m_${i}`, "Meta", meta, 300 + i * 366, 278, 260, 18, { size: 11, color: "#0F6CBD", family: "Segoe UI" }),
  ]).flat(),
  rect("flu_table", "Recent projects", 280, 344, 1106, 420, { radius: 8, fill: solid("#FFFFFF"), stroke: solid("#E0E0E0") }),
  text("flu_table_t", "Title", "Recent projects", 300, 362, 300, 22, { size: 15, weight: 600, color: "#242424", family: "Segoe UI" }),
  text("flu_table_view", "Link", "View all", 1300, 364, 60, 18, { size: 11, color: "#0F6CBD", align: "right", family: "Segoe UI" }),
  rect("flu_table_head", "Table header", 280, 402, 1106, 38, { fill: solid("#FAFAFA"), stroke: solid("#E0E0E0") }),
  ...["Project", "Owner", "Status", "Updated", "Progress"].map((h, i) => text(`flu_th_${i}`, "Header", h, 300 + [0, 400, 610, 820, 980][i], 410, 140, 20, { size: 11, weight: 600, color: "#616161", family: "Segoe UI" })),
  ...[
    ["Aurora design system", "Maya Chen", "On track", "2h ago", 82],
    ["Mobile checkout", "Noah Patel", "At risk", "5h ago", 46],
    ["Billing migration", "Lena Park", "On track", "Yesterday", 64],
    ["Search revamp", "Owen Diaz", "Review", "2d ago", 92],
    ["Admin console", "Iris Kim", "On track", "3d ago", 71],
  ].map(([name, owner, status, updated, progress], i) => [
    ...(i > 0 ? [rect(`flu_row_sep_${i}`, "Separator", 300, 440 + i * 64, 1066, 1, { fill: solid("#F0F0F0") })] : []),
    text(`flu_row_name_${i}`, "Project", name, 300, 450 + i * 64, 360, 40, { size: 12, weight: 600, color: "#242424", valign: "middle", family: "Segoe UI" }),
    text(`flu_row_owner_${i}`, "Owner", owner, 700, 450 + i * 64, 180, 40, { size: 11, color: "#616161", valign: "middle", family: "Segoe UI" }),
    rect(`flu_row_badge_${i}`, "Status", 910, 460 + i * 64, 76, 20, { radius: 10, fill: solid(status === "At risk" ? "#FDE7E9" : "#E7F6EC") }),
    text(`flu_row_status_${i}`, "Status", status, 910, 460 + i * 64, 76, 20, { size: 9, weight: 600, color: status === "At risk" ? "#C50F1F" : "#0E700E", align: "center", valign: "middle", family: "Segoe UI" }),
    text(`flu_row_date_${i}`, "Updated", updated, 1120, 450 + i * 64, 100, 40, { size: 11, color: "#616161", valign: "middle", family: "Segoe UI" }),
    rect(`flu_row_track_${i}`, "Track", 1240, 468 + i * 64, 110, 5, { radius: 3, fill: solid("#E0E0E0") }),
    rect(`flu_row_bar_${i}`, "Progress", 1240, 468 + i * 64, (110 * progress) / 100, 5, { radius: 3, fill: solid(progress < 50 ? "#D13438" : "#0F6CBD") }),
  ]).flat(),
]);

const fluentFound = foundations("flu", "Fluent 2", "Microsoft Fluent tokens, Segoe UI type and depth-aware components.", [
  ["Brand", "#0F6CBD"], ["Brand hover", "#115EA3"], ["Neutral bg", "#F5F5F5"], ["Surface", "#FFFFFF"], ["Stroke", "#D1D1D1"], ["Text", "#242424"],
], { bg: "#F5F5F5", surface: "#FFFFFF", text: "#242424", muted: "#616161", primary: "#0F6CBD", onPrimary: "#FFFFFF", border: "#D1D1D1", chip: "#EBF3FC", radius: 8, family: "Segoe UI" });

const fluentComponents = componentBoard("fluc", "Fluent 2", {
  bg: "#F5F5F5", surface: "#FFFFFF", text: "#242424", muted: "#616161", primary: "#0F6CBD", onPrimary: "#FFFFFF", border: "#D1D1D1", chip: "#EBF3FC", danger: "#C50F1F", radius: 8, family: "Segoe UI",
});
const fluentDoc = {
  pages: [page("flu_page", "Dashboard", [fluentHome]), page("flu_found_page", "Foundations", [fluentFound]), page("flu_components_page", "Components", [fluentComponents])],
  tombstones: {},
};

/* ------------------------------------------------------------------ */
/*  IBM Carbon                                                         */
/* ------------------------------------------------------------------ */

const carbonHome = frame("car_home", "Carbon · Data platform", 0, 0, 1440, 900, { fill: solid("#F4F4F4") }, [
  rect("car_header", "UI shell header", 0, 0, 1440, 48, { fill: solid("#161616") }),
  text("car_brand", "Brand", "IBM Carbon", 16, 0, 200, 48, { size: 14, weight: 600, color: "#FFFFFF", valign: "middle", family: "IBM Plex Sans" }),
  ...["Catalog", "Docs", "Support"].map((label, i) => text(`car_topnav_${i}`, "Header nav", label, 1060 + i * 110, 0, 100, 48, { size: 12, color: "#C6C6C6", valign: "middle", family: "IBM Plex Sans" })),
  rect("car_side", "Side navigation", 0, 48, 256, 852, { fill: solid("#262626") }),
  text("car_side_title", "Section", "Platform", 16, 72, 200, 20, { size: 10, weight: 600, color: "#8D8D8D", letterSpacing: 0.8, family: "IBM Plex Sans" }),
  ...[["◧", "Overview"], ["▤", "Datasets"], ["◫", "Pipelines"], ["◉", "Models"], ["⚙", "Settings"]].map(([g, label], i) => [
    ...(i === 0 ? [rect(`car_nav_active_${i}`, "Active", 0, 96 + i * 44, 256, 36, { fill: solid("#353535") }), rect(`car_nav_accent_${i}`, "Accent", 0, 96 + i * 44, 3, 36, { fill: solid("#0F62FE") })] : []),
    text(`car_nav_icon_${i}`, "Icon", g, 20, 96 + i * 44, 22, 36, { size: 13, color: i === 0 ? "#FFFFFF" : "#C6C6C6", valign: "middle", family: "IBM Plex Sans" }),
    text(`car_nav_label_${i}`, "Label", label, 52, 96 + i * 44, 180, 36, { size: 12, color: i === 0 ? "#FFFFFF" : "#C6C6C6", valign: "middle", family: "IBM Plex Sans" }),
  ]).flat(),
  text("car_title", "Page title", "Data platform", 288, 80, 500, 40, { size: 28, weight: 400, color: "#161616", family: "IBM Plex Sans" }),
  text("car_sub", "Subtitle", "Monitor pipeline health and model performance across the workspace.", 288, 124, 700, 22, { size: 13, color: "#525252", family: "IBM Plex Sans" }),
  rect("car_primary", "Primary button", 1216, 86, 176, 40, { radius: 0, fill: solid("#0F62FE") }),
  text("car_primary_t", "Label", "Create pipeline", 1216, 86, 176, 40, { size: 12, weight: 500, color: "#FFFFFF", align: "center", valign: "middle", family: "IBM Plex Sans" }),
  ...[["Pipelines", "48", "6 running"], ["Rows processed", "2.4M", "+18% today"], ["Model accuracy", "94.2%", "+1.2 pts"], ["Incidents", "2", "1 critical"]].map(([label, value, meta], i) => [
    rect(`car_tile_${i}`, "Tile", 288 + i * 280, 176, 264, 128, { radius: 0, fill: solid(i === 3 ? "#FFF1F1" : "#FFFFFF"), stroke: solid(i === 3 ? "#FFB3B8" : "#E0E0E0") }),
    text(`car_tile_l_${i}`, "Label", label, 304 + i * 280, 192, 220, 18, { size: 11, color: "#525252", family: "IBM Plex Sans" }),
    text(`car_tile_v_${i}`, "Value", value, 304 + i * 280, 216, 220, 40, { size: 30, weight: 400, color: i === 3 ? "#DA1E28" : "#161616", family: "IBM Plex Sans" }),
    text(`car_tile_m_${i}`, "Meta", meta, 304 + i * 280, 270, 220, 18, { size: 10, color: i === 3 ? "#DA1E28" : "#24A148", family: "IBM Plex Sans" }),
  ]).flat(),
  rect("car_table", "Data table", 288, 336, 1104, 436, { radius: 0, fill: solid("#FFFFFF"), stroke: solid("#E0E0E0") }),
  text("car_table_t", "Title", "Pipeline runs", 304, 354, 300, 22, { size: 15, weight: 600, color: "#161616", family: "IBM Plex Sans" }),
  text("car_table_filter", "Filter", "Filter ⌄", 1300, 356, 70, 18, { size: 10, color: "#0F62FE", align: "right", family: "IBM Plex Sans" }),
  rect("car_head", "Table header", 288, 392, 1104, 40, { fill: solid("#F4F4F4") }),
  ...["Pipeline", "Status", "Duration", "Rows", "Updated"].map((h, i) => text(`car_th_${i}`, "Header", h, 304 + [0, 380, 590, 780, 960][i], 402, 160, 20, { size: 10, weight: 600, color: "#525252", family: "IBM Plex Sans" })),
  ...[
    ["orders-ingest", "Succeeded", "2m 14s", "842k", "2m ago"],
    ["customer-sync", "Running", "—", "1.2M", "Now"],
    ["risk-scoring", "Failed", "0m 42s", "0", "12m ago"],
    ["churn-features", "Succeeded", "4m 08s", "640k", "1h ago"],
    ["model-eval", "Succeeded", "1m 32s", "128k", "3h ago"],
  ].map(([name, status, duration, rows, updated], i) => [
    ...(i > 0 ? [rect(`car_sep_${i}`, "Separator", 304, 440 + i * 64, 1072, 1, { fill: solid("#E0E0E0") })] : []),
    text(`car_name_${i}`, "Pipeline", name, 304, 452 + i * 64, 340, 40, { size: 12, weight: 500, color: "#161616", valign: "middle", family: "IBM Plex Sans" }),
    rect(`car_dot_${i}`, "Status dot", 684, 467 + i * 64, 8, 8, { radius: 4, fill: solid(status === "Failed" ? "#DA1E28" : status === "Running" ? "#0F62FE" : "#24A148") }),
    text(`car_status_${i}`, "Status", status, 700, 452 + i * 64, 130, 40, { size: 11, color: "#161616", valign: "middle", family: "IBM Plex Sans" }),
    text(`car_dur_${i}`, "Duration", duration, 880, 452 + i * 64, 100, 40, { size: 11, color: "#525252", valign: "middle", family: "IBM Plex Sans" }),
    text(`car_rows_${i}`, "Rows", rows, 1064, 452 + i * 64, 100, 40, { size: 11, color: "#525252", valign: "middle", family: "IBM Plex Sans" }),
    text(`car_upd_${i}`, "Updated", updated, 1220, 452 + i * 64, 120, 40, { size: 11, color: "#525252", valign: "middle", family: "IBM Plex Sans" }),
  ]).flat(),
]);

const carbonFound = foundations("car", "IBM Carbon", "Carbon color tokens, IBM Plex Sans type and productive components.", [
  ["Blue 60", "#0F62FE"], ["Gray 10", "#F4F4F4"], ["Gray 90", "#262626"], ["Red 60", "#DA1E28"], ["Green 50", "#24A148"], ["Yellow 30", "#F1C21B"],
], { bg: "#F4F4F4", surface: "#FFFFFF", text: "#161616", muted: "#525252", primary: "#0F62FE", onPrimary: "#FFFFFF", border: "#E0E0E0", chip: "#E8F0FF", radius: 0, family: "IBM Plex Sans" });

const carbonComponents = componentBoard("carc", "IBM Carbon", {
  bg: "#F4F4F4", surface: "#FFFFFF", text: "#161616", muted: "#525252", primary: "#0F62FE", onPrimary: "#FFFFFF", border: "#E0E0E0", chip: "#E8F0FF", danger: "#DA1E28", radius: 0, family: "IBM Plex Sans",
});
const carbonDoc = {
  pages: [page("car_page", "Data platform", [carbonHome]), page("car_found_page", "Foundations", [carbonFound]), page("car_components_page", "Components", [carbonComponents])],
  tombstones: {},
};


/* ------------------------------------------------------------------ */
/*  Ant Design (Alibaba / Ant Group)                                  */
/* ------------------------------------------------------------------ */

const antHome = frame("ant_home", "Ant Design · Dashboard", 0, 0, 1440, 900, { fill: solid("#F5F5F5") }, [
  rect("ant_header", "Header", 0, 0, 1440, 64, { fill: solid("#FFFFFF"), stroke: solid("#F0F0F0") }),
  rect("ant_logo", "Logo", 24, 18, 28, 28, { radius: 6, fill: solid("#1677FF") }),
  text("ant_brand", "Brand", "Ant Design", 64, 18, 160, 28, { size: 16, weight: 600, color: "#000000E0", family: "PingFang SC" }),
  ...["Dashboard", "Projects", "Reports", "Settings"].map((label, i) =>
    text(`ant_nav_${i}`, "Nav", label, 280 + i * 92, 18, 88, 28, { size: 13, weight: i === 0 ? 600 : 400, color: i === 0 ? "#1677FF" : "#000000A6", valign: "middle", family: "PingFang SC" }),
  ),
  rect("ant_search", "Search", 900, 16, 300, 32, { radius: 6, fill: solid("#F5F5F5"), stroke: solid("#D9D9D9") }),
  text("ant_search_t", "Search", "Search…", 916, 16, 260, 32, { size: 12, color: "#00000040", valign: "middle", family: "PingFang SC" }),
  ellipse("ant_avatar", "Avatar", 1360, 16, 32, 32, { fill: solid("#1677FF") }),
  text("ant_avatar_t", "Avatar", "M", 1360, 16, 32, 32, { size: 12, weight: 600, color: "#FFFFFF", align: "center", valign: "middle", family: "PingFang SC" }),
  rect("ant_sider", "Sider", 0, 64, 224, 836, { fill: solid("#001529") }),
  text("ant_sider_brand", "Sider brand", "Ant Design Pro", 20, 80, 180, 24, { size: 14, weight: 600, color: "#FFFFFF", family: "PingFang SC" }),
  ...[["⌂", "Dashboard"], ["▦", "Projects"], ["◫", "Reports"], ["◎", "Team"], ["⚙", "Settings"]].map(([g, label], i) => [
    ...(i === 0 ? [rect(`ant_menu_active_${i}`, "Active menu", 8, 120 + i * 44, 208, 40, { radius: 8, fill: solid("#1677FF") })] : []),
    text(`ant_menu_icon_${i}`, "Icon", g, 20, 120 + i * 44, 24, 40, { size: 15, color: i === 0 ? "#FFFFFF" : "#FFFFFFA6", valign: "middle", family: "PingFang SC" }),
    text(`ant_menu_${i}`, "Menu", label, 52, 120 + i * 44, 150, 40, { size: 13, weight: i === 0 ? 600 : 400, color: i === 0 ? "#FFFFFF" : "#FFFFFFA6", valign: "middle", family: "PingFang SC" }),
  ]).flat(),
  text("ant_breadcrumb", "Breadcrumb", "Home / Dashboard", 272, 84, 280, 20, { size: 12, color: "#00000073", family: "PingFang SC" }),
  text("ant_title", "Title", "Dashboard", 272, 108, 420, 38, { size: 28, weight: 600, color: "#000000E0", family: "PingFang SC" }),
  text("ant_sub", "Subtitle", "Welcome back, Maya. Here is what is happening today.", 272, 148, 600, 20, { size: 13, color: "#00000073", family: "PingFang SC" }),
  rect("ant_primary", "Primary button", 1214, 104, 164, 36, { radius: 6, fill: solid("#1677FF") }),
  text("ant_primary_t", "Label", "+ New project", 1214, 104, 164, 36, { size: 13, weight: 500, color: "#FFFFFF", align: "center", valign: "middle", family: "PingFang SC" }),
  ...[["Active projects", "24", "↑ 12.5%"], ["Team members", "128", "↑ 8.2%"], ["Tasks completed", "1,284", "↑ 21.3%"], ["Revenue", "$86.4k", "↓ 2.1%"]].map(([label, value, trend], i) => [
    rect(`ant_card_${i}`, "Statistic card", 272 + i * 280, 188, 264, 112, { radius: 8, fill: solid("#FFFFFF"), stroke: solid("#F0F0F0") }),
    text(`ant_card_l_${i}`, "Label", label, 288 + i * 280, 204, 220, 18, { size: 12, color: "#00000073", family: "PingFang SC" }),
    text(`ant_card_v_${i}`, "Value", value, 288 + i * 280, 226, 220, 38, { size: 28, weight: 600, color: "#000000E0", family: "PingFang SC" }),
    text(`ant_card_t_${i}`, "Trend", trend, 288 + i * 280, 268, 220, 18, { size: 11, color: i === 3 ? "#FF4D4F" : "#52C41A", family: "PingFang SC" }),
  ]).flat(),
  rect("ant_table", "Table card", 272, 328, 1106, 440, { radius: 8, fill: solid("#FFFFFF"), stroke: solid("#F0F0F0") }),
  text("ant_table_title", "Title", "Recent projects", 292, 348, 280, 24, { size: 16, weight: 600, color: "#000000E0", family: "PingFang SC" }),
  text("ant_table_link", "Link", "View all →", 1298, 350, 60, 20, { size: 12, color: "#1677FF", align: "right", family: "PingFang SC" }),
  rect("ant_table_head", "Table header", 272, 390, 1106, 40, { fill: solid("#FAFAFA"), stroke: solid("#F0F0F0") }),
  ...["Project", "Owner", "Status", "Progress", "Updated"].map((h, i) => text(`ant_th_${i}`, "Header", h, 292 + [0, 360, 570, 760, 980][i], 400, 140, 20, { size: 12, weight: 500, color: "#00000073", family: "PingFang SC" })),
  ...[
    ["Aurora design system", "Maya Chen", "In progress", 82, "2h ago"],
    ["Mobile checkout", "Noah Patel", "At risk", 46, "5h ago"],
    ["Billing migration", "Lena Park", "Completed", 100, "Yesterday"],
    ["Search revamp", "Owen Diaz", "In review", 92, "2d ago"],
    ["Admin console", "Iris Kim", "In progress", 71, "3d ago"],
  ].map(([name, owner, status, progress, updated], i) => [
    ...(i > 0 ? [rect(`ant_sep_${i}`, "Separator", 292, 430 + i * 64, 1066, 1, { fill: solid("#F0F0F0") })] : []),
    text(`ant_name_${i}`, "Project", name, 292, 444 + i * 64, 300, 40, { size: 13, weight: 500, color: "#000000E0", valign: "middle", family: "PingFang SC" }),
    text(`ant_owner_${i}`, "Owner", owner, 652, 444 + i * 64, 170, 40, { size: 12, color: "#000000A6", valign: "middle", family: "PingFang SC" }),
    rect(`ant_tag_${i}`, "Status tag", 862, 456 + i * 64, 92, 22, { radius: 4, fill: solid(status === "At risk" ? "#FFF1F0" : status === "Completed" ? "#F6FFED" : "#E6F4FF") }),
    text(`ant_tag_t_${i}`, "Status", status, 862, 456 + i * 64, 92, 22, { size: 10, weight: 500, color: status === "At risk" ? "#FF4D4F" : status === "Completed" ? "#52C41A" : "#1677FF", align: "center", valign: "middle", family: "PingFang SC" }),
    rect(`ant_progress_track_${i}`, "Progress track", 990, 466 + i * 64, 120, 6, { radius: 3, fill: solid("#F0F0F0") }),
    rect(`ant_progress_${i}`, "Progress", 990, 466 + i * 64, (120 * progress) / 100, 6, { radius: 3, fill: solid(progress < 50 ? "#FF4D4F" : "#1677FF") }),
    text(`ant_upd_${i}`, "Updated", updated, 1160, 444 + i * 64, 120, 40, { size: 11, color: "#00000073", valign: "middle", family: "PingFang SC" }),
  ]).flat(),
]);

const antFound = foundations("ant", "Ant Design", "Ant Group blue, neutral tokens, 6px controls and data-dense enterprise components.", [
  ["Primary", "#1677FF"], ["Success", "#52C41A"], ["Warning", "#FAAD14"], ["Error", "#FF4D4F"], ["Border", "#D9D9D9"], ["Container", "#FFFFFF"],
], { bg: "#F5F5F5", surface: "#FFFFFF", text: "#000000E0", muted: "#00000073", primary: "#1677FF", onPrimary: "#FFFFFF", border: "#D9D9D9", chip: "#E6F4FF", radius: 6, family: "PingFang SC" });

const antComponents = componentBoard("antc", "Ant Design", {
  bg: "#F5F5F5", surface: "#FFFFFF", text: "#000000E0", muted: "#00000073", primary: "#1677FF", onPrimary: "#FFFFFF", border: "#D9D9D9", chip: "#E6F4FF", danger: "#FF4D4F", radius: 6, family: "PingFang SC",
});
const antDoc = {
  pages: [page("ant_page", "Dashboard", [antHome]), page("ant_found_page", "Foundations", [antFound]), page("ant_components_page", "Components", [antComponents])],
  tombstones: {},
};

/* ------------------------------------------------------------------ */
/*  ByteDance Arco Design                                             */
/* ------------------------------------------------------------------ */

const arcoHome = frame("arco_home", "ByteDance Arco · Console", 0, 0, 1440, 900, { fill: solid("#F7F8FA") }, [
  rect("arco_header", "Header", 0, 0, 1440, 64, { fill: solid("#FFFFFF"), stroke: solid("#E5E6EB") }),
  rect("arco_logo", "Logo", 24, 18, 28, 28, { radius: 4, fill: solid("#165DFF") }),
  text("arco_brand", "Brand", "Arco Design", 64, 18, 180, 28, { size: 16, weight: 600, color: "#1D2129", family: "PingFang SC" }),
  ...["Overview", "Projects", "Reports", "Team"].map((label, i) =>
    text(`arco_nav_${i}`, "Nav", label, 300 + i * 86, 18, 80, 28, { size: 13, weight: i === 0 ? 600 : 400, color: i === 0 ? "#165DFF" : "#4E5969", valign: "middle", family: "PingFang SC" }),
  ),
  rect("arco_search", "Search", 920, 16, 280, 32, { radius: 4, fill: solid("#F2F3F5"), stroke: solid("#E5E6EB") }),
  text("arco_search_t", "Search", "Search projects", 936, 16, 250, 32, { size: 12, color: "#86909C", valign: "middle", family: "PingFang SC" }),
  ellipse("arco_avatar", "Avatar", 1360, 16, 32, 32, { fill: solid("#165DFF") }),
  text("arco_avatar_t", "Avatar", "M", 1360, 16, 32, 32, { size: 12, weight: 600, color: "#FFFFFF", align: "center", valign: "middle", family: "PingFang SC" }),
  rect("arco_side", "Sidebar", 0, 64, 224, 836, { fill: solid("#FFFFFF"), stroke: solid("#E5E6EB") }),
  text("arco_side_title", "Section", "Workspace", 20, 84, 180, 20, { size: 10, weight: 600, color: "#86909C", letterSpacing: 0.8, family: "PingFang SC" }),
  ...[["⌂", "Overview"], ["▦", "Projects"], ["◫", "Reports"], ["◎", "Team"], ["⚙", "Settings"]].map(([g, label], i) => [
    ...(i === 0 ? [rect(`arco_active_${i}`, "Active", 8, 116 + i * 44, 208, 38, { radius: 4, fill: solid("#E8F3FF") })] : []),
    text(`arco_icon_${i}`, "Icon", g, 20, 116 + i * 44, 22, 38, { size: 14, color: i === 0 ? "#165DFF" : "#86909C", valign: "middle", family: "PingFang SC" }),
    text(`arco_label_${i}`, "Label", label, 52, 116 + i * 44, 150, 38, { size: 13, weight: i === 0 ? 600 : 400, color: i === 0 ? "#165DFF" : "#4E5969", valign: "middle", family: "PingFang SC" }),
  ]).flat(),
  text("arco_breadcrumb", "Breadcrumb", "Workspace / Overview", 272, 84, 300, 20, { size: 12, color: "#86909C", family: "PingFang SC" }),
  text("arco_title", "Title", "Overview", 272, 108, 400, 38, { size: 28, weight: 600, color: "#1D2129", family: "PingFang SC" }),
  text("arco_sub", "Subtitle", "Track delivery, quality and team velocity in real time.", 272, 148, 620, 20, { size: 13, color: "#4E5969", family: "PingFang SC" }),
  rect("arco_primary", "Primary button", 1214, 104, 164, 36, { radius: 4, fill: solid("#165DFF") }),
  text("arco_primary_t", "Label", "+ New project", 1214, 104, 164, 36, { size: 13, weight: 500, color: "#FFFFFF", align: "center", valign: "middle", family: "PingFang SC" }),
  ...[["Projects", "24", "↑ 12.5%"], ["Team velocity", "86", "↑ 6.8%"], ["Tasks done", "1,284", "↑ 18.2%"], ["Open bugs", "12", "↓ 7.4%"]].map(([label, value, trend], i) => [
    rect(`arco_card_${i}`, "Metric card", 272 + i * 280, 188, 264, 112, { radius: 4, fill: solid("#FFFFFF"), stroke: solid("#E5E6EB") }),
    text(`arco_card_l_${i}`, "Label", label, 288 + i * 280, 204, 220, 18, { size: 12, color: "#4E5969", family: "PingFang SC" }),
    text(`arco_card_v_${i}`, "Value", value, 288 + i * 280, 226, 220, 38, { size: 28, weight: 600, color: "#1D2129", family: "PingFang SC" }),
    text(`arco_card_t_${i}`, "Trend", trend, 288 + i * 280, 268, 220, 18, { size: 11, color: i === 3 ? "#F53F3F" : "#00B42A", family: "PingFang SC" }),
  ]).flat(),
  rect("arco_table", "Table card", 272, 328, 1106, 440, { radius: 4, fill: solid("#FFFFFF"), stroke: solid("#E5E6EB") }),
  text("arco_table_title", "Title", "Project delivery", 292, 348, 280, 24, { size: 16, weight: 600, color: "#1D2129", family: "PingFang SC" }),
  text("arco_table_link", "Link", "View all →", 1298, 350, 60, 20, { size: 12, color: "#165DFF", align: "right", family: "PingFang SC" }),
  rect("arco_head", "Table header", 272, 390, 1106, 40, { fill: solid("#F7F8FA"), stroke: solid("#E5E6EB") }),
  ...["Project", "Owner", "Status", "Priority", "Updated"].map((h, i) => text(`arco_th_${i}`, "Header", h, 292 + [0, 350, 560, 760, 980][i], 400, 140, 20, { size: 12, weight: 500, color: "#4E5969", family: "PingFang SC" })),
  ...[
    ["Aurora design system", "Maya Chen", "On track", "High", "2h ago"],
    ["Mobile checkout", "Noah Patel", "At risk", "High", "5h ago"],
    ["Billing migration", "Lena Park", "Done", "Medium", "Yesterday"],
    ["Search revamp", "Owen Diaz", "In review", "Low", "2d ago"],
    ["Admin console", "Iris Kim", "On track", "Medium", "3d ago"],
  ].map(([name, owner, status, priority, updated], i) => [
    ...(i > 0 ? [rect(`arco_sep_${i}`, "Separator", 292, 430 + i * 64, 1066, 1, { fill: solid("#F2F3F5") })] : []),
    text(`arco_name_${i}`, "Project", name, 292, 444 + i * 64, 290, 40, { size: 13, weight: 500, color: "#1D2129", valign: "middle", family: "PingFang SC" }),
    text(`arco_owner_${i}`, "Owner", owner, 642, 444 + i * 64, 170, 40, { size: 12, color: "#4E5969", valign: "middle", family: "PingFang SC" }),
    rect(`arco_tag_${i}`, "Status tag", 852, 456 + i * 64, 82, 22, { radius: 2, fill: solid(status === "At risk" ? "#FFECE8" : status === "Done" ? "#E8FFEA" : "#E8F3FF") }),
    text(`arco_tag_t_${i}`, "Status", status, 852, 456 + i * 64, 82, 22, { size: 10, weight: 500, color: status === "At risk" ? "#F53F3F" : status === "Done" ? "#00B42A" : "#165DFF", align: "center", valign: "middle", family: "PingFang SC" }),
    text(`arco_pri_${i}`, "Priority", priority, 970, 444 + i * 64, 100, 40, { size: 11, color: "#4E5969", valign: "middle", family: "PingFang SC" }),
    text(`arco_upd_${i}`, "Updated", updated, 1160, 444 + i * 64, 120, 40, { size: 11, color: "#86909C", valign: "middle", family: "PingFang SC" }),
  ]).flat(),
]);

const arcoFound = foundations("arco", "Arco Design", "ByteDance Arco blue, compact 4px geometry and data-dense console patterns.", [
  ["Primary", "#165DFF"], ["Success", "#00B42A"], ["Warning", "#FF7D00"], ["Danger", "#F53F3F"], ["Border", "#E5E6EB"], ["Surface", "#FFFFFF"],
], { bg: "#F7F8FA", surface: "#FFFFFF", text: "#1D2129", muted: "#4E5969", primary: "#165DFF", onPrimary: "#FFFFFF", border: "#E5E6EB", chip: "#E8F3FF", radius: 4, family: "PingFang SC" });

const arcoComponents = componentBoard("arcoc", "ByteDance Arco", {
  bg: "#F7F8FA", surface: "#FFFFFF", text: "#1D2129", muted: "#4E5969", primary: "#165DFF", onPrimary: "#FFFFFF", border: "#E5E6EB", chip: "#E8F3FF", danger: "#F53F3F", radius: 4, family: "PingFang SC",
});
const arcoDoc = {
  pages: [page("arco_page", "Console", [arcoHome]), page("arco_found_page", "Foundations", [arcoFound]), page("arco_components_page", "Components", [arcoComponents])],
  tombstones: {},
};


/* ------------------------------------------------------------------ */
/*  Element Plus (Eleme)                                              */
/* ------------------------------------------------------------------ */

const elementHome = frame("el_home", "Element Plus · Admin", 0, 0, 1440, 900, { fill: solid("#F5F7FA") }, [
  rect("el_header", "Header", 0, 0, 1440, 60, { fill: solid("#FFFFFF"), stroke: solid("#E4E7ED") }),
  rect("el_logo", "Logo", 24, 16, 28, 28, { radius: 4, fill: solid("#409EFF") }),
  text("el_brand", "Brand", "Element Plus", 64, 16, 180, 28, { size: 16, weight: 600, color: "#303133", family: "Helvetica Neue" }),
  ...["Dashboard", "Projects", "Reports", "Settings"].map((label, i) =>
    text(`el_nav_${i}`, "Nav", label, 300 + i * 88, 16, 80, 28, { size: 13, weight: i === 0 ? 600 : 400, color: i === 0 ? "#409EFF" : "#606266", valign: "middle", family: "Helvetica Neue" }),
  ),
  rect("el_search", "Search", 920, 14, 280, 32, { radius: 4, fill: solid("#FFFFFF"), stroke: solid("#DCDFE6") }),
  text("el_search_t", "Search", "Search…", 936, 14, 250, 32, { size: 12, color: "#C0C4CC", valign: "middle", family: "Helvetica Neue" }),
  ellipse("el_avatar", "Avatar", 1358, 14, 32, 32, { fill: solid("#409EFF") }),
  text("el_avatar_t", "Avatar", "M", 1358, 14, 32, 32, { size: 12, weight: 600, color: "#FFFFFF", align: "center", valign: "middle", family: "Helvetica Neue" }),
  rect("el_side", "Sidebar", 0, 60, 220, 840, { fill: solid("#304156") }),
  text("el_side_title", "Section", "Workspace", 20, 80, 180, 20, { size: 10, weight: 600, color: "#AEB9C8", letterSpacing: 0.8, family: "Helvetica Neue" }),
  ...[["⌂", "Dashboard"], ["▦", "Projects"], ["◫", "Reports"], ["◎", "Team"], ["⚙", "Settings"]].map(([g, label], i) => [
    ...(i === 0 ? [rect(`el_active_${i}`, "Active", 0, 112 + i * 46, 220, 42, { fill: solid("#263445") }), rect(`el_active_bar_${i}`, "Accent", 0, 112 + i * 46, 3, 42, { fill: solid("#409EFF") })] : []),
    text(`el_icon_${i}`, "Icon", g, 22, 112 + i * 46, 22, 42, { size: 14, color: i === 0 ? "#409EFF" : "#BFCBD9", valign: "middle", family: "Helvetica Neue" }),
    text(`el_label_${i}`, "Label", label, 54, 112 + i * 46, 150, 42, { size: 13, weight: i === 0 ? 600 : 400, color: i === 0 ? "#FFFFFF" : "#BFCBD9", valign: "middle", family: "Helvetica Neue" }),
  ]).flat(),
  text("el_breadcrumb", "Breadcrumb", "Home / Dashboard", 268, 80, 300, 20, { size: 12, color: "#909399", family: "Helvetica Neue" }),
  text("el_title", "Title", "Dashboard", 268, 104, 400, 38, { size: 28, weight: 600, color: "#303133", family: "Helvetica Neue" }),
  text("el_sub", "Subtitle", "Welcome back, Maya. Here is your workspace overview.", 268, 144, 620, 20, { size: 13, color: "#606266", family: "Helvetica Neue" }),
  rect("el_primary", "Primary button", 1212, 102, 164, 36, { radius: 4, fill: solid("#409EFF") }),
  text("el_primary_t", "Label", "+ New project", 1212, 102, 164, 36, { size: 13, weight: 500, color: "#FFFFFF", align: "center", valign: "middle", family: "Helvetica Neue" }),
  ...[["Active projects", "24", "↑ 12.5%"], ["Team members", "128", "↑ 8.2%"], ["Tasks completed", "1,284", "↑ 21.3%"], ["Open issues", "12", "↓ 7.4%"]].map(([label, value, trend], i) => [
    rect(`el_card_${i}`, "Statistic card", 268 + i * 280, 184, 264, 112, { radius: 4, fill: solid("#FFFFFF"), stroke: solid("#EBEEF5") }),
    text(`el_card_l_${i}`, "Label", label, 284 + i * 280, 200, 220, 18, { size: 12, color: "#909399", family: "Helvetica Neue" }),
    text(`el_card_v_${i}`, "Value", value, 284 + i * 280, 224, 220, 38, { size: 28, weight: 600, color: "#303133", family: "Helvetica Neue" }),
    text(`el_card_t_${i}`, "Trend", trend, 284 + i * 280, 264, 220, 18, { size: 11, color: i === 3 ? "#F56C6C" : "#67C23A", family: "Helvetica Neue" }),
  ]).flat(),
  rect("el_table", "Table card", 268, 324, 1108, 444, { radius: 4, fill: solid("#FFFFFF"), stroke: solid("#EBEEF5") }),
  text("el_table_title", "Title", "Recent projects", 288, 344, 280, 24, { size: 16, weight: 600, color: "#303133", family: "Helvetica Neue" }),
  text("el_table_link", "Link", "View all →", 1296, 346, 60, 20, { size: 12, color: "#409EFF", align: "right", family: "Helvetica Neue" }),
  rect("el_head", "Table header", 268, 386, 1108, 40, { fill: solid("#F5F7FA"), stroke: solid("#EBEEF5") }),
  ...["Project", "Owner", "Status", "Progress", "Updated"].map((h, i) => text(`el_th_${i}`, "Header", h, 288 + [0, 350, 560, 750, 980][i], 396, 140, 20, { size: 12, weight: 600, color: "#909399", family: "Helvetica Neue" })),
  ...[
    ["Aurora design system", "Maya Chen", "In progress", 82, "2h ago"],
    ["Mobile checkout", "Noah Patel", "Alert", 46, "5h ago"],
    ["Billing migration", "Lena Park", "Completed", 100, "Yesterday"],
    ["Search revamp", "Owen Diaz", "Review", 92, "2d ago"],
    ["Admin console", "Iris Kim", "In progress", 71, "3d ago"],
  ].map(([name, owner, status, progress, updated], i) => [
    ...(i > 0 ? [rect(`el_sep_${i}`, "Separator", 288, 426 + i * 64, 1068, 1, { fill: solid("#EBEEF5") })] : []),
    text(`el_name_${i}`, "Project", name, 288, 440 + i * 64, 290, 40, { size: 13, weight: 500, color: "#303133", valign: "middle", family: "Helvetica Neue" }),
    text(`el_owner_${i}`, "Owner", owner, 638, 440 + i * 64, 170, 40, { size: 12, color: "#606266", valign: "middle", family: "Helvetica Neue" }),
    rect(`el_tag_${i}`, "Status tag", 848, 452 + i * 64, 90, 22, { radius: 2, fill: solid(status === "Alert" ? "#FEF0F0" : status === "Completed" ? "#F0F9EB" : "#ECF5FF") }),
    text(`el_tag_t_${i}`, "Status", status, 848, 452 + i * 64, 90, 22, { size: 10, weight: 500, color: status === "Alert" ? "#F56C6C" : status === "Completed" ? "#67C23A" : "#409EFF", align: "center", valign: "middle", family: "Helvetica Neue" }),
    rect(`el_progress_track_${i}`, "Track", 970, 462 + i * 64, 120, 6, { radius: 3, fill: solid("#EBEEF5") }),
    rect(`el_progress_${i}`, "Progress", 970, 462 + i * 64, (120 * progress) / 100, 6, { radius: 3, fill: solid(progress < 50 ? "#F56C6C" : "#409EFF") }),
    text(`el_upd_${i}`, "Updated", updated, 1160, 440 + i * 64, 120, 40, { size: 11, color: "#909399", valign: "middle", family: "Helvetica Neue" }),
  ]).flat(),
]);

const elementFound = foundations("el", "Element Plus", "Eleme Element blue, compact 4px controls and classic admin console patterns.", [
  ["Primary", "#409EFF"], ["Success", "#67C23A"], ["Warning", "#E6A23C"], ["Danger", "#F56C6C"], ["Border", "#DCDFE6"], ["Surface", "#FFFFFF"],
], { bg: "#F5F7FA", surface: "#FFFFFF", text: "#303133", muted: "#909399", primary: "#409EFF", onPrimary: "#FFFFFF", border: "#DCDFE6", chip: "#ECF5FF", radius: 4, family: "Helvetica Neue" });

const elementComponents = componentBoard("elc", "Element Plus", {
  bg: "#F5F7FA", surface: "#FFFFFF", text: "#303133", muted: "#909399", primary: "#409EFF", onPrimary: "#FFFFFF", border: "#DCDFE6", chip: "#ECF5FF", danger: "#F56C6C", radius: 4, family: "Helvetica Neue",
});
const elementDoc = {
  pages: [page("el_page", "Dashboard", [elementHome]), page("el_found_page", "Foundations", [elementFound]), page("el_components_page", "Components", [elementComponents])],
  tombstones: {},
};


/* ------------------------------------------------------------------ */
/*  Firefox Photon                                                     */
/* ------------------------------------------------------------------ */

const ffxHome = frame("ffx_home", "Firefox · New Tab", 0, 0, 1440, 900, { fill: solid("#F9F9FB") }, [
  rect("ffx_header", "Browser chrome", 0, 0, 1440, 64, { fill: solid("#FFFFFF"), stroke: solid("#E0E0E6") }),
  image("ffx_logo", "Firefox logo", "/brand/firefox.svg", 24, 16, 32, 32, { radius: 8 }),
  text("ffx_brand", "Brand", "Firefox", 66, 18, 140, 28, { size: 18, weight: 700, color: "#20123A" }),
  ...["New tab", "Bookmarks", "History", "Sync"].map((label, i) =>
    text(`ffx_nav_${i}`, "Browser nav", label, 280 + i * 104, 18, 96, 28, { size: 13, weight: i === 0 ? 600 : 400, color: i === 0 ? "#0060DF" : "#5B5B66", valign: "middle" }),
  ),
  ellipse("ffx_avatar", "Avatar", 1384, 16, 32, 32, { fill: solid("#FF7139") }),
  text("ffx_avatar_t", "Avatar", "M", 1384, 16, 32, 32, { size: 12, weight: 700, color: "#FFFFFF", align: "center", valign: "middle" }),
  text("ffx_hello", "Greeting", "Good evening, Maya", 280, 108, 500, 38, { size: 28, weight: 700, color: "#20123A", letterSpacing: -0.6 }),
  text("ffx_sub", "Subtitle", "Pick up where you left off — or start somewhere new.", 280, 148, 620, 22, { size: 13, color: "#5B5B66" }),
  rect("ffx_search", "Address bar", 280, 192, 880, 58, { radius: 29, fill: solid("#FFFFFF"), stroke: solid("#D7D7DB"), shadow: shadow(0, 10, 28, -18, "rgba(32,18,58,.28)") }),
  text("ffx_search_icon", "Search icon", "⌕", 304, 192, 28, 58, { size: 23, color: "#0060DF", valign: "middle" }),
  text("ffx_search_t", "Search placeholder", "Search the web or type a URL", 342, 192, 560, 58, { size: 14, color: "#77778A", valign: "middle" }),
  rect("ffx_search_shortcut", "Search shortcut", 1098, 206, 44, 30, { radius: 6, fill: solid("#F0F0F3") }),
  text("ffx_search_shortcut_t", "Shortcut", "⌘K", 1098, 206, 44, 30, { size: 10, weight: 600, color: "#5B5B66", align: "center", valign: "middle" }),

  text("ffx_shortcuts", "Section", "Shortcuts", 280, 286, 220, 20, { size: 11, weight: 700, color: "#5B5B66", letterSpacing: 0.8 }),
  text("ffx_shortcuts_more", "Link", "Manage", 1120, 286, 40, 18, { size: 10, color: "#0060DF", align: "right" }),
  ...[
    ["S", "Sigma", "figma.com", "#0060DF"],
    ["N", "Notion", "notion.so", "#20123A"],
    ["G", "GitHub", "github.com", "#5B5B66"],
    ["C", "Calendar", "calendar.google.com", "#FF7139"],
  ].map(([glyph, title, url, color], i) => [
    rect(`ffx_sc_${i}`, "Shortcut card", 280 + i * 208, 318, 184, 132, { radius: 12, fill: solid("#FFFFFF"), stroke: solid("#E0E0E6") }),
    rect(`ffx_sc_icon_${i}`, "Icon tile", 300 + i * 208, 338, 40, 40, { radius: 10, fill: solid(color, 0.12) }),
    text(`ffx_sc_glyph_${i}`, "Icon", glyph, 300 + i * 208, 338, 40, 40, { size: 16, weight: 700, color, align: "center", valign: "middle" }),
    text(`ffx_sc_t_${i}`, "Title", title, 300 + i * 208, 392, 144, 20, { size: 13, weight: 600, color: "#20123A" }),
    text(`ffx_sc_u_${i}`, "URL", url, 300 + i * 208, 414, 144, 18, { size: 10, color: "#77778A" }),
  ]).flat(),

  rect("ffx_recent", "Recent tabs", 280, 486, 520, 326, { radius: 12, fill: solid("#FFFFFF"), stroke: solid("#E0E0E6") }),
  text("ffx_recent_t", "Title", "Recent tabs", 304, 510, 240, 24, { size: 16, weight: 700, color: "#20123A" }),
  text("ffx_recent_more", "Link", "View all", 728, 512, 48, 18, { size: 10, color: "#0060DF", align: "right" }),
  ...[
    ["Figma — Sigma product file", "figma.com", "2m ago", "#A259FF"],
    ["Notion — Q4 roadmap", "notion.so", "18m ago", "#20123A"],
    ["GitHub — Pull request #284", "github.com", "41m ago", "#5B5B66"],
    ["Linear — Design system", "linear.app", "1h ago", "#5E6AD2"],
  ].map(([title, domain, time, color], i) => [
    ...(i > 0 ? [rect(`ffx_recent_sep_${i}`, "Separator", 304, 566 + i * 58, 472, 1, { fill: solid("#EDEDF0") })] : []),
    rect(`ffx_recent_icon_${i}`, "Favicon", 304, 586 + i * 58, 30, 30, { radius: 7, fill: solid(color, 0.13) }),
    text(`ffx_recent_g_${i}`, "Favicon glyph", title.charAt(0), 304, 586 + i * 58, 30, 30, { size: 10, weight: 700, color, align: "center", valign: "middle" }),
    text(`ffx_recent_title_${i}`, "Tab title", title, 346, 582 + i * 58, 330, 22, { size: 12, weight: 500, color: "#20123A" }),
    text(`ffx_recent_domain_${i}`, "Domain", domain, 346, 602 + i * 58, 280, 16, { size: 9, color: "#77778A" }),
    text(`ffx_recent_time_${i}`, "Time", time, 706, 582 + i * 58, 70, 22, { size: 9, color: "#8A8A96", align: "right" }),
  ]).flat(),

  rect("ffx_privacy", "Privacy panel", 824, 486, 336, 152, { radius: 12, fill: solid("#20123A") }),
  text("ffx_privacy_t", "Title", "Tracking protection", 848, 508, 240, 22, { size: 14, weight: 600, color: "#FFFFFF" }),
  text("ffx_privacy_v", "Value", "1,248", 848, 540, 160, 38, { size: 30, weight: 700, color: "#FFFFFF", letterSpacing: -0.8 }),
  text("ffx_privacy_b", "Body", "trackers blocked this week", 848, 578, 230, 18, { size: 10, color: "#C9C2D6" }),
  rect("ffx_privacy_track", "Toggle track", 1064, 538, 56, 28, { radius: 14, fill: solid("#0060DF") }),
  ellipse("ffx_privacy_knob", "Toggle knob", 1094, 542, 20, 20, { fill: solid("#FFFFFF") }),
  text("ffx_privacy_status", "Status", "Enhanced", 1064, 574, 64, 16, { size: 9, weight: 600, color: "#8CB4FF", align: "right" }),

  rect("ffx_pocket", "Recommended", 824, 654, 336, 158, { radius: 12, fill: solid("#FFFFFF"), stroke: solid("#E0E0E6") }),
  text("ffx_pocket_t", "Title", "Recommended by Pocket", 848, 676, 260, 22, { size: 14, weight: 700, color: "#20123A" }),
  text("ffx_pocket_b", "Article", "The quiet craft of designing for focus", 848, 706, 280, 34, { size: 12, weight: 500, color: "#20123A", lineHeight: 1.35 }),
  text("ffx_pocket_m", "Meta", "8 min read · Pocket", 848, 748, 240, 16, { size: 9, color: "#77778A" }),
  text("ffx_pocket_2", "Article", "Why local-first tools feel faster", 848, 772, 280, 18, { size: 10, color: "#0060DF" }),

  text("ffx_footer", "Footer", "Firefox Photon · privacy by default", 280, 850, 500, 18, { size: 10, color: "#8A8A96" }),
  text("ffx_footer_2", "Footer", "Mozilla design language", 1120, 850, 40, 18, { size: 10, color: "#8A8A96", align: "right" }),
]);

const ffxFound = foundations("ffx", "Firefox Photon", "Mozilla Photon colors, generous radii, calm surfaces and privacy-first accents.", [
  ["Primary", "#0060DF"], ["Accent", "#FF7139"], ["Ink", "#20123A"], ["Success", "#058B00"], ["Surface", "#FFFFFF"], ["Border", "#E0E0E6"],
], { bg: "#F9F9FB", surface: "#FFFFFF", text: "#20123A", muted: "#5B5B66", primary: "#0060DF", onPrimary: "#FFFFFF", border: "#E0E0E6", chip: "#E7F0FF", radius: 8, family: "Inter Variable" });

const ffxComponents = componentBoard("ffxc", "Firefox Photon", {
  bg: "#F9F9FB", surface: "#FFFFFF", text: "#20123A", muted: "#5B5B66", primary: "#0060DF", onPrimary: "#FFFFFF", border: "#E0E0E6", chip: "#E7F0FF", danger: "#D70022", radius: 8, family: "Inter Variable",
});
const firefoxDoc = {
  pages: [page("ffx_page", "New tab", [ffxHome]), page("ffx_found_page", "Foundations", [ffxFound]), page("ffx_components_page", "Components", [ffxComponents])],
  tombstones: {},
};

/* ------------------------------------------------------------------ */
/*  WeChat                                                             */
/* ------------------------------------------------------------------ */

const wxHome = frame("wx_home", "WeChat · Chats", 0, 0, 390, 844, { fill: solid("#EDEDED") }, [
  ...statusBar("wx", false),
  rect("wx_header", "Header", 0, 44, 390, 56, { fill: solid("#EDEDED") }),
  text("wx_title", "Title", "微信", 16, 50, 100, 44, { size: 20, weight: 600, color: "#191919", valign: "middle", family: "PingFang SC" }),
  text("wx_add", "Icon", "+", 316, 50, 28, 44, { size: 22, color: "#191919", align: "center", valign: "middle", family: "PingFang SC" }),
  text("wx_search_icon", "Icon", "⌕", 352, 50, 28, 44, { size: 19, color: "#191919", align: "center", valign: "middle", family: "PingFang SC" }),
  rect("wx_search", "Search", 12, 108, 366, 36, { radius: 6, fill: solid("#FFFFFF") }),
  text("wx_search_t", "Search placeholder", "搜索", 58, 108, 280, 36, { size: 13, color: "#888888", valign: "middle", family: "PingFang SC" }),
  text("wx_search_glyph", "Search glyph", "⌕", 28, 108, 24, 36, { size: 17, color: "#888888", align: "center", valign: "middle", family: "PingFang SC" }),
  ...[
    ["文件传输助手", "设计稿已更新", "10:24", "#07C160", 0],
    ["设计团队", "Maya: 新版组件库已发布", "10:18", "#5B8FF9", 3],
    ["林小满", "[图片]", "09:52", "#F6BD16", 0],
    ["产品周会", "明天 14:00 · 会议室 A", "昨天", "#7262FD", 1],
    ["微信团队", "欢迎使用微信", "周一", "#07C160", 0],
  ].map(([name, preview, time, color, unread], i) =>
    dataRow(`wx_chat_${i}`, 158 + i * 72, String(name), String(preview), String(time), String(color), Number(unread)),
  ).flat(),
  rect("wx_tabbar", "Tab bar", 0, 774, 390, 70, { fill: solid("#F7F7F7"), stroke: solid("#DADADA") }),
  ...["微信", "通讯录", "发现", "我"].map((label, i) =>
    text(`wx_tab_${i}`, "Tab", label, 20 + i * 96, 790, 40, 38, { size: 11, weight: i === 0 ? 600 : 400, color: i === 0 ? "#07C160" : "#7A7A7A", align: "center", valign: "middle", family: "PingFang SC" }),
  ),
  text("wx_tab_icon_0", "Tab icon", "●", 20, 776, 40, 16, { size: 9, color: "#07C160", align: "center", family: "PingFang SC" }),
  text("wx_tab_icon_1", "Tab icon", "○", 116, 776, 40, 16, { size: 9, color: "#7A7A7A", align: "center", family: "PingFang SC" }),
  text("wx_tab_icon_2", "Tab icon", "◈", 212, 776, 40, 16, { size: 9, color: "#7A7A7A", align: "center", family: "PingFang SC" }),
  text("wx_tab_icon_3", "Tab icon", "◎", 308, 776, 40, 16, { size: 9, color: "#7A7A7A", align: "center", family: "PingFang SC" }),
]);

function dataRow(id, y, name, preview, time, color, unread) {
  return [
    rect(`${id}_bg`, "Chat row", 0, y, 390, 72, { fill: solid("#FFFFFF") }),
    rect(`${id}_avatar`, "Avatar", 16, y + 12, 48, 48, { radius: 6, fill: solid(color) }),
    text(`${id}_glyph`, "Avatar glyph", name.slice(0, 1), 16, y + 12, 48, 48, { size: 17, weight: 600, color: "#FFFFFF", align: "center", valign: "middle", family: "PingFang SC" }),
    text(`${id}_name`, "Chat name", name, 76, y + 13, 210, 20, { size: 15, weight: 500, color: "#191919", family: "PingFang SC" }),
    text(`${id}_preview`, "Preview", preview, 76, y + 37, 240, 18, { size: 12, color: "#888888", family: "PingFang SC" }),
    text(`${id}_time`, "Time", time, 310, y + 14, 62, 16, { size: 10, color: "#9A9A9A", align: "right", family: "PingFang SC" }),
    ...(unread > 0 ? [
      rect(`${id}_badge`, "Unread", 350, y + 37, 18, 18, { radius: 9, fill: solid("#FA5151") }),
      text(`${id}_badge_t`, "Unread count", String(unread), 350, y + 37, 18, 18, { size: 9, weight: 600, color: "#FFFFFF", align: "center", valign: "middle", family: "PingFang SC" }),
    ] : []),
  ];
}

const wxFound = foundations("wx", "WeChat", "WeChat green, chat-list density, red notification badges and a calm mobile surface.", [
  ["WeChat green", "#07C160"], ["Link blue", "#576B95"], ["Alert red", "#FA5151"], ["Warning", "#FA9D3B"], ["Ink", "#191919"], ["Muted", "#888888"],
], { bg: "#EDEDED", surface: "#FFFFFF", text: "#191919", muted: "#888888", primary: "#07C160", onPrimary: "#FFFFFF", border: "#DADADA", chip: "#E8F8EF", radius: 6, family: "PingFang SC" });

const wxComponents = componentBoard("wxc", "WeChat", {
  bg: "#EDEDED", surface: "#FFFFFF", text: "#191919", muted: "#888888", primary: "#07C160", onPrimary: "#FFFFFF", border: "#DADADA", chip: "#E8F8EF", danger: "#FA5151", radius: 6, family: "PingFang SC",
});
const wechatDoc = {
  pages: [page("wx_page", "Chats", [wxHome]), page("wx_found_page", "Foundations", [wxFound]), page("wx_components_page", "Components", [wxComponents])],
  tombstones: {},
};

/* ------------------------------------------------------------------ */
/*  shadcn/ui                                                          */
/* ------------------------------------------------------------------ */

const scHome = frame("sc_home", "shadcn/ui · Dashboard", 0, 0, 1440, 900, { fill: solid("#FAFAFA") }, [
  rect("sc_sidebar", "Sidebar", 0, 0, 240, 900, { fill: solid("#FFFFFF"), stroke: solid("#E4E4E7") }),
  image("sc_logo", "shadcn logo", "/brand/shadcn.svg", 24, 22, 28, 28, { radius: 7 }),
  text("sc_brand", "Brand", "shadcn/ui", 62, 24, 140, 24, { size: 14, weight: 700, color: "#18181B", letterSpacing: -0.3 }),
  text("sc_workspace", "Workspace", "Acme workspace", 16, 82, 190, 30, { size: 11, color: "#71717A", valign: "middle" }),
  ...["Overview", "Projects", "Components", "Settings"].map((label, i) => [
    ...(i === 0 ? [rect(`sc_nav_active_${i}`, "Active nav", 12, 122 + i * 40, 216, 34, { radius: 8, fill: solid("#F4F4F5") })] : []),
    text(`sc_nav_${i}`, "Nav", label, 28, 122 + i * 40, 180, 34, { size: 12, weight: i === 0 ? 600 : 400, color: i === 0 ? "#18181B" : "#71717A", valign: "middle" }),
  ]).flat(),
  text("sc_side_footer", "Footer", "v0.1.0", 24, 850, 120, 18, { size: 10, color: "#A1A1AA" }),

  rect("sc_header", "Header", 240, 0, 1200, 64, { fill: solid("#FFFFFF"), stroke: solid("#E4E4E7") }),
  text("sc_page", "Page", "Overview", 272, 18, 240, 28, { size: 16, weight: 600, color: "#18181B", valign: "middle" }),
  rect("sc_header_search", "Search", 848, 16, 280, 32, { radius: 7, fill: solid("#FAFAFA"), stroke: solid("#E4E4E7") }),
  text("sc_header_search_t", "Search", "Search…", 864, 16, 240, 32, { size: 12, color: "#A1A1AA", valign: "middle" }),
  ellipse("sc_avatar", "Avatar", 1384, 16, 32, 32, { fill: solid("#18181B") }),
  text("sc_avatar_t", "Avatar", "M", 1384, 16, 32, 32, { size: 11, weight: 600, color: "#FFFFFF", align: "center", valign: "middle" }),

  text("sc_title", "Title", "Dashboard", 272, 96, 400, 40, { size: 30, weight: 700, color: "#18181B", letterSpacing: -0.8 }),
  text("sc_sub", "Subtitle", "A minimal, accessible system for product interfaces.", 272, 140, 620, 22, { size: 13, color: "#71717A" }),
  rect("sc_primary", "Primary button", 1244, 100, 164, 36, { radius: 8, fill: solid("#18181B") }),
  text("sc_primary_t", "Label", "New project", 1244, 100, 164, 36, { size: 12, weight: 600, color: "#FFFFFF", align: "center", valign: "middle" }),
  ...[
    ["Active projects", "24", "+3 this week"],
    ["Components", "128", "12 new"],
    ["Contributors", "32", "+4 this month"],
    ["Open issues", "7", "2 critical"],
  ].map(([label, value, meta], i) => [
    rect(`sc_stat_${i}`, "Stat card", 272 + i * 284, 194, 264, 116, { radius: 10, fill: solid("#FFFFFF"), stroke: solid("#E4E4E7") }),
    text(`sc_stat_l_${i}`, "Label", label, 292 + i * 284, 212, 220, 18, { size: 11, color: "#71717A" }),
    text(`sc_stat_v_${i}`, "Value", value, 292 + i * 284, 236, 220, 38, { size: 28, weight: 700, color: "#18181B", letterSpacing: -0.5 }),
    text(`sc_stat_m_${i}`, "Meta", meta, 292 + i * 284, 278, 220, 18, { size: 10, color: i === 3 ? "#EF4444" : "#71717A" }),
  ]).flat(),

  rect("sc_chart", "Chart card", 272, 340, 700, 250, { radius: 10, fill: solid("#FFFFFF"), stroke: solid("#E4E4E7") }),
  text("sc_chart_t", "Title", "Weekly activity", 292, 360, 300, 22, { size: 14, weight: 600, color: "#18181B" }),
  text("sc_chart_s", "Subtitle", "Design sessions across the workspace", 292, 384, 420, 18, { size: 10, color: "#71717A" }),
  ...[42, 68, 54, 86, 72, 96, 64].map((h, i) => [
    rect(`sc_bar_track_${i}`, "Bar track", 316 + i * 88, 428, 42, 120, { radius: 5, fill: solid("#F4F4F5") }),
    rect(`sc_bar_${i}`, "Bar", 316 + i * 88, 548 - h, 42, h, { radius: 5, fill: solid(i === 5 ? "#18181B" : "#A1A1AA") }),
    text(`sc_day_${i}`, "Day", ["M", "T", "W", "T", "F", "S", "S"][i], 316 + i * 88, 552, 42, 16, { size: 9, color: "#A1A1AA", align: "center" }),
  ]).flat(),

  rect("sc_activity", "Activity card", 996, 340, 412, 460, { radius: 10, fill: solid("#FFFFFF"), stroke: solid("#E4E4E7") }),
  text("sc_activity_t", "Title", "Recent activity", 1016, 360, 260, 22, { size: 14, weight: 600, color: "#18181B" }),
  ...[
    ["Maya Chen", "Published a component", "2m"],
    ["Noah Patel", "Updated tokens", "18m"],
    ["Lena Park", "Opened an issue", "1h"],
    ["Owen Diaz", "Joined the project", "3h"],
    ["Iris Kim", "Merged a branch", "5h"],
  ].map(([name, action, time], i) => [
    ellipse(`sc_act_avatar_${i}`, "Avatar", 1016, 402 + i * 62, 28, 28, { fill: solid(i % 2 ? "#E4E4E7" : "#18181B") }),
    text(`sc_act_n_${i}`, "Name", name, 1054, 400 + i * 62, 180, 18, { size: 11, weight: 600, color: "#18181B" }),
    text(`sc_act_a_${i}`, "Action", action, 1054, 418 + i * 62, 220, 16, { size: 10, color: "#71717A" }),
    text(`sc_act_t_${i}`, "Time", time, 1328, 400 + i * 62, 56, 16, { size: 9, color: "#A1A1AA", align: "right" }),
    ...(i > 0 ? [rect(`sc_act_sep_${i}`, "Separator", 1016, 452 + i * 62, 372, 1, { fill: solid("#F4F4F5") })] : []),
  ]).flat(),

  rect("sc_table", "Table card", 272, 614, 1136, 238, { radius: 10, fill: solid("#FFFFFF"), stroke: solid("#E4E4E7") }),
  text("sc_table_t", "Title", "Projects", 292, 634, 240, 22, { size: 14, weight: 600, color: "#18181B" }),
  rect("sc_table_head", "Table head", 272, 672, 1136, 34, { fill: solid("#FAFAFA"), stroke: solid("#F4F4F5") }),
  ...["Project", "Owner", "Status", "Updated"].map((h, i) => text(`sc_th_${i}`, "Header", h, 292 + [0, 560, 820, 1060][i], 680, 160, 20, { size: 10, weight: 600, color: "#71717A" })),
  ...[
    ["Aurora design system", "Maya Chen", "Active", "2m ago"],
    ["Mobile checkout", "Noah Patel", "Review", "18m ago"],
    ["Billing migration", "Lena Park", "Active", "1h ago"],
  ].map(([name, owner, status, updated], i) => [
    ...(i > 0 ? [rect(`sc_tr_sep_${i}`, "Separator", 292, 706 + i * 42, 1096, 1, { fill: solid("#F4F4F5") })] : []),
    text(`sc_tr_name_${i}`, "Project", name, 292, 714 + i * 42, 300, 28, { size: 11, weight: 500, color: "#18181B", valign: "middle" }),
    text(`sc_tr_owner_${i}`, "Owner", owner, 852, 714 + i * 42, 180, 28, { size: 10, color: "#71717A", valign: "middle" }),
    rect(`sc_tr_badge_${i}`, "Badge", 1112, 722 + i * 42, 58, 20, { radius: 999, fill: solid(status === "Active" ? "#F4F4F5" : "#FEF3C7") }),
    text(`sc_tr_status_${i}`, "Status", status, 1112, 722 + i * 42, 58, 20, { size: 8, weight: 600, color: status === "Active" ? "#18181B" : "#92400E", align: "center", valign: "middle" }),
    text(`sc_tr_upd_${i}`, "Updated", updated, 1192, 714 + i * 42, 80, 28, { size: 9, color: "#A1A1AA", align: "right", valign: "middle" }),
  ]).flat(),
]);

const scFound = foundations("sc", "shadcn/ui", "Neutral zinc palette, border-first surfaces, 10px radii and accessible type.", [
  ["Primary", "#18181B"], ["Muted", "#71717A"], ["Border", "#E4E4E7"], ["Surface", "#FFFFFF"], ["Accent", "#F4F4F5"], ["Danger", "#EF4444"],
], { bg: "#FAFAFA", surface: "#FFFFFF", text: "#18181B", muted: "#71717A", primary: "#18181B", onPrimary: "#FFFFFF", border: "#E4E4E7", chip: "#F4F4F5", radius: 10, family: "Inter Variable" });

const scComponents = componentBoard("scc", "shadcn/ui", {
  bg: "#FAFAFA", surface: "#FFFFFF", text: "#18181B", muted: "#71717A", primary: "#18181B", onPrimary: "#FFFFFF", border: "#E4E4E7", chip: "#F4F4F5", danger: "#EF4444", radius: 10, family: "Inter Variable",
});
const shadcnDoc = {
  pages: [page("sc_page", "Overview", [scHome]), page("sc_found_page", "Foundations", [scFound]), page("sc_components_page", "Components", [scComponents])],
  tombstones: {},
};

/* ------------------------------------------------------------------ */
/*  Sigma Originals — own visual language                             */
/*  Paper / Ink / Cobalt / Acid / Coral, hard borders, offset shadows */
/* ------------------------------------------------------------------ */

const SIG = {
  paper: "#F2EEE3",
  paper2: "#E9E3D4",
  ink: "#111111",
  cobalt: "#2F4BFF",
  acid: "#D8FF3E",
  coral: "#FF5A36",
  muted: "#6F6A5F",
  white: "#FFFFFF",
};

const sigmaOpts = {
  bg: SIG.paper, surface: SIG.white, text: SIG.ink, muted: SIG.muted,
  primary: SIG.cobalt, onPrimary: "#FFFFFF", border: SIG.ink,
  chip: SIG.acid, danger: SIG.coral, radius: 0, family: "Inter Variable",
};

const signalScreens = frame("sig_screens", "Signal · Screens", 0, 0, 390, 844, { fill: solid(SIG.paper), radius: 0 }, [
  ...statusBar("sig", false),
  text("sig_brand", "Brand", "SIGNAL", 24, 58, 160, 22, { size: 13, weight: 800, color: SIG.ink, letterSpacing: 2.5 }),
  text("sig_index", "Index", "01 / 03", 300, 58, 66, 18, { size: 10, weight: 600, color: SIG.muted, align: "right", letterSpacing: 0.8 }),
  text("sig_eyebrow", "Eyebrow", "A QUIETER WAY TO STAY AWAKE", 24, 130, 330, 18, { size: 9, weight: 700, color: SIG.cobalt, letterSpacing: 1.6 }),
  text("sig_headline", "Headline", "Less feed.\nMore signal.", 24, 158, 350, 128, { size: 50, weight: 800, color: SIG.ink, lineHeight: 0.96, letterSpacing: -2.4 }),
  rect("sig_rule", "Rule", 24, 306, 342, 2, { fill: solid(SIG.ink), radius: 0 }),
  text("sig_body", "Body", "A reading app for people who want fewer tabs and better questions. No infinite scroll. No algorithm. Just five things worth your attention.", 24, 326, 310, 76, { size: 13, weight: 400, color: SIG.muted, lineHeight: 1.6 }),

  rect("sig_card", "Signal card", 24, 430, 342, 236, { fill: solid(SIG.cobalt), stroke: solid(SIG.ink), strokeWidth: 2, radius: 0, shadow: shadow(9, 9, 0, 0, SIG.ink) }),
  ellipse("sig_sun", "Acid sun", 242, 456, 96, 96, { fill: solid(SIG.acid), stroke: solid(SIG.ink), strokeWidth: 2 }),
  text("sig_card_no", "Card number", "S/01", 42, 452, 80, 20, { size: 10, weight: 700, color: "#FFFFFF", letterSpacing: 1.2 }),
  text("sig_card_title", "Card title", "The cost of\nattention.", 42, 494, 190, 82, { size: 30, weight: 800, color: "#FFFFFF", lineHeight: 1, letterSpacing: -1 }),
  text("sig_card_meta", "Meta", "12 MIN READ · ESSAY", 42, 618, 220, 18, { size: 9, weight: 600, color: SIG.acid, letterSpacing: 1.2 }),

  text("sig_section", "Section", "TODAY’S FIVE", 24, 712, 200, 20, { size: 10, weight: 800, color: SIG.ink, letterSpacing: 1.4 }),
  ...[
    ["01", "The unreasonable effectiveness of walking", "6 min"],
    ["02", "A field guide to noticing", "9 min"],
    ["03", "What silence does to a room", "4 min"],
  ].map(([no, title, time], i) => [
    rect(`sig_row_sep_${i}`, "Separator", 24, 740 + i * 34, 342, 1, { fill: solid(SIG.ink, 0.25) }),
    text(`sig_row_no_${i}`, "Number", no, 24, 748 + i * 34, 28, 20, { size: 9, weight: 700, color: SIG.cobalt }),
    text(`sig_row_title_${i}`, "Title", title, 60, 748 + i * 34, 250, 20, { size: 11, weight: 500, color: SIG.ink }),
    text(`sig_row_time_${i}`, "Time", time, 312, 748 + i * 34, 54, 20, { size: 9, color: SIG.muted, align: "right" }),
  ]).flat().slice(0, 9),
]);

const signalArchive = frame("sig_archive", "Signal · Archive", 470, 0, 390, 844, { fill: solid(SIG.ink), radius: 0 }, [
  ...statusBar("sig2", true),
  text("sig2_brand", "Brand", "SIGNAL / ARCHIVE", 24, 58, 240, 22, { size: 12, weight: 800, color: SIG.paper, letterSpacing: 2 }),
  text("sig2_count", "Count", "137", 24, 120, 200, 100, { size: 92, weight: 800, color: SIG.acid, lineHeight: 1, letterSpacing: -5 }),
  text("sig2_label", "Label", "PIECES STILL WORTH READING", 28, 218, 300, 18, { size: 9, weight: 700, color: SIG.paper, letterSpacing: 1.4 }),
  rect("sig2_rule", "Rule", 24, 258, 342, 2, { fill: solid(SIG.paper) }),
  ...["Design", "Attention", "Tools", "Cities", "Systems"].map((label, i) => [
    rect(`sig2_tag_${i}`, "Tag", 24 + (i % 3) * 112, 286 + Math.floor(i / 3) * 44, 100, 30, { fill: solid(i === 1 ? SIG.acid : "transparent"), stroke: solid(SIG.paper), strokeWidth: 1, radius: 0 }),
    text(`sig2_tag_t_${i}`, "Tag", label, 24 + (i % 3) * 112, 286 + Math.floor(i / 3) * 44, 100, 30, { size: 9, weight: 600, color: i === 1 ? SIG.ink : SIG.paper, align: "center", valign: "middle" }),
  ]).flat(),
  ...[
    ["APR 12", "The shape of a good question", "Essay"],
    ["APR 08", "Rooms that make you stay", "Field note"],
    ["MAR 30", "Against the infinite scroll", "Essay"],
    ["MAR 21", "A small case for slow tools", "Interview"],
  ].map(([date, title, kind], i) => [
    text(`sig2_date_${i}`, "Date", date, 24, 420 + i * 88, 70, 18, { size: 9, weight: 600, color: SIG.muted, letterSpacing: 0.8 }),
    text(`sig2_title_${i}`, "Title", title, 24, 440 + i * 88, 320, 26, { size: 18, weight: 600, color: SIG.paper, letterSpacing: -0.4 }),
    text(`sig2_kind_${i}`, "Kind", kind, 24, 468 + i * 88, 200, 18, { size: 9, color: SIG.acid, letterSpacing: 0.6 }),
    rect(`sig2_sep_${i}`, "Separator", 24, 496 + i * 88, 342, 1, { fill: solid(SIG.paper, 0.25) }),
  ]).flat(),
  rect("sig2_cta", "Start reading", 24, 770, 342, 50, { fill: solid(SIG.acid), stroke: solid(SIG.paper), strokeWidth: 1, radius: 0 }),
  text("sig2_cta_t", "Start reading", "START READING →", 24, 770, 342, 50, { size: 11, weight: 800, color: SIG.ink, align: "center", valign: "middle", letterSpacing: 1.2 }),
]);

const signalFound = foundations("sig", "Sigma Signal", "Our own language: paper, ink, cobalt and acid. Hard edges, no gradients, no decoration without purpose.", [
  ["Paper", SIG.paper], ["Ink", SIG.ink], ["Cobalt", SIG.cobalt], ["Acid", SIG.acid], ["Coral", SIG.coral], ["Muted", SIG.muted],
], sigmaOpts);
const signalComponents = componentBoard("sig", "Sigma Signal", sigmaOpts);

const signalDoc = {
  pages: [page("sig_page", "Screens", [signalScreens, signalArchive]), page("sig_found", "Foundations", [signalFound]), page("sig_components", "Components", [signalComponents])],
  tombstones: {},
};

/* ------------------------------------------------------------------ */
/*  Field Notes — editorial website                                   */
/* ------------------------------------------------------------------ */

const fieldNotes = frame("fn_home", "Field Notes · Home", 0, 0, 1440, 1024, { fill: solid(SIG.paper), radius: 0 }, [
  rect("fn_top", "Top rule", 0, 0, 1440, 2, { fill: solid(SIG.ink) }),
  text("fn_brand", "Brand", "FIELD NOTES", 48, 26, 220, 24, { size: 14, weight: 800, color: SIG.ink, letterSpacing: 2.4 }),
  ...["Index", "Essays", "Objects", "About"].map((label, i) => text(`fn_nav_${i}`, "Nav", label, 760 + i * 100, 28, 86, 20, { size: 11, weight: 600, color: SIG.ink, letterSpacing: 0.6 })),
  rect("fn_sub", "Subscribe", 1188, 22, 204, 32, { fill: solid(SIG.ink), radius: 0 }),
  text("fn_sub_t", "Subscribe", "SUBSCRIBE →", 1188, 22, 204, 32, { size: 10, weight: 700, color: SIG.paper, align: "center", valign: "middle", letterSpacing: 1.2 }),

  text("fn_kicker", "Kicker", "A JOURNAL OF USEFUL OBSERVATIONS · ISSUE 07", 48, 108, 620, 18, { size: 10, weight: 700, color: SIG.cobalt, letterSpacing: 1.2 }),
  text("fn_h1", "Headline", "MAKE\nNOISE\nTHAT\nMATTERS.", 48, 136, 760, 430, { size: 112, weight: 800, color: SIG.ink, lineHeight: 0.82, letterSpacing: -7 }),
  rect("fn_acid", "Acid block", 820, 146, 180, 180, { fill: solid(SIG.acid), stroke: solid(SIG.ink), strokeWidth: 2, radius: 0, shadow: shadow(10, 10, 0, 0, SIG.ink) }),
  ellipse("fn_circle", "Circle", 890, 200, 100, 100, { fill: solid(SIG.cobalt), stroke: solid(SIG.ink), strokeWidth: 2 }),
  text("fn_circle_t", "Circle text", "07", 890, 200, 100, 100, { size: 36, weight: 800, color: SIG.acid, align: "center", valign: "middle", letterSpacing: -1 }),
  text("fn_intro", "Intro", "We collect what survives the feed: essays, field notes, objects and small systems for paying attention.", 820, 356, 520, 80, { size: 18, weight: 400, color: SIG.ink, lineHeight: 1.45 }),
  rect("fn_cta", "Read issue", 820, 460, 220, 48, { fill: solid(SIG.ink), radius: 0 }),
  text("fn_cta_t", "Read issue", "READ ISSUE 07 →", 820, 460, 220, 48, { size: 11, weight: 700, color: SIG.paper, align: "center", valign: "middle", letterSpacing: 1 }),
  rect("fn_rule", "Rule", 48, 606, 1344, 2, { fill: solid(SIG.ink) }),
  text("fn_feat_label", "Label", "FROM THE CURRENT ISSUE", 48, 628, 300, 18, { size: 10, weight: 700, color: SIG.muted, letterSpacing: 1.2 }),

  ...[
    ["01", "The unreasonable\neffectiveness of walking", "Essay · 12 min", SIG.cobalt],
    ["02", "A field guide\nto noticing", "Field note · 9 min", SIG.coral],
    ["03", "Rooms that\nmake you stay", "Interview · 18 min", SIG.acid],
  ].map(([no, title, meta, color], i) => [
    rect(`fn_card_${i}`, "Story card", 48 + i * 456, 668, 432, 300, { fill: solid(SIG.paper2), stroke: solid(SIG.ink), strokeWidth: 2, radius: 0, shadow: shadow(8, 8, 0, 0, SIG.ink) }),
    rect(`fn_card_top_${i}`, "Color bar", 48 + i * 456, 668, 432, 16, { fill: solid(color as string), stroke: solid(SIG.ink), strokeWidth: 0, radius: 0 }),
    text(`fn_card_no_${i}`, "Number", no as string, 66 + i * 456, 700, 60, 20, { size: 10, weight: 700, color: SIG.ink, letterSpacing: 1 }),
    text(`fn_card_title_${i}`, "Title", title as string, 66 + i * 456, 732, 380, 100, { size: 28, weight: 700, color: SIG.ink, lineHeight: 1.05, letterSpacing: -0.8 }),
    text(`fn_card_meta_${i}`, "Meta", meta as string, 66 + i * 456, 916, 380, 20, { size: 9, weight: 600, color: SIG.muted, letterSpacing: 0.8 }),
  ]).flat(),

  text("fn_footer", "Footer", "FIELD NOTES / ISSUE 07 / 2026", 48, 1000, 600, 16, { size: 9, weight: 600, color: SIG.muted, letterSpacing: 1 }),
  text("fn_footer2", "Footer", "PRINTED IN THE BROWSER", 1170, 1000, 220, 16, { size: 9, weight: 600, color: SIG.muted, letterSpacing: 1, align: "right" }),
]);

const fieldNotesSystem = foundations("fn", "Field Notes", "Editorial rules: oversized type, hard borders, paper stock and a single acid highlight.", [
  ["Paper", SIG.paper], ["Paper 2", SIG.paper2], ["Ink", SIG.ink], ["Cobalt", SIG.cobalt], ["Acid", SIG.acid], ["Coral", SIG.coral],
], sigmaOpts);
const fieldNotesComponents = componentBoard("fn", "Field Notes", sigmaOpts);
const fieldNotesDoc = {
  pages: [page("fn_page", "Home", [fieldNotes]), page("fn_found", "Foundations", [fieldNotesSystem]), page("fn_components", "Components", [fieldNotesComponents])],
  tombstones: {},
};

/* ------------------------------------------------------------------ */
/*  Atlas — dark operational dashboard                                */
/* ------------------------------------------------------------------ */

const atlas = frame("atlas_home", "Atlas · Operations", 0, 0, 1440, 900, { fill: solid("#0B0D0C"), radius: 0 }, [
  rect("atlas_top", "Top bar", 0, 0, 1440, 56, { fill: solid("#0B0D0C"), stroke: solid("#2A2E2A") }),
  text("atlas_brand", "Brand", "ATLAS", 24, 18, 120, 20, { size: 12, weight: 800, color: SIG.acid, letterSpacing: 2.4 }),
  text("atlas_mode", "Mode", "OPERATIONS / LIVE", 148, 20, 220, 16, { size: 9, weight: 600, color: "#8A908A", letterSpacing: 1.1 }),
  ...["Overview", "Fleet", "Incidents", "Logs"].map((label, i) => text(`atlas_nav_${i}`, "Nav", label, 840 + i * 104, 20, 88, 16, { size: 10, weight: 600, color: i === 0 ? SIG.acid : "#8A908A", letterSpacing: 0.6 })),
  text("atlas_clock", "Clock", "09:41:07 UTC", 1280, 20, 136, 16, { size: 9, weight: 600, color: "#8A908A", letterSpacing: 1, align: "right" }),

  rect("atlas_side", "Sidebar", 0, 56, 200, 844, { fill: solid("#0F1210"), stroke: solid("#2A2E2A") }),
  text("atlas_side_label", "Label", "CONTROL", 20, 80, 160, 16, { size: 9, weight: 700, color: "#5F665F", letterSpacing: 1.2 }),
  ...["OPS BOARD", "INCIDENTS", "CAPACITY", "AUDIT"].map((label, i) => [
    ...(i === 0 ? [rect(`atlas_active_${i}`, "Active", 0, 108 + i * 44, 200, 36, { fill: solid(SIG.acid) })] : []),
    text(`atlas_nav2_${i}`, "Menu", label, 20, 108 + i * 44, 170, 36, { size: 10, weight: 700, color: i === 0 ? SIG.ink : "#8A908A", valign: "middle", letterSpacing: 0.8 }),
  ]).flat(),
  text("atlas_side_footer", "Footer", "SIGMA ORIGINALS\nBUILD 07", 20, 820, 150, 40, { size: 8, weight: 600, color: "#5F665F", letterSpacing: 1, lineHeight: 1.6 }),

  text("atlas_kicker", "Kicker", "SYSTEM HEALTH / 24H", 232, 84, 300, 18, { size: 9, weight: 700, color: "#8A908A", letterSpacing: 1.2 }),
  text("atlas_title", "Title", "Everything\nstill running.", 232, 108, 520, 118, { size: 54, weight: 800, color: SIG.paper, lineHeight: 0.95, letterSpacing: -2.2 }),
  rect("atlas_status", "Status", 1136, 90, 272, 42, { fill: solid(SIG.acid), radius: 0 }),
  text("atlas_status_t", "Status", "● ALL SYSTEMS NOMINAL", 1136, 90, 272, 42, { size: 9, weight: 800, color: SIG.ink, align: "center", valign: "middle", letterSpacing: 1 }),

  ...[
    ["THROUGHPUT", "48.2k", "req/min", "+12.4%"],
    ["P95 LATENCY", "84ms", "p95", "−8.1%"],
    ["ERROR RATE", "0.12%", "24h", "−0.04"],
    ["OPEN INCIDENTS", "02", "active", "1 critical"],
  ].map(([label, value, meta, delta], i) => [
    rect(`atlas_metric_${i}`, "Metric", 232 + i * 288, 260, 272, 128, { fill: solid("#0F1210"), stroke: solid("#2A2E2A"), radius: 0 }),
    text(`atlas_metric_l_${i}`, "Label", label, 248 + i * 288, 276, 240, 16, { size: 8, weight: 700, color: "#8A908A", letterSpacing: 1 }),
    text(`atlas_metric_v_${i}`, "Value", value, 248 + i * 288, 300, 240, 44, { size: 32, weight: 700, color: i === 3 ? SIG.coral : SIG.paper, letterSpacing: -1 }),
    text(`atlas_metric_m_${i}`, "Meta", meta, 248 + i * 288, 348, 90, 16, { size: 8, color: "#5F665F", letterSpacing: 0.6 }),
    text(`atlas_metric_d_${i}`, "Delta", delta, 390 + i * 288, 348, 90, 16, { size: 8, weight: 700, color: i === 3 ? SIG.coral : SIG.acid, align: "right" }),
  ]).flat(),

  rect("atlas_chart", "Chart panel", 232, 420, 680, 300, { fill: solid("#0F1210"), stroke: solid("#2A2E2A") }),
  text("atlas_chart_t", "Title", "TRAFFIC / LAST 24H", 252, 438, 300, 16, { size: 9, weight: 700, color: "#8A908A", letterSpacing: 1 }),
  ...[28, 42, 36, 58, 50, 70, 62, 84, 74, 92, 68, 96, 82, 100, 76, 88].map((h, i) =>
    rect(`atlas_bar_${i}`, "Bar", 256 + i * 39, 666 - h * 1.6, 24, h * 1.6, { fill: solid(i % 4 === 0 ? SIG.acid : "#2F4BFF"), radius: 0 }),
  ),
  ...[["00", 256], ["06", 512], ["12", 768], ["18", 880]].map(([label, x], i) =>
    text(`atlas_axis_${i}`, "Axis", label as string, x as number, 684, 40, 14, { size: 8, color: "#5F665F" }),
  ),

  rect("atlas_table", "Incidents", 936, 420, 472, 300, { fill: solid("#0F1210"), stroke: solid("#2A2E2A") }),
  text("atlas_table_t", "Title", "INCIDENT QUEUE", 956, 438, 280, 16, { size: 9, weight: 700, color: "#8A908A", letterSpacing: 1 }),
  ...[
    ["P1", "edge-03 packet loss", "MITIGATING"],
    ["P2", "billing worker backlog", "OPEN"],
    ["P3", "search index lag", "MONITOR"],
  ].map(([p, title, status], i) => [
    text(`atlas_inc_p_${i}`, "Priority", p, 956, 476 + i * 58, 28, 18, { size: 9, weight: 800, color: p === "P1" ? SIG.coral : SIG.acid }),
    text(`atlas_inc_t_${i}`, "Title", title, 992, 474 + i * 58, 300, 20, { size: 11, weight: 500, color: SIG.paper }),
    text(`atlas_inc_s_${i}`, "Status", status, 992, 494 + i * 58, 300, 14, { size: 8, weight: 600, color: "#8A908A", letterSpacing: 0.8 }),
    rect(`atlas_inc_sep_${i}`, "Separator", 956, 520 + i * 58, 432, 1, { fill: solid("#2A2E2A") }),
  ]).flat(),

  rect("atlas_footer", "Footer", 232, 740, 1176, 120, { fill: solid(SIG.paper), stroke: solid(SIG.ink), strokeWidth: 2, shadow: shadow(8, 8, 0, 0, SIG.acid), radius: 0 }),
  text("atlas_footer_t", "Footer title", "NO DASHBOARD WITHOUT A DECISION.", 252, 760, 720, 32, { size: 24, weight: 800, color: SIG.ink, letterSpacing: -0.8 }),
  text("atlas_footer_b", "Footer body", "Every panel answers a question. Every alert has an owner. Every number has a timestamp.", 252, 800, 820, 36, { size: 11, color: SIG.muted, lineHeight: 1.5 }),
  text("atlas_footer_tag", "Footer tag", "SIGMA / ATLAS", 1240, 760, 148, 16, { size: 8, weight: 700, color: SIG.cobalt, align: "right", letterSpacing: 1 }),
]);

const atlasFound = foundations("atlas", "Atlas", "Operational dark mode: ink panels, acid signals, cobalt data and zero decorative gradients.", [
  ["Ink", "#0B0D0C"], ["Panel", "#0F1210"], ["Acid", SIG.acid], ["Cobalt", SIG.cobalt], ["Paper", SIG.paper], ["Coral", SIG.coral],
], { bg: "#0B0D0C", surface: "#0F1210", text: SIG.paper, muted: "#8A908A", primary: SIG.acid, onPrimary: SIG.ink, border: "#2A2E2A", chip: "#1A1F1A", danger: SIG.coral, radius: 0, family: "Inter Variable" });
const atlasComponents = componentBoard("atlas", "Atlas", { bg: "#0B0D0C", surface: "#0F1210", text: SIG.paper, muted: "#8A908A", primary: SIG.acid, onPrimary: SIG.ink, border: "#2A2E2A", chip: "#1A1F1A", danger: SIG.coral, radius: 0, family: "Inter Variable" });
const atlasDoc = {
  pages: [page("atlas_page", "Operations", [atlas]), page("atlas_found", "Foundations", [atlasFound]), page("atlas_components", "Components", [atlasComponents])],
  tombstones: {},
};

/* ------------------------------------------------------------------ */

const outDir = path.resolve(process.cwd(), "../backend/internal/templates");
fs.mkdirSync(outDir, { recursive: true });

const templates = [
  {
    meta: {
      id: "material",
      name: "Material Design 3",
      description: "Material You color roles, Roboto type scale, expressive cards, FAB and navigation bar.",
      accent: "#6750A4",
      icon: "smartphone",
      logo: "/brand/google.svg",
    },
    doc: materialDoc,
  },
  {
    meta: {
      id: "ios",
      name: "Apple HIG",
      description: "iOS grouped settings, SF Pro typography, switches, tab bar and Human Interface colors.",
      accent: "#007AFF",
      icon: "smartphone",
      logo: "/brand/apple.svg",
    },
    doc: iosDoc,
  },
  {
    meta: {
      id: "fluent",
      name: "Microsoft Fluent 2",
      description: "Fluent command bar, navigation, metric cards and a data table with Segoe UI styling.",
      accent: "#0F6CBD",
      icon: "layout-dashboard",
      logo: "/brand/microsoft.svg",
    },
    doc: fluentDoc,
  },
  {
    meta: {
      id: "carbon",
      name: "IBM Carbon",
      description: "Carbon UI shell, side navigation, data table and productive IBM Plex Sans components.",
      accent: "#0F62FE",
      icon: "layout-dashboard",
      logo: "/brand/ibm.svg",
    },
    doc: carbonDoc,
  },
  {
    meta: {
      id: "ant",
      name: "Ant Design",
      description: "Alibaba Ant Group enterprise patterns, #1677FF primary, Chinese typography and data tables.",
      accent: "#1677FF",
      icon: "layout-dashboard",
      logo: "/brand/ant.svg",
    },
    doc: antDoc,
  },
  {
    meta: {
      id: "arco",
      name: "ByteDance Arco",
      description: "ByteDance Arco console patterns, #165DFF primary, compact 4px geometry and data-dense tables.",
      accent: "#165DFF",
      icon: "layout-dashboard",
      logo: "/brand/bytedance.svg",
    },
    doc: arcoDoc,
  },
  {
    meta: {
      id: "element",
      name: "Element Plus",
      description: "Eleme Element blue, classic admin sidebar, 4px controls and enterprise table patterns.",
      accent: "#409EFF",
      icon: "layout-dashboard",
      logo: "/brand/element.svg",
    },
    doc: elementDoc,
  },
  {
    meta: {
      id: "firefox",
      name: "Firefox Photon",
      description: "Mozilla Photon color, calm surfaces, privacy-first panels and Firefox new-tab patterns.",
      accent: "#0060DF",
      icon: "layout-dashboard",
      logo: "/brand/firefox.svg",
    },
    doc: firefoxDoc,
  },
  {
    meta: {
      id: "wechat",
      name: "WeChat",
      description: "WeChat mobile chat density, #07C160 green, notification badges and PingFang typography.",
      accent: "#07C160",
      icon: "smartphone",
      logo: "/brand/wechat.svg",
    },
    doc: wechatDoc,
  },
  {
    meta: {
      id: "shadcn",
      name: "shadcn/ui",
      description: "Neutral zinc palette, border-first surfaces, 10px radii and accessible Radix-style controls.",
      accent: "#18181B",
      icon: "component",
      logo: "/brand/shadcn.svg",
    },
    doc: shadcnDoc,
  },
];

for (const t of templates) {
  fs.writeFileSync(path.join(outDir, `${t.meta.id}.json`), JSON.stringify(t, null, 2));
  const nodes = t.doc.pages.reduce((n, p) => n + Object.keys(p.nodes).length, 0);
  console.log(`wrote ${t.meta.id}.json (${t.doc.pages.length} pages, ${nodes} layers)`);
}
