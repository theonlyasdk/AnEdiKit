// Image & AI command builders: golden params + destination resolution.
// These are pure apart from form-field reads, so the DOM mock supplies values.
import "./setup.js";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  resolveImageAiDestinationPath,
  buildBgRemoverCommand,
  buildAiUpscalerCommand,
  buildVectorizerCommand,
  buildRestoreDenoiseCommand,
  buildIconGeneratorCommand,
  buildMetadataCleanerCommand,
} from "../../src/js/image_commands.js";

const FORM_IDS = [
  "bg-model",
  "bg-output-mode",
  "bg-color",
  "bg-blur-radius",
  "ai-replace-source",
  "fake-grid-tile-size",
  "fake-grid-tolerance",
  "fake-gap-threshold",
  "upscale-factor",
  "upscale-model",
  "upscale-denoise",
  "vec-mode",
  "vec-colors",
  "vec-tolerance",
  "vec-mono-color",
  "rest-method",
  "rest-strength",
  "icon-fit-mode",
  "icon-bg-color",
  "meta-action",
  "image-ai-output-dir",
];

const el = (id) => document.getElementById(id);

function resetForm() {
  for (const id of FORM_IDS) {
    const node = el(id);
    node.value = "";
    node.checked = false;
  }
}

beforeEach(() => {
  localStorage.clear();
  resetForm();
});

describe("image_commands.js: resolveImageAiDestinationPath", () => {
  it("uses the explicit Image AI output directory when set", () => {
    el("image-ai-output-dir").value = "D:/AI Out";
    assert.equal(
      resolveImageAiDestinationPath("out.png", {}, "C:/pics/a.png"),
      "D:/AI Out\\out.png",
    );
  });

  it("strips trailing separators from the chosen directory", () => {
    el("image-ai-output-dir").value = "D:/AI Out/";
    assert.equal(
      resolveImageAiDestinationPath("out.png", {}, "C:/pics/a.png"),
      "D:/AI Out\\out.png",
    );
  });

  it("falls back to the source file's own directory on POSIX paths", () => {
    assert.equal(
      resolveImageAiDestinationPath("out.png", {}, "/home/me/pics/a.png"),
      "/home/me/pics/out.png",
    );
  });

  it("falls back to settings.outputDir when there is no source path", () => {
    assert.equal(
      resolveImageAiDestinationPath("out.png", { outputDir: "E:/Media" }, ""),
      "E:/Media\\out.png",
    );
  });

  it("prefers the saved last-output directory over the source directory", () => {
    localStorage.setItem("anedikit:settings:last_image_ai_out_dir", "F:/Saved");
    assert.equal(
      resolveImageAiDestinationPath("out.png", {}, "C:/pics/a.png"),
      "F:/Saved\\out.png",
    );
  });
});

describe("image_commands.js: buildBgRemoverCommand", () => {
  it("builds the default transparent cutout command", () => {
    const cmd = buildBgRemoverCommand("C:/pics/photo.png", "C:/out", {});
    assert.equal(cmd.executable, "image_ai");
    assert.equal(cmd.task, "bg_remover");
    assert.equal(cmd.params.input_path, "C:/pics/photo.png");
    assert.equal(cmd.params.model, "u2net");
    assert.equal(cmd.params.output_mode, "transparent");
    assert.equal(cmd.params.bg_color, "#ffffff");
    assert.equal(cmd.params.blur_radius, 25);
    assert.equal(cmd.params.replace_source, false);
    assert.equal(cmd.params.device, "auto");
    assert.equal(cmd.params.fake_tile_size, 0);
    assert.equal(cmd.params.fake_grid_tolerance, 14);
    assert.equal(cmd.params.fake_gap_threshold, 15);
    assert.equal(cmd.destination, "C:/pics\\photo_nobg.png");
    assert.ok(cmd.fullString.startsWith('python src/py/image_ai_engine.py --task bg_remover --params "'));
    assert.ok(cmd.fullString.endsWith('"'));
  });

  it("forces a .png destination when replacing a transparent JPEG source", () => {
    el("ai-replace-source").checked = true;
    const cmd = buildBgRemoverCommand("C:/pics/photo.JPG", "C:/out", {});
    assert.equal(cmd.destination, "C:/pics/photo.png");
    assert.equal(cmd.params.replace_source, true);
  });

  it("keeps the JPEG source when output mode is not transparent", () => {
    el("ai-replace-source").checked = true;
    el("bg-output-mode").value = "color";
    const cmd = buildBgRemoverCommand("C:/pics/photo.jpg", "C:/out", {});
    assert.equal(cmd.destination, "C:/pics/photo.jpg");
  });

  it("passes the selected hardware backend through", () => {
    const cmd = buildBgRemoverCommand("C:/pics/photo.png", "C:/out", { hwAccel: "cuda" });
    assert.equal(cmd.params.device, "cuda");
  });
});

describe("image_commands.js: buildAiUpscalerCommand", () => {
  it("builds the default 2x upscale and converts jpg output to png", () => {
    const cmd = buildAiUpscalerCommand("C:/pics/img.jpg", "C:/out", {});
    assert.equal(cmd.task, "ai_upscaler");
    assert.equal(cmd.params.scale, 2);
    assert.equal(cmd.params.model, "realesrgan-x4plus");
    assert.equal(cmd.params.denoise, 0);
    assert.equal(cmd.destination, "C:/pics\\img_2x_upscaled.png");
  });

  it("honors a custom scale factor", () => {
    el("upscale-factor").value = "4";
    const cmd = buildAiUpscalerCommand("C:/pics/img.png", "C:/out", {});
    assert.equal(cmd.params.scale, 4);
    assert.equal(cmd.destination, "C:/pics\\img_4x_upscaled.png");
  });

  it("keeps the source path when replacing", () => {
    el("ai-replace-source").checked = true;
    const cmd = buildAiUpscalerCommand("C:/pics/img.png", "C:/out", {});
    assert.equal(cmd.destination, "C:/pics/img.png");
  });
});

describe("image_commands.js: buildVectorizerCommand", () => {
  it("builds the default color vectorization", () => {
    const cmd = buildVectorizerCommand("C:/pics/graphic.png", "C:/out", {});
    assert.equal(cmd.task, "vectorizer");
    assert.equal(cmd.params.mode, "color");
    assert.equal(cmd.params.num_colors, 8);
    assert.equal(cmd.params.tolerance, 1.0);
    assert.equal(cmd.params.monochrome_color, "#000000");
    assert.equal(cmd.destination, "C:/pics\\graphic_vector.svg");
  });

  it("only replaces in place when the source is already an SVG", () => {
    el("ai-replace-source").checked = true;
    const svg = buildVectorizerCommand("C:/pics/logo.svg", "C:/out", {});
    assert.equal(svg.destination, "C:/pics/logo.svg");

    const png = buildVectorizerCommand("C:/pics/logo.png", "C:/out", {});
    assert.equal(png.destination, "C:/pics\\logo_vector.svg");
  });
});

describe("image_commands.js: buildRestoreDenoiseCommand", () => {
  it("keeps the source extension for the restored output", () => {
    el("rest-method").value = "bilateral";
    el("rest-strength").value = "7";
    const cmd = buildRestoreDenoiseCommand("C:/pics/a.jpg", "C:/out", {});
    assert.equal(cmd.task, "restore_denoise");
    assert.equal(cmd.params.method, "bilateral");
    assert.equal(cmd.params.strength, 7);
    assert.equal(cmd.destination, "C:/pics\\a_restored.jpg");
  });
});

describe("image_commands.js: buildIconGeneratorCommand", () => {
  it("gathers every icon size under a per-source folder", () => {
    const cmd = buildIconGeneratorCommand("C:/pics/logo.png", "C:/out", { outputDir: "D:/Out" });
    assert.equal(cmd.task, "icon_generator");
    assert.equal(cmd.params.fit_mode, "contain");
    assert.equal(cmd.params.bg_color, "transparent");
    assert.equal(cmd.params.output_dir, "D:/Out\\logo_icons");
    assert.equal(cmd.destination, "D:/Out\\logo_icons");
  });

  it("prefers an explicit Image AI output directory", () => {
    el("image-ai-output-dir").value = "E:/Icons";
    const cmd = buildIconGeneratorCommand("C:/pics/logo.png", "C:/out", { outputDir: "D:/Out" });
    assert.equal(cmd.params.output_dir, "E:/Icons");
  });
});

describe("image_commands.js: buildMetadataCleanerCommand", () => {
  it("builds the strip-all default", () => {
    const cmd = buildMetadataCleanerCommand("C:/pics/photo.jpg", "C:/out", {});
    assert.equal(cmd.task, "metadata_cleaner");
    assert.equal(cmd.params.action, "strip_all");
    assert.equal(cmd.params.replace_source, false);
    assert.equal(cmd.destination, "C:/pics\\photo_clean.jpg");
  });

  it("honors a custom action", () => {
    el("meta-action").value = "gps_only";
    const cmd = buildMetadataCleanerCommand("C:/pics/photo.jpg", "C:/out", {});
    assert.equal(cmd.params.action, "gps_only");
  });
});
