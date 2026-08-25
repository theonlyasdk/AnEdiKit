// Image & AI Processing Command Builders Module
import { getLastImageAiOutDir } from "./storage.js";

export function resolveImageAiDestinationPath(defaultFileName, settings = {}, inputFile = "") {
  const currentInput = inputFile || "";
  let outDir = "";

  // 1. Check custom Image AI output directory
  const imageOutDirInput = document.getElementById("image-ai-output-dir")?.value?.trim();
  if (imageOutDirInput) {
    outDir = imageOutDirInput;
  } else {
    const savedImageDir = getLastImageAiOutDir();
    if (savedImageDir) {
      outDir = savedImageDir;
    }
  }

  // 2. Default directly to the enclosing directory of the source file
  if (!outDir && currentInput) {
    const lastSlash = Math.max(currentInput.lastIndexOf("\\"), currentInput.lastIndexOf("/"));
    if (lastSlash > 0) {
      outDir = currentInput.substring(0, lastSlash);
    }
  }

  // 3. Fallback to settings outputDir or system Pictures directory
  if (!outDir) {
    outDir = settings.outputDir || "C:\\Users\\User\\Pictures";
  }

  const isWindows = outDir.includes("\\") || /^[a-zA-Z]:/.test(outDir);
  const sep = isWindows ? "\\" : "/";
  return `${outDir.replace(/[/\\]+$/, "")}${sep}${defaultFileName}`;
}

export function buildBgRemoverCommand(inputFile, outputDir, settings = {}) {
  const src = inputFile || "C:\\Users\\User\\Pictures\\photo.png";
  const baseName = src.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || "output";
  const model = document.getElementById("bg-model")?.value || "u2net";
  const outputMode = document.getElementById("bg-output-mode")?.value || "transparent";
  const bgColor = document.getElementById("bg-color")?.value || "#ffffff";
  const blurRadius = document.getElementById("bg-blur-radius")?.value || "25";
  const shouldReplace = document.getElementById("ai-replace-source")?.checked || false;
  const device = settings.hwAccel || "auto";

  const defaultOut = `${baseName}_nobg.png`;
  const dst = shouldReplace ? src : resolveImageAiDestinationPath(defaultOut, settings, src);

  const fakeTileSize = parseInt(document.getElementById("fake-grid-tile-size")?.value || "0", 10) || 0;
  const fakeGridTolerance = parseFloat(document.getElementById("fake-grid-tolerance")?.value || "14") || 14;
  const fakeGapThreshold = parseFloat(document.getElementById("fake-gap-threshold")?.value || "15") || 15;

  const params = {
    input_path: src,
    output_path: dst,
    model,
    output_mode: outputMode,
    bg_color: bgColor,
    blur_radius: parseInt(blurRadius, 10),
    replace_source: shouldReplace,
    device,
    fake_tile_size: fakeTileSize,
    fake_grid_tolerance: fakeGridTolerance,
    fake_gap_threshold: fakeGapThreshold,
  };

  return {
    executable: "image_ai",
    task: "bg_remover",
    params,
    destination: dst,
    fullString: `python src/py/image_ai_engine.py --task bg_remover --params "${JSON.stringify(params).replace(/"/g, '\\"')}"`,
  };
}

export function buildAiUpscalerCommand(inputFile, outputDir, settings = {}) {
  const src = inputFile || "C:\\Users\\User\\Pictures\\photo.png";
  const baseName = src.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || "output";
  const scale = parseInt(document.getElementById("upscale-factor")?.value || "2", 10);
  const model = document.getElementById("upscale-model")?.value || "realesrgan-x4plus";
  const denoise = parseFloat(document.getElementById("upscale-denoise")?.value || "0");
  const shouldReplace = document.getElementById("ai-replace-source")?.checked || false;
  const device = settings.hwAccel || "auto";

  const ext = (src.split(".").pop() || "png").toLowerCase();
  const defaultOut = `${baseName}_${scale}x_upscaled.${ext === "jpg" ? "png" : ext}`;
  const dst = shouldReplace ? src : resolveImageAiDestinationPath(defaultOut, settings, src);
  const params = {
    input_path: src,
    output_path: dst,
    scale,
    model,
    denoise,
    replace_source: shouldReplace,
    device,
  };

  return {
    executable: "image_ai",
    task: "ai_upscaler",
    params,
    destination: dst,
    fullString: `python src/py/image_ai_engine.py --task ai_upscaler --params "${JSON.stringify(params).replace(/"/g, '\\"')}"`,
  };
}

export function buildVectorizerCommand(inputFile, outputDir, settings = {}) {
  const src = inputFile || "C:\\Users\\User\\Pictures\\graphic.png";
  const baseName = src.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || "output";
  const mode = document.getElementById("vec-mode")?.value || "color";
  const numColors = parseInt(document.getElementById("vec-colors")?.value || "8", 10);
  const tolerance = parseFloat(document.getElementById("vec-tolerance")?.value || "1.0");
  const monochromeColor = document.getElementById("vec-mono-color")?.value || "#000000";
  const shouldReplace = document.getElementById("ai-replace-source")?.checked || false;
  const device = settings.hwAccel || "auto";

  const defaultOut = `${baseName}_vector.svg`;
  const dst = shouldReplace && src.toLowerCase().endsWith(".svg") ? src : resolveImageAiDestinationPath(defaultOut, settings, src);
  const params = {
    input_path: src,
    output_path: dst,
    mode,
    num_colors: numColors,
    tolerance,
    monochrome_color: monochromeColor,
    replace_source: shouldReplace,
    device,
  };

  return {
    executable: "image_ai",
    task: "vectorizer",
    params,
    destination: dst,
    fullString: `python src/py/image_ai_engine.py --task vectorizer --params "${JSON.stringify(params).replace(/"/g, '\\"')}"`,
  };
}

export function buildRestoreDenoiseCommand(inputFile, outputDir, settings = {}) {
  const src = inputFile || "C:\\Users\\User\\Pictures\\photo.png";
  const baseName = src.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || "output";
  const method = document.getElementById("rest-method")?.value || "nlmeans";
  const strength = parseFloat(document.getElementById("rest-strength")?.value || "10");
  const shouldReplace = document.getElementById("ai-replace-source")?.checked || false;
  const device = settings.hwAccel || "auto";

  const ext = (src.split(".").pop() || "png").toLowerCase();
  const defaultOut = `${baseName}_restored.${ext}`;
  const dst = shouldReplace ? src : resolveImageAiDestinationPath(defaultOut, settings, src);
  const params = {
    input_path: src,
    output_path: dst,
    method,
    strength,
    replace_source: shouldReplace,
    device,
  };

  return {
    executable: "image_ai",
    task: "restore_denoise",
    params,
    destination: dst,
    fullString: `python src/py/image_ai_engine.py --task restore_denoise --params "${JSON.stringify(params).replace(/"/g, '\\"')}"`,
  };
}

export function buildIconGeneratorCommand(inputFile, outputDir, settings = {}) {
  const src = inputFile || "C:\\Users\\User\\Pictures\\logo.png";
  const baseName = src.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || "app_icons";
  const fitMode = document.getElementById("icon-fit-mode")?.value || "contain";
  const bgColor = document.getElementById("icon-bg-color")?.value || "transparent";
  const device = settings.hwAccel || "auto";

  const customOut = document.getElementById("image-ai-output-dir")?.value?.trim() || "";
  let outDir = customOut || `${settings.outputDir || "C:\\Users\\User\\Pictures"}\\${baseName}_icons`;

  const params = {
    input_path: src,
    output_dir: outDir,
    fit_mode: fitMode,
    bg_color: bgColor,
    device,
  };

  return {
    executable: "image_ai",
    task: "icon_generator",
    params,
    destination: outDir,
    fullString: `python src/py/image_ai_engine.py --task icon_generator --params "${JSON.stringify(params).replace(/"/g, '\\"')}"`,
  };
}

export function buildMetadataCleanerCommand(inputFile, outputDir, settings = {}) {
  const src = inputFile || "C:\\Users\\User\\Pictures\\photo.jpg";
  const baseName = src.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, "") || "output";
  const action = document.getElementById("meta-action")?.value || "strip_all";
  const shouldReplace = document.getElementById("ai-replace-source")?.checked || false;
  const device = settings.hwAccel || "auto";

  const ext = (src.split(".").pop() || "jpg").toLowerCase();
  const defaultOut = `${baseName}_clean.${ext}`;
  const dst = shouldReplace ? src : resolveImageAiDestinationPath(defaultOut, settings, src);
  const params = {
    input_path: src,
    output_path: dst,
    action,
    replace_source: shouldReplace,
    device,
  };

  return {
    executable: "image_ai",
    task: "metadata_cleaner",
    params,
    destination: dst,
    fullString: `python src/py/image_ai_engine.py --task metadata_cleaner --params "${JSON.stringify(params).replace(/"/g, '\\"')}"`,
  };
}
