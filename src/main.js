// AnEdiKit - Frontend Tool State & Controller

const toolsMeta = {
  convert: {
    title: "Convert Video Formats",
    desc: "Convert between MP4, MKV, WebM, MOV, and AVI with codec, CRF quality, and resolution controls.",
    hasSingleInput: true
  },
  extract_audio: {
    title: "Extract and Convert Audio",
    desc: "Extract audio from video or convert between MP3, M4A, FLAC, WAV, OGG, and Opus.",
    hasSingleInput: true
  },
  trim: {
    title: "Trim and Cut Media",
    desc: "Cut video or audio clips instantly with lossless stream copy or accurate re-encoding.",
    hasSingleInput: true
  },
  compress: {
    title: "Compress Video",
    desc: "Reduce video file size for Discord (24MB), WhatsApp (15MB), Email, or custom target size.",
    hasSingleInput: true
  },
  merge: {
    title: "Merge and Concatenate Media",
    desc: "Combine multiple video or audio files into a single continuous file.",
    hasSingleInput: false
  },
  mute_replace: {
    title: "Mute or Replace Audio",
    desc: "Remove audio tracks from video or attach and mix new background audio.",
    hasSingleInput: true
  },
  gif_frames: {
    title: "GIF and Frame Extractor",
    desc: "Create crisp high-quality animated GIFs with PaletteGen or export video frames.",
    hasSingleInput: true
  },
  custom: {
    title: "Custom FFmpeg Command",
    desc: "Execute arbitrary FFmpeg flags and filters with live command syntax preview.",
    hasSingleInput: true
  },
  settings: {
    title: "Application Settings",
    desc: "Configure default output folders, hardware acceleration engines, and encoding threads.",
    hasSingleInput: false
  }
};

let currentToolId = "convert";
let currentInputFile = "";
let currentOutputDir = "C:\\Users\\User\\Videos";
let mergeFiles = [];

function initApp() {
  setupNavigation();
  setupInputs();
  setupCommandPreviewListeners();
  updateToolView("convert");
  updateCommandPreview();
}

function setupNavigation() {
  const toolNav = document.getElementById("tool-nav");
  const allButtons = document.querySelectorAll("[data-tool]");

  allButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const toolId = btn.dataset.tool;
      updateToolView(toolId);
    });
  });
}

function updateToolView(toolId) {
  currentToolId = toolId;
  const meta = toolsMeta[toolId] || toolsMeta.convert;

  // Update active state in sidebar
  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === toolId);
  });

  // Update header titles
  document.getElementById("current-tool-title").textContent = meta.title;
  document.getElementById("current-tool-desc").textContent = meta.desc;

  // Show/Hide shared input card
  const sharedInputCard = document.getElementById("shared-input-card");
  if (sharedInputCard) {
    sharedInputCard.classList.toggle("d-none", !meta.hasSingleInput);
  }

  // Show/Hide tool views
  document.querySelectorAll(".tool-view").forEach((view) => {
    view.classList.add("d-none");
  });

  const activeView = document.getElementById(`view-${toolId}`);
  if (activeView) {
    activeView.classList.remove("d-none");
  }

  updateCommandPreview();
}

function setupInputs() {
  // Input browse button (mock / placeholder for Tauri dialog)
  const btnBrowse = document.getElementById("btn-browse-input");
  const inputFilePath = document.getElementById("input-file-path");
  const btnClear = document.getElementById("btn-clear-input");

  if (btnBrowse) {
    btnBrowse.addEventListener("click", () => {
      // In web preview / non-IPC fallback
      if (!currentInputFile) {
        currentInputFile = "C:\\Users\\User\\Videos\\sample_video.mp4";
        inputFilePath.value = currentInputFile;
        document.getElementById("meta-duration").textContent = "00:03:45";
        document.getElementById("meta-resolution").textContent = "1920x1080";
        document.getElementById("meta-vcodec").textContent = "h264";
        document.getElementById("meta-acodec").textContent = "aac";
        document.getElementById("meta-size").textContent = "84.2 MB";
      }
      updateCommandPreview();
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      currentInputFile = "";
      inputFilePath.value = "";
      document.getElementById("meta-duration").textContent = "--:--:--";
      document.getElementById("meta-resolution").textContent = "--";
      document.getElementById("meta-vcodec").textContent = "--";
      document.getElementById("meta-acodec").textContent = "--";
      document.getElementById("meta-size").textContent = "-- MB";
      updateCommandPreview();
    });
  }

  // Copy command button
  const btnCopy = document.getElementById("btn-copy-cmd");
  if (btnCopy) {
    btnCopy.addEventListener("click", () => {
      const cmdText = document.getElementById("cmd-preview").textContent;
      navigator.clipboard.writeText(cmdText).then(() => {
        btnCopy.innerHTML = '<i class="bi bi-check2"></i> Copied!';
        setTimeout(() => {
          btnCopy.innerHTML = '<i class="bi bi-clipboard"></i> Copy';
        }, 1500);
      });
    });
  }

  // Merge tool buttons
  const btnMergeAdd = document.getElementById("btn-merge-add");
  const btnMergeClear = document.getElementById("btn-merge-clear");
  const mergeList = document.getElementById("merge-file-list");

  if (btnMergeAdd) {
    btnMergeAdd.addEventListener("click", () => {
      const demoFile = `C:\\Users\\User\\Videos\\clip_${mergeFiles.length + 1}.mp4`;
      mergeFiles.push(demoFile);
      renderMergeList();
      updateCommandPreview();
    });
  }

  if (btnMergeClear) {
    btnMergeClear.addEventListener("click", () => {
      mergeFiles = [];
      renderMergeList();
      updateCommandPreview();
    });
  }

  // Mute / Replace audio action selector
  const muteAction = document.getElementById("mute-action");
  const secondAudioWrapper = document.getElementById("second-audio-wrapper");
  if (muteAction && secondAudioWrapper) {
    muteAction.addEventListener("change", () => {
      secondAudioWrapper.classList.toggle("d-none", muteAction.value === "strip");
      updateCommandPreview();
    });
  }

  // Compression custom size toggle
  const compPreset = document.getElementById("comp-preset");
  const compCustomWrapper = document.getElementById("comp-custom-wrapper");
  if (compPreset && compCustomWrapper) {
    compPreset.addEventListener("change", () => {
      compCustomWrapper.classList.toggle("d-none", compPreset.value !== "custom");
      updateCommandPreview();
    });
  }

  // Settings default output
  const setOutDir = document.getElementById("set-output-dir");
  if (setOutDir) {
    setOutDir.value = currentOutputDir;
  }
}

function renderMergeList() {
  const mergeList = document.getElementById("merge-file-list");
  if (!mergeList) return;

  if (mergeFiles.length === 0) {
    mergeList.innerHTML = '<div class="list-group-item text-body-secondary text-center py-4" id="merge-empty-msg">No files added. Click Add Files to queue items for merging.</div>';
    return;
  }

  mergeList.innerHTML = mergeFiles
    .map(
      (file, idx) => `
    <div class="list-group-item d-flex justify-content-between align-items-center py-2 px-3">
      <span class="font-monospace text-truncate" style="max-width: 80%;">${file}</span>
      <span class="badge text-bg-secondary">#${idx + 1}</span>
    </div>
  `
    )
    .join("");
}

function setupCommandPreviewListeners() {
  const formElements = document.querySelectorAll("select, input");
  formElements.forEach((el) => {
    el.addEventListener("input", updateCommandPreview);
    el.addEventListener("change", updateCommandPreview);
  });
}

function updateCommandPreview() {
  const previewEl = document.getElementById("cmd-preview");
  if (!previewEl) return;

  const inFile = currentInputFile || "input.mp4";
  let cmd = "ffmpeg";

  switch (currentToolId) {
    case "convert": {
      const container = document.getElementById("cvt-container").value;
      const vcodec = document.getElementById("cvt-vcodec").value;
      const acodec = document.getElementById("cvt-acodec").value;
      const crf = document.getElementById("cvt-crf").value;
      const preset = document.getElementById("cvt-preset").value;
      const scale = document.getElementById("cvt-scale").value;

      let filter = "";
      if (scale !== "original") {
        filter = ` -vf "scale=${scale}"`;
      }

      const crfFlag = vcodec === "copy" ? "" : ` -crf ${crf}`;
      const presetFlag = vcodec === "copy" ? "" : ` -preset ${preset}`;
      cmd = `ffmpeg -i "${inFile}" -c:v ${vcodec}${crfFlag}${presetFlag} -c:a ${acodec}${filter} "output.${container}"`;
      break;
    }

    case "extract_audio": {
      const format = document.getElementById("aud-format").value;
      const bitrate = document.getElementById("aud-bitrate").value;
      const volume = document.getElementById("aud-volume").value;

      let volFilter = "";
      if (volume === "loudnorm") volFilter = " -af loudnorm";
      else if (volume === "vol_150") volFilter = " -af volume=1.5";
      else if (volume === "vol_200") volFilter = " -af volume=2.0";

      cmd = `ffmpeg -i "${inFile}" -vn -c:a libmp3lame -b:a ${bitrate}${volFilter} "output.${format}"`;
      break;
    }

    case "trim": {
      const start = document.getElementById("trim-start").value;
      const end = document.getElementById("trim-end").value;
      const mode = document.getElementById("trim-mode").value;

      if (mode === "copy") {
        cmd = `ffmpeg -ss ${start} -to ${end} -i "${inFile}" -c copy "trimmed_output.mp4"`;
      } else {
        cmd = `ffmpeg -i "${inFile}" -ss ${start} -to ${end} -c:v libx264 -crf 23 -c:a aac "trimmed_output.mp4"`;
      }
      break;
    }

    case "compress": {
      const preset = document.getElementById("comp-preset").value;
      let targetMb = 24;
      if (preset === "whatsapp") targetMb = 15;
      else if (preset === "email") targetMb = 10;
      else if (preset === "custom") targetMb = document.getElementById("comp-custom-mb").value || 24;

      cmd = `ffmpeg -i "${inFile}" -c:v libx264 -b:v 1500k -maxrate 2000k -bufsize 3000k -c:a aac -b:a 128k "compressed_${targetMb}MB.mp4"`;
      break;
    }

    case "merge": {
      const engine = document.getElementById("merge-engine").value;
      if (engine === "concat_demuxer") {
        cmd = `ffmpeg -f concat -safe 0 -i "filelist.txt" -c copy "merged_output.mp4"`;
      } else {
        cmd = `ffmpeg -i "clip_1.mp4" -i "clip_2.mp4" -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" "merged_output.mp4"`;
      }
      break;
    }

    case "mute_replace": {
      const action = document.getElementById("mute-action").value;
      const audioFile = document.getElementById("second-audio-path").value || "audio.mp3";
      if (action === "strip") {
        cmd = `ffmpeg -i "${inFile}" -an -c:v copy "muted_output.mp4"`;
      } else if (action === "replace") {
        cmd = `ffmpeg -i "${inFile}" -i "${audioFile}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "replaced_audio.mp4"`;
      } else {
        cmd = `ffmpeg -i "${inFile}" -i "${audioFile}" -filter_complex "[0:a][1:a]amix=inputs=2:duration=first[a]" -c:v copy -map 0:v:0 -map "[a]" "mixed_output.mp4"`;
      }
      break;
    }

    case "gif_frames": {
      const mode = document.getElementById("gif-mode").value;
      const fps = document.getElementById("gif-fps").value;
      const width = document.getElementById("gif-width").value;

      const scaleStr = width === "original" ? "" : `,scale=${width}:-1:flags=lanczos`;
      if (mode === "gif_hq") {
        cmd = `ffmpeg -i "${inFile}" -vf "fps=${fps}${scaleStr},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" "output.gif"`;
      } else if (mode === "frames_png") {
        cmd = `ffmpeg -i "${inFile}" -vf "fps=${fps}${scaleStr}" "frame_%04d.png"`;
      } else {
        cmd = `ffmpeg -i "${inFile}" -vf "fps=${fps}${scaleStr}" -q:v 2 "frame_%04d.jpg"`;
      }
      break;
    }

    case "custom": {
      const args = document.getElementById("custom-args").value || "-c:v copy -c:a copy";
      cmd = `ffmpeg -i "${inFile}" ${args} "custom_output.mp4"`;
      break;
    }

    case "settings": {
      cmd = "echo Application settings mode";
      break;
    }
  }

  previewEl.textContent = cmd;
}

window.addEventListener("DOMContentLoaded", initApp);
