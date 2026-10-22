# Sigma → Figma plugin

This development plugin imports a Sigma JSON export into a Figma file while preserving frames, rectangles, ellipses, text, colors, gradients, radii, shadows, opacity, rotation and image URLs.

## Use

1. In Sigma, open a design → account menu → **Export Figma JSON**. You get a `.sigma.json` file.
2. In the Figma desktop app: **Plugins → Development → Import plugin from manifest…** and pick `figma-plugin/manifest.json`.
3. Run **Plugins → Development → Sigma Import**, choose the JSON file (or paste it), optionally filter pages, then **Import into Figma**.
4. Imported pages are added to the current Figma file. Groups are flattened so positions stay exact. Fonts fall back to Inter if unavailable. Prototype links are not imported.

`.fig` binary files are not supported. To import a Figma file into Sigma, use **Dashboard → Import → From Figma URL** with a Figma personal access token.
