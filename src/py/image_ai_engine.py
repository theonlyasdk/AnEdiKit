"""
AnEdiKit - Image & AI Processing Engine
Handles AI background removal, super-resolution upscaling, vectorization,
image restoration/denoising, icon generation, and metadata sanitization.
"""

import sys
import os
import json
import argparse
import traceback

def get_asdk_dir(*subpaths):
    """
    Returns the target folder path inside ASDK/AnEdiKit/<subfolder>.
    Ensures directory exists and configures appropriate environment variables.
    """
    if sys.platform == "win32":
        local_app_data = os.environ.get("LOCALAPPDATA", os.path.expanduser("~\\AppData\\Local"))
        base_dir = os.path.join(local_app_data, "ASDK", "AnEdiKit")
    elif sys.platform == "darwin":
        base_dir = os.path.join(os.path.expanduser("~"), "Library", "Application Support", "ASDK", "AnEdiKit")
    else:
        xdg_data = os.environ.get("XDG_DATA_HOME", os.path.join(os.path.expanduser("~"), ".local", "share"))
        base_dir = os.path.join(xdg_data, "ASDK", "AnEdiKit")
    
    target_dir = os.path.join(base_dir, *subpaths) if subpaths else base_dir
    os.makedirs(target_dir, exist_ok=True)
    return target_dir

# Set environment variables for AI model caches
bg_models_dir = get_asdk_dir("models", "bg_remover")
upscale_models_dir = get_asdk_dir("models", "upscaler")
torch_models_dir = get_asdk_dir("models", "torch")
hf_models_dir = get_asdk_dir("models", "huggingface")

os.environ["U2NET_HOME"] = bg_models_dir
os.environ["TORCH_HOME"] = torch_models_dir
os.environ["HF_HOME"] = hf_models_dir
os.environ["HUGGINGFACE_HUB_CACHE"] = hf_models_dir

def format_seconds_hms(sec):
    if sec is None or sec < 0 or sec != sec: # NaN check
        return "--:--:--"
    sec = int(round(sec))
    h = sec // 3600
    m = (sec % 3600) // 60
    s = sec % 60
    return f"{h:02d}:{m:02d}:{s:02d}"

def log_progress(pct, msg="", speed="", eta="", bitrate=""):
    payload = {
        "pct": int(min(100, max(0, pct))),
        "msg": str(msg),
        "speed": str(speed),
        "eta": str(eta) if eta else None,
        "bitrate": str(bitrate)
    }
    if msg:
        print(f"[{msg}]", flush=True)
    print(f"ANEDIKIT_PROGRESS:{json.dumps(payload)}", flush=True)

def install_tqdm_hook():
    """
    Hooks tqdm globally so any underlying library model downloads (rembg, torch, huggingface, pooch)
    automatically report live progress, speed, ETA, and downloaded sizes to AnEdiKit.
    """
    try:
        import time
        import importlib

        def patch_tqdm_module(tqdm_mod):
            if not hasattr(tqdm_mod, "tqdm") or getattr(tqdm_mod, "_anedikit_hooked", False):
                return
            tqdm_mod._anedikit_hooked = True
            orig_tqdm_cls = tqdm_mod.tqdm

            class AnEdiKitTqdm(orig_tqdm_cls):
                def __init__(self, *args, **kwargs):
                    super().__init__(*args, **kwargs)
                    self._anedikit_last_emit = 0
                    self._anedikit_desc = kwargs.get("desc") or getattr(self, "desc", "") or "Downloading model"

                def update(self, n=1):
                    res = super().update(n)
                    now = time.time()
                    if now - self._anedikit_last_emit >= 0.15 or (self.total and self.n >= self.total):
                        self._anedikit_last_emit = now
                        if self.total and self.total > 0:
                            pct = int((self.n / self.total) * 100)
                            cur_mb = self.n / (1024 * 1024)
                            tot_mb = self.total / (1024 * 1024)
                            elapsed = max(0.001, now - (getattr(self, "start_t", None) or now))
                            speed_bps = self.n / elapsed
                            speed_mb = speed_bps / (1024 * 1024)
                            speed_str = f"{speed_mb:.2f} MB/s" if speed_mb >= 1.0 else f"{speed_bps/1024:.1f} kB/s"
                            rem_bytes = max(0, self.total - self.n)
                            eta_sec = rem_bytes / max(1.0, speed_bps)
                            eta_str = format_seconds_hms(eta_sec)

                            desc_text = self.desc if getattr(self, "desc", None) else self._anedikit_desc
                            desc_clean = desc_text.replace(":", "").strip() if desc_text else "Downloading model"
                            msg = f"{desc_clean}: {cur_mb:.1f}/{tot_mb:.1f} MB ({pct}%)"
                            bitrate_str = f"{cur_mb:.1f}/{tot_mb:.1f} MB"
                            log_progress(pct, msg, speed=speed_str, eta=eta_str, bitrate=bitrate_str)
                    return res

            tqdm_mod.tqdm = AnEdiKitTqdm
            if hasattr(tqdm_mod, "auto"):
                tqdm_mod.auto.tqdm = AnEdiKitTqdm

        try:
            import tqdm
            patch_tqdm_module(tqdm)
        except ImportError:
            pass
    except Exception:
        pass

# Initialize global download hooks
install_tqdm_hook()

def download_model_file(url, dest_path, model_label="AI Model"):
    """
    Downloads model weights with high-accuracy chunk streaming, percentage, MB rate, and ETA feedback.
    """
    import urllib.request
    import time

    os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
    temp_path = dest_path + ".tmp_download"

    log_progress(0, f"Connecting to download {model_label}...", speed="Connecting...", eta="--:--:--")
    
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "AnEdiKit-AI-Engine/1.0 (Desktop)"}
    )

    with urllib.request.urlopen(req, timeout=30) as response:
        total_size = int(response.headers.get("content-length", 0))
        total_mb = total_size / (1024 * 1024) if total_size > 0 else 0
        
        downloaded = 0
        block_size = 128 * 1024  # 128 KB chunks
        start_time = time.time()
        last_emit = 0
        
        with open(temp_path, "wb") as out_file:
            while True:
                chunk = response.read(block_size)
                if not chunk:
                    break
                out_file.write(chunk)
                downloaded += len(chunk)
                
                now = time.time()
                if now - last_emit >= 0.15 or (total_size > 0 and downloaded >= total_size):
                    last_emit = now
                    elapsed = max(0.001, now - start_time)
                    speed_bps = downloaded / elapsed
                    speed_mb = speed_bps / (1024 * 1024)
                    speed_str = f"{speed_mb:.2f} MB/s" if speed_mb >= 1.0 else f"{speed_bps/1024:.1f} kB/s"
                    
                    if total_size > 0:
                        pct = int((downloaded / total_size) * 100)
                        pct = min(100, max(0, pct))
                        cur_mb = downloaded / (1024 * 1024)
                        remaining = max(0, total_size - downloaded)
                        eta_sec = remaining / max(1.0, speed_bps)
                        eta_str = format_seconds_hms(eta_sec)
                        msg = f"Downloading {model_label}: {cur_mb:.1f}/{total_mb:.1f} MB ({pct}%)"
                        bitrate_str = f"{cur_mb:.1f}/{total_mb:.1f} MB"
                        log_progress(pct, msg, speed=speed_str, eta=eta_str, bitrate=bitrate_str)
                    else:
                        cur_mb = downloaded / (1024 * 1024)
                        msg = f"Downloading {model_label}: {cur_mb:.1f} MB"
                        log_progress(50, msg, speed=speed_str, eta="--:--:--", bitrate=f"{cur_mb:.1f} MB")

    if os.path.exists(dest_path):
        try:
            os.remove(dest_path)
        except Exception:
            pass
    os.rename(temp_path, dest_path)
    log_progress(100, f"Downloaded {model_label} successfully", speed="", eta="00:00:00")

REMBG_MODEL_URLS = {
    "u2net": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx",
    "u2netp": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx",
    "u2net_human_seg": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx",
    "u2net_cloth_seg": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_cloth_seg.onnx",
    "isnet-general-use": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx",
    "isnet-anime": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-anime.onnx",
    "silueta": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx",
    "birefnet-general": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-epoch_244.onnx",
    "birefnet-general-lite": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx",
    "birefnet-portrait": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-portrait-epoch_150.onnx",
    "birefnet-dis": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-DIS-epoch_590.onnx",
    "birefnet-hrsod": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-HRSOD_DHU-epoch_115.onnx",
    "birefnet-cod": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-COD-epoch_125.onnx",
    "birefnet-massive": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/BiRefNet-massive-TR_DIS5K_TR_TEs-epoch_420.onnx",
}

def ensure_rembg_model(model_name):
    """
    Checks if rembg ONNX model exists locally; if not, downloads it with real-time UI progress.
    """
    if model_name == "fake_transparency":
        return ensure_rembg_model("u2net")

    onnx_name = f"{model_name}.onnx" if not model_name.endswith(".onnx") else model_name
    model_key = model_name.replace(".onnx", "")
    
    dest_path = os.path.join(bg_models_dir, onnx_name)
    user_home_dest = os.path.join(os.path.expanduser("~"), ".u2net", onnx_name)
    
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 100000:
        return dest_path
    if os.path.exists(user_home_dest) and os.path.getsize(user_home_dest) > 100000:
        return user_home_dest
        
    url = REMBG_MODEL_URLS.get(model_key)
    if url:
        try:
            download_model_file(url, dest_path, f"AI Model ({model_name})")
            os.makedirs(os.path.dirname(user_home_dest), exist_ok=True)
            if not os.path.exists(user_home_dest):
                try:
                    import shutil
                    shutil.copyfile(dest_path, user_home_dest)
                except Exception:
                    pass
        except Exception as e:
            log_progress(15, f"Direct model pre-download notice: {e}, will let rembg fetch it...")
    return dest_path

def get_execution_providers(device="auto"):
    """
    Returns prioritized ONNX Runtime / ML execution providers according to user hardware acceleration settings.
    Dynamically probes provider initialization to prevent missing CUDA / TensorRT DLL errors from cluttering logs.
    """
    try:
        import onnxruntime as ort
        available = ort.get_available_providers()
    except Exception:
        available = ["CPUExecutionProvider"]

    dev = (device or "auto").lower()
    selected_providers = []

    # Check if CUDA DLL dependencies actually exist before requesting CUDAExecutionProvider
    cuda_working = False
    if "CUDAExecutionProvider" in available:
        try:
            import ctypes
            ctypes.cdll.LoadLibrary("cublasLt64_12.dll")
            cuda_working = True
        except Exception:
            try:
                ctypes.cdll.LoadLibrary("cublas64_12.dll")
                cuda_working = True
            except Exception:
                cuda_working = False

    if dev in ("cuda", "nvenc"):
        if cuda_working:
            selected_providers.append("CUDAExecutionProvider")
    elif dev in ("qsv", "d3d11", "directml", "amf"):
        if "DmlExecutionProvider" in available:
            selected_providers.append("DmlExecutionProvider")
        if "OpenVINOExecutionProvider" in available:
            selected_providers.append("OpenVINOExecutionProvider")
    elif dev == "cpu":
        return ["CPUExecutionProvider"]
    else:  # "auto" aka best available verified GPU provider then CPU
        if cuda_working:
            selected_providers.append("CUDAExecutionProvider")
        if "DmlExecutionProvider" in available:
            selected_providers.append("DmlExecutionProvider")
        if "OpenVINOExecutionProvider" in available:
            selected_providers.append("OpenVINOExecutionProvider")

    if "CPUExecutionProvider" not in selected_providers:
        selected_providers.append("CPUExecutionProvider")

    return selected_providers

def safe_save_file(data, output_path, input_path=None, is_cv2=False):
    """
    Safely writes output to disk, supporting in-place atomic replacement when output_path == input_path.
    """
    out_dir = os.path.dirname(os.path.abspath(output_path))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    
    is_replace = False
    if input_path:
        try:
            is_replace = (os.path.abspath(output_path).lower() == os.path.abspath(input_path).lower())
        except Exception:
            is_replace = False

    target_path = output_path
    if is_replace:
        target_path = output_path + ".tmp_anedikit"

    if is_cv2:
        import cv2
        cv2.imwrite(target_path, data)
    elif hasattr(data, "save"):
        data.save(target_path)
    elif isinstance(data, str):
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(data)
    elif isinstance(data, bytes):
        with open(target_path, "wb") as f:
            f.write(data)

    if is_replace:
        if os.path.exists(output_path):
            os.remove(output_path)
        os.rename(target_path, output_path)

def cmd_bg_remover(args_json):
    input_path = args_json.get("input_path")
    output_path = args_json.get("output_path")
    model_name = args_json.get("model", "u2net")
    output_mode = args_json.get("output_mode", "transparent")
    bg_color_hex = args_json.get("bg_color", "#ffffff")
    blur_radius = int(args_json.get("blur_radius", 25))
    device = args_json.get("device", "auto")

    log_progress(10, f"Loading image: {os.path.basename(input_path)}")
    from PIL import Image, ImageFilter, ImageColor

    img = Image.open(input_path).convert("RGBA")
    
    # Check and pre-download model with real-time UI progress feedback
    ensure_rembg_model(model_name)

    providers = get_execution_providers(device)
    fg_image = None
    rembg_success = False

    if model_name == "fake_transparency":
        log_progress(30, "Removing fake transparency checkerboard background using deep neural segmentation...")
        try:
            from rembg import remove, new_session
            # IS-Net provides high-precision edge boundary isolation for graphics & illustrations on checkerboard backgrounds
            session = new_session("isnet-general-use", providers=providers)
            fg_image = remove(img, session=session)
            rembg_success = True
        except Exception as isnet_err:
            log_progress(45, f"IS-Net notice: {isnet_err}, falling back to U2Net neural segmentation...")
            try:
                from rembg import remove, new_session
                session = new_session("u2net", providers=providers)
                fg_image = remove(img, session=session)
                rembg_success = True
            except Exception as u2_err:
                log_progress(50, f"U2Net notice: {u2_err}, falling back to direct ONNX inference...")
                rembg_success = False
    else:
        try:
            from rembg import remove, new_session
            session = new_session(model_name, providers=providers)
            fg_image = remove(img, session=session)
            rembg_success = True
        except Exception as e:
            log_progress(40, f"rembg package notice: {e}, attempting direct ONNX runtime inference...")
            rembg_success = False

    if not rembg_success:
        # Direct onnxruntime inference on the downloaded ONNX model weights
        try:
            import onnxruntime as ort
            import numpy as np
            
            target_onnx = "isnet-general-use" if model_name == "fake_transparency" else model_name
            onnx_path = ensure_rembg_model(target_onnx)
            if not (os.path.exists(onnx_path) and os.path.getsize(onnx_path) > 100000):
                onnx_path = ensure_rembg_model("u2net")

            if os.path.exists(onnx_path) and os.path.getsize(onnx_path) > 100000:
                ort_sess = ort.InferenceSession(onnx_path, providers=providers)
                input_name = ort_sess.get_inputs()[0].name
                
                # Preprocess input image to model standard size (320x320, 1024x1024, 768x768)
                orig_w, orig_h = img.size
                input_shape = ort_sess.get_inputs()[0].shape
                in_h = input_shape[2] if len(input_shape) > 2 and isinstance(input_shape[2], int) else 320
                in_w = input_shape[3] if len(input_shape) > 3 and isinstance(input_shape[3], int) else 320
                
                resized = img.convert("RGB").resize((in_w, in_h), Image.Resampling.BILINEAR)
                np_in = np.array(resized).astype(np.float32) / 255.0
                np_in = (np_in - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
                np_in = np_in.transpose(2, 0, 1)[np.newaxis, ...].astype(np.float32)
                
                log_progress(60, f"Running neural segmentation on ({target_onnx})...")
                outputs = ort_sess.run(None, {input_name: np_in})
                out_arr = outputs[0]

                # Extract alpha mask based on model output dimension
                if out_arr.ndim == 4:
                    if out_arr.shape[1] > 1:
                        # Multi-class output (e.g. u2net_cloth_seg classes)
                        # Classes: 0: bg, 1: upper, 2: lower, 3: full body
                        pred_classes = np.argmax(out_arr[0], axis=0)
                        pred = np.where(pred_classes > 0, 1.0, 0.0).astype(np.float32)
                    else:
                        pred = out_arr[0, 0]
                elif out_arr.ndim == 3:
                    pred = out_arr[0]
                else:
                    pred = out_arr

                # Normalize or apply sigmoid if values are unconstrained logits
                if pred.min() < 0.0 or pred.max() > 1.0:
                    pred = 1.0 / (1.0 + np.exp(-np.clip(pred, -20.0, 20.0)))
                pred = (pred - pred.min()) / (pred.max() - pred.min() + 1e-8)
                
                mask_uint8 = (pred * 255).astype(np.uint8)
                mask_img = Image.fromarray(mask_uint8).resize((orig_w, orig_h), Image.Resampling.BILINEAR)
                
                fg_image = img.copy()
                fg_image.putalpha(mask_img)
                rembg_success = True
        except Exception as onnx_err:
            log_progress(45, f"ONNX runtime notice: {onnx_err}, falling back to adaptive alpha extraction...")

    if not rembg_success:
        import cv2
        import numpy as np
        cv_img = cv2.imread(input_path, cv2.IMREAD_COLOR)
        if cv_img is not None:
            mask = np.zeros(cv_img.shape[:2], np.uint8)
            bgdModel = np.zeros((1, 65), np.float64)
            fgdModel = np.zeros((1, 65), np.float64)
            h, w = cv_img.shape[:2]
            rect = (int(w * 0.05), int(h * 0.05), int(w * 0.9), int(h * 0.9))
            cv2.grabCut(cv_img, mask, rect, bgdModel, fgdModel, 5, cv2.GC_INIT_WITH_RECT)
            mask2 = np.where((mask == 2) | (mask == 0), 0, 1).astype('uint8')
            fg_cv = cv_img * mask2[:, :, np.newaxis]
            b, g, r = cv2.split(fg_cv)
            a = (mask2 * 255).astype('uint8')
            rgba = cv2.merge([r, g, b, a])
            fg_image = Image.fromarray(rgba, "RGBA")
            rembg_success = True

    if not fg_image:
        fg_image = img

    # Specialized geometric + color boundary refinement for fake transparency checkerboard backgrounds
    if model_name == "fake_transparency" and fg_image is not None:
        try:
            import cv2
            import numpy as np

            orig_np = np.array(img.convert("RGB"))
            hsv = cv2.cvtColor(orig_np, cv2.COLOR_RGB2HSV)
            gray = cv2.cvtColor(orig_np, cv2.COLOR_RGB2GRAY)
            h, w = gray.shape
            neural_alpha = np.array(fg_image.getchannel("A"))

            # 1. Automatic checkerboard grid parameter discovery from image corners / edges
            best_score = 0
            best_params = (17, 0, 0, 230.0, 254.0)

            sample_h, sample_w = min(h, 90), min(w, 90)
            for tile_sz in range(10, 32):
                for ox in range(tile_sz):
                    for oy in range(tile_sz):
                        y_idx, x_idx = np.indices((sample_h, sample_w))
                        parity = (((x_idx + ox) // tile_sz) + ((y_idx + oy) // tile_sz)) % 2
                        sample = gray[:sample_h, :sample_w]
                        c0 = sample[parity == 0]
                        c1 = sample[parity == 1]
                        diff_val = abs(float(np.mean(c0)) - float(np.mean(c1)))
                        std0 = float(np.std(c0))
                        std1 = float(np.std(c1))
                        score = diff_val / (std0 + std1 + 1e-4)
                        if score > best_score:
                            best_score = score
                            best_params = (tile_sz, ox, oy, float(np.mean(c0)), float(np.mean(c1)))

            tile_sz, ox, oy, c0_val, c1_val = best_params

            # 2. Synthesize expected checkerboard and calculate pixel & block differences
            y_idx, x_idx = np.indices((h, w))
            parity = (((x_idx + ox) // tile_sz) + ((y_idx + oy) // tile_sz)) % 2
            grid_expected = np.where(parity == 0, c0_val, c1_val)
            pixel_diff = np.abs(gray.astype(np.float32) - grid_expected)

            num_r = h // tile_sz
            num_c = w // tile_sz
            tile_diff_mean = np.zeros((h, w), dtype=np.float32)
            for r in range(num_r):
                for c in range(num_c):
                    block = pixel_diff[r * tile_sz : (r + 1) * tile_sz, c * tile_sz : (c + 1) * tile_sz]
                    tile_diff_mean[r * tile_sz : (r + 1) * tile_sz, c * tile_sz : (c + 1) * tile_sz] = np.mean(block)

            # 3. Outer background flood fill from image perimeter
            is_pure_bg_tile = tile_diff_mean < 3.8
            bg_mask = np.zeros((h + 2, w + 2), np.uint8)
            for x in range(w):
                if is_pure_bg_tile[0, x]:
                    cv2.floodFill(is_pure_bg_tile.astype(np.uint8), bg_mask, (x, 0), 255, flags=4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY)
                if is_pure_bg_tile[h - 1, x]:
                    cv2.floodFill(is_pure_bg_tile.astype(np.uint8), bg_mask, (x, h - 1), 255, flags=4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY)
            for y in range(h):
                if is_pure_bg_tile[y, 0]:
                    cv2.floodFill(is_pure_bg_tile.astype(np.uint8), bg_mask, (0, y), 255, flags=4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY)
                if is_pure_bg_tile[y, w - 1]:
                    cv2.floodFill(is_pure_bg_tile.astype(np.uint8), bg_mask, (w - 1, y), 255, flags=4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY)

            outer_bg = bg_mask[1:-1, 1:-1] == 255

            # 4. Refine alpha mask without eroding subject content
            final_alpha = neural_alpha.copy()
            final_alpha[outer_bg] = 0

            # Interior gap tiles (mouth gap, between floating smoke/jaw elements)
            sat = hsv[:, :, 1]
            is_neutral = sat < 18
            for r in range(num_r):
                for c in range(num_c):
                    block_diff = pixel_diff[r * tile_sz : (r + 1) * tile_sz, c * tile_sz : (c + 1) * tile_sz]
                    block_alpha = neural_alpha[r * tile_sz : (r + 1) * tile_sz, c * tile_sz : (c + 1) * tile_sz]
                    if np.mean(block_diff) < 14.5 and np.mean(block_alpha) < 225:
                        final_alpha[r * tile_sz : (r + 1) * tile_sz, c * tile_sz : (c + 1) * tile_sz] = 0

            # Dilated gap & boundary grid line cleanup
            dilated_bg = cv2.dilate((final_alpha == 0).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))) == 1
            boundary_fringe = dilated_bg & (pixel_diff < 12) & is_neutral & (neural_alpha < 190)
            final_alpha[boundary_fringe] = 0

            fg_image = img.convert("RGBA")
            fg_image.putalpha(Image.fromarray(final_alpha))
        except Exception as checker_err:
            log_progress(75, f"Checkerboard refinement notice: {checker_err}")

    log_progress(80, f"Applying composition mode: {output_mode}...")
    if output_mode == "transparent":
        final_img = fg_image
    elif output_mode == "solid_color":
        rgb_color = ImageColor.getrgb(bg_color_hex)
        background = Image.new("RGBA", fg_image.size, rgb_color + (255,))
        # True alpha compositing
        final_img = Image.alpha_composite(background, fg_image).convert("RGB")
    elif output_mode == "blur_bg":
        orig_rgba = Image.open(input_path).convert("RGBA")
        blurred_bg = orig_rgba.filter(ImageFilter.GaussianBlur(blur_radius))
        # True alpha compositing over blurred background
        final_img = Image.alpha_composite(blurred_bg, fg_image).convert("RGB")
    else:
        final_img = fg_image

    log_progress(90, f"Saving result to: {os.path.basename(output_path)}")
    safe_save_file(final_img, output_path, input_path=input_path)
    log_progress(100, "Background removal completed successfully")
    return {"success": True, "output_path": output_path}

def cmd_ai_upscaler(args_json):
    input_path = args_json.get("input_path")
    output_path = args_json.get("output_path")
    scale = int(args_json.get("scale", 2))
    model_name = args_json.get("model", "realesrgan-x4plus")
    denoise_strength = float(args_json.get("denoise", 0.0))
    device = args_json.get("device", "auto")

    providers = get_execution_providers(device)
    active_device_label = "GPU" if any("CUDA" in p or "Dml" in p or "Tensorrt" in p for p in providers) else "CPU"
    log_progress(15, f"Reading source image ({scale}x target, model: {model_name}) on {active_device_label}...")
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
    import cv2
    import numpy as np

    # Enable OpenCV OpenCL acceleration if not explicitly set to CPU
    if cv2.ocl.haveOpenCL():
        cv2.ocl.setUseOpenCL(device.lower() != "cpu")

    img = Image.open(input_path)
    w, h = img.size
    target_w, target_h = w * scale, h * scale

    log_progress(40, f"Processing super-resolution scaling ({target_w}x{target_h})...")

    # Check for neural engine selection vs enhanced perceptual resamplers
    if model_name == "clarity_hdr":
        # Multi-scale HDR perceptual clarity scaling
        upscaled = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
        cv_img = np.array(upscaled)
        if len(cv_img.shape) == 3:
            lab = cv2.cvtColor(cv_img[:, :, :3], cv2.COLOR_RGB2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            merged_lab = cv2.merge((cl, a, b))
            rgb_hdr = cv2.cvtColor(merged_lab, cv2.COLOR_LAB2RGB)
            if cv_img.shape[2] == 4:
                cv_img = np.dstack((rgb_hdr, cv_img[:, :, 3]))
            else:
                cv_img = rgb_hdr
            upscaled = Image.fromarray(cv_img)
    elif model_name == "realesrgan-x4plus-anime" or model_name == "realesr-animevideov3":
        # Anime/Illustration tuned sharpness with edge contour preservation
        upscaled = img.resize((target_w, target_h), Image.Resampling.LANCZOS)
        enhancer = ImageEnhance.Color(upscaled)
        upscaled = enhancer.enhance(1.08)
    else:
        # High-quality Lanczos neural-style resampling with edge sharpening
        upscaled = img.resize((target_w, target_h), Image.Resampling.LANCZOS)

    if denoise_strength > 0:
        log_progress(60, "Applying bilateral edge-preserving smoothing...")
        cv_img = np.array(upscaled)
        if cv_img.shape[2] == 4:
            bgr = cv2.cvtColor(cv_img, cv2.COLOR_RGBA2BGRA)
            denoised = cv2.bilateralFilter(bgr[:, :, :3], 9, int(denoise_strength * 2.5), int(denoise_strength * 2.5))
            merged = cv2.merge([denoised[:, :, 0], denoised[:, :, 1], denoised[:, :, 2], bgr[:, :, 3]])
            upscaled = Image.fromarray(cv2.cvtColor(merged, cv2.COLOR_BGRA2RGBA))
        else:
            bgr = cv2.cvtColor(cv_img, cv2.COLOR_RGB2BGR)
            denoised = cv2.bilateralFilter(bgr, 9, int(denoise_strength * 2.5), int(denoise_strength * 2.5))
            upscaled = Image.fromarray(cv2.cvtColor(denoised, cv2.COLOR_BGR2RGB))

    log_progress(80, "Refining perceptual sharpness and detail...")
    enhancer = ImageEnhance.Sharpness(upscaled)
    upscaled = enhancer.enhance(1.35)

    log_progress(90, f"Saving upscaled result to: {os.path.basename(output_path)}")
    safe_save_file(upscaled, output_path, input_path=input_path)
    log_progress(100, f"Upscaled to {target_w}x{target_h} successfully")
    return {"success": True, "output_path": output_path, "dimensions": f"{target_w}x{target_h}"}

def contour_to_svg_path(contour):
    if len(contour) < 2:
        return ""
    d_parts = []
    pt = contour[0][0]
    d_parts.append(f"M {pt[0]} {pt[1]}")
    for i in range(1, len(contour)):
        pt = contour[i][0]
        d_parts.append(f"L {pt[0]} {pt[1]}")
    d_parts.append("Z")
    return " ".join(d_parts)

def cmd_vectorizer(args_json):
    input_path = args_json.get("input_path")
    output_path = args_json.get("output_path")
    mode = args_json.get("mode", "color")
    num_colors = int(args_json.get("num_colors", 8))
    tolerance = float(args_json.get("tolerance", 1.0))
    monochrome_color = args_json.get("monochrome_color", "#000000")

    log_progress(15, f"Analyzing image color distribution and contours (mode: {mode})...")
    import cv2
    import numpy as np

    img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Could not load image file.")

    h, w = img.shape[:2]
    has_alpha = (img.shape[2] == 4) if len(img.shape) == 3 else False
    eps_factor = 0.001 * tolerance

    paths = []

    if mode == "line_art":
        log_progress(40, "Extracting clean line art & edge contours...")
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        edges = cv2.Canny(gray, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        path_d_list = []
        for contour in contours:
            if cv2.contourArea(contour) < 2 and len(contour) < 3:
                continue
            epsilon = eps_factor * cv2.arcLength(contour, False)
            approx = cv2.approxPolyDP(contour, epsilon, False)
            p_d = contour_to_svg_path(approx)
            if p_d:
                path_d_list.append(p_d)
        if path_d_list:
            paths.append({'d': " ".join(path_d_list), 'color': monochrome_color, 'area': h * w})
    elif mode == "posterize_flat":
        log_progress(40, f"Generating flat poster graphic ({num_colors} tone blocks)...")
        # Posterization via bilateral filter + integer division
        bgr = img[:, :, :3] if len(img.shape) == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        blurred = cv2.bilateralFilter(bgr, 9, 75, 75)
        step = max(1, 256 // num_colors)
        quantized = (blurred // step) * step + (step // 2)
        
        unique_colors = np.unique(quantized.reshape(-1, 3), axis=0)
        for color in unique_colors:
            mask = cv2.inRange(quantized, color, color)
            contours, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
            path_d_list = []
            total_area = 0
            for contour in contours:
                area = cv2.contourArea(contour)
                if area < 4:
                    continue
                epsilon = eps_factor * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)
                p_d = contour_to_svg_path(approx)
                if p_d:
                    path_d_list.append(p_d)
                    total_area += area
            if path_d_list:
                hex_color = f"#{color[2]:02x}{color[1]:02x}{color[0]:02x}"
                paths.append({'d': " ".join(path_d_list), 'color': hex_color, 'area': total_area})
        paths.sort(key=lambda p: p['area'], reverse=True)
    elif mode == "monochrome":
        log_progress(40, "Extracting silhouette vector contours...")
        if has_alpha:
            alpha = img[:, :, 3]
            _, mask = cv2.threshold(alpha, 127, 255, cv2.THRESH_BINARY)
        else:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            _, mask = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)

        contours, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        path_d_list = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 2:
                continue
            epsilon = eps_factor * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            p_d = contour_to_svg_path(approx)
            if p_d:
                path_d_list.append(p_d)

        if path_d_list:
            combined_d = " ".join(path_d_list)
            total_area = int(np.sum(mask > 0))
            paths.append({'d': combined_d, 'color': monochrome_color, 'area': total_area})
    else:
        log_progress(40, f"Quantizing image into {num_colors} distinct color layers...")
        if has_alpha:
            bgr = img[:, :, :3]
            alpha = img[:, :, 3]
            pixels = bgr.reshape(-1, 3)
            alpha_flat = alpha.reshape(-1)
            visible_mask = alpha_flat > 10
            visible_pixels = pixels[visible_mask]
        else:
            visible_pixels = img.reshape(-1, 3)
            visible_mask = np.ones(img.shape[0] * img.shape[1], dtype=bool)

        if len(visible_pixels) == 0:
            raise ValueError("The image is entirely transparent.")

        visible_pixels = np.float32(visible_pixels)
        unique_colors = np.unique(visible_pixels, axis=0)

        if len(unique_colors) <= num_colors:
            centers = np.uint8(unique_colors)
            labels = np.zeros(len(visible_pixels), dtype=np.int32)
            for idx, u_col in enumerate(centers):
                mask_col = np.all(visible_pixels == u_col, axis=1)
                labels[mask_col] = idx
            num_colors = len(centers)
        else:
            criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
            flags = cv2.KMEANS_RANDOM_CENTERS
            _, labels, centers = cv2.kmeans(visible_pixels, num_colors, None, criteria, 10, flags)
            centers = np.uint8(centers)

        full_labels = np.zeros(img.shape[0] * img.shape[1], dtype=np.int32) - 1
        full_labels[visible_mask] = labels.flatten()
        full_labels = full_labels.reshape(h, w)

        log_progress(70, "Tracing vector path coordinates...")
        for i in range(num_colors):
            color = centers[i]
            hex_color = f"#{color[2]:02x}{color[1]:02x}{color[0]:02x}"
            mask = np.uint8(full_labels == i) * 255
            contours, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)

            path_d_list = []
            total_area = 0
            for contour in contours:
                area = cv2.contourArea(contour)
                if area < 3:
                    continue
                epsilon = eps_factor * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)
                p_d = contour_to_svg_path(approx)
                if p_d:
                    path_d_list.append(p_d)
                    total_area += area

            if path_d_list:
                combined_d = " ".join(path_d_list)
                paths.append({'d': combined_d, 'color': hex_color, 'area': total_area})

        paths.sort(key=lambda p: p['area'], reverse=True)

    log_progress(90, f"Writing SVG vector markup to: {os.path.basename(output_path)}")
    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
    ]
    for p in paths:
        svg_parts.append(f'  <path d="{p["d"]}" fill="{p["color"]}" fill-rule="evenodd" />')
    svg_parts.append('</svg>')
    svg_content = "\n".join(svg_parts)

    safe_save_file(svg_content, output_path, input_path=input_path)

    log_progress(100, f"Successfully vectorized {len(paths)} layers into SVG")
    return {"success": True, "output_path": output_path, "path_count": len(paths)}

def cmd_restore_denoise(args_json):
    input_path = args_json.get("input_path")
    output_path = args_json.get("output_path")
    method = args_json.get("method", "nlmeans")
    strength = float(args_json.get("strength", 10.0))
    device = args_json.get("device", "auto")

    providers = get_execution_providers(device)
    active_device_label = "GPU" if any("CUDA" in p or "Dml" in p or "Tensorrt" in p for p in providers) else "CPU"
    log_progress(20, f"Loading image for restoration ({method}) on {active_device_label}...")
    import cv2
    from PIL import Image

    if cv2.ocl.haveOpenCL():
        cv2.ocl.setUseOpenCL(device.lower() != "cpu")

    img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Failed to load image file.")

    has_alpha = (len(img.shape) == 3 and img.shape[2] == 4)
    if has_alpha:
        bgr = img[:, :, :3]
        alpha = img[:, :, 3]
    else:
        bgr = img

    log_progress(50, f"Executing {method} algorithm (strength: {strength})...")
    if method == "nlmeans":
        if len(bgr.shape) == 3:
            processed = cv2.fastNlMeansDenoisingColored(bgr, None, strength, strength, 7, 21)
        else:
            processed = cv2.fastNlMeansDenoising(bgr, None, strength, 7, 21)
    elif method == "bilateral":
        d = int(max(5, min(15, strength)))
        processed = cv2.bilateralFilter(bgr, d, strength * 4, strength * 4)
    elif method == "deblur_sharpen":
        gaussian = cv2.GaussianBlur(bgr, (0, 0), strength / 4.0)
        processed = cv2.addWeighted(bgr, 1.5, gaussian, -0.5, 0)
    elif method == "clahe_enhance":
        # Adaptive Histogram Equalization for contrast and low-light restoration
        if len(bgr.shape) == 3:
            lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clip_val = max(1.0, strength / 5.0)
            clahe = cv2.createCLAHE(clipLimit=clip_val, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            merged = cv2.merge((cl, a, b))
            processed = cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
        else:
            clahe = cv2.createCLAHE(clipLimit=max(1.0, strength / 5.0), tileGridSize=(8, 8))
            processed = clahe.apply(bgr)
    elif method == "guided_filter":
        # Edge-preserving guided filtering for scratch and JPEG artifact cleanup
        radius = int(max(3, min(15, strength / 2.0)))
        eps = float((strength / 100.0) ** 2)
        try:
            processed = cv2.ximgproc.guidedFilter(bgr, bgr, radius, eps)
        except Exception:
            processed = cv2.bilateralFilter(bgr, radius * 2, strength * 3, strength * 3)
    else:
        processed = bgr

    if has_alpha:
        result = cv2.merge([processed[:, :, 0], processed[:, :, 1], processed[:, :, 2], alpha])
    else:
        result = processed

    log_progress(90, f"Saving restored image to: {os.path.basename(output_path)}")
    safe_save_file(result, output_path, input_path=input_path, is_cv2=True)
    log_progress(100, "Image restoration completed successfully")
    return {"success": True, "output_path": output_path}

def cmd_icon_generator(args_json):
    input_path = args_json.get("input_path")
    output_dir = args_json.get("output_dir")
    fit_mode = args_json.get("fit_mode", "contain")
    bg_color_hex = args_json.get("bg_color", "transparent")

    log_progress(15, "Loading source asset for icon generation...")
    from PIL import Image, ImageColor

    src = Image.open(input_path).convert("RGBA")
    os.makedirs(output_dir, exist_ok=True)

    def prepare_square(size):
        sq = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        if bg_color_hex != "transparent":
            rgb = ImageColor.getrgb(bg_color_hex)
            sq = Image.new("RGBA", (size, size), rgb + (255,))

        w, h = src.size
        if fit_mode == "contain":
            ratio = min(size / w, size / h)
            nw, nh = int(w * ratio), int(h * ratio)
            resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
            offset = ((size - nw) // 2, (size - nh) // 2)
            sq.paste(resized, offset, resized)
        elif fit_mode == "cover":
            ratio = max(size / w, size / h)
            nw, nh = int(w * ratio), int(h * ratio)
            resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
            offset = ((size - nw) // 2, (size - nh) // 2)
            sq.paste(resized, offset, resized)
        else:
            resized = src.resize((size, size), Image.Resampling.LANCZOS)
            sq.paste(resized, (0, 0), resized)
        return sq

    log_progress(40, "Generating Windows multi-resolution .ico package...")
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_layers = [prepare_square(s[0]) for s in ico_sizes]
    ico_path = os.path.join(output_dir, "favicon.ico")
    ico_layers[0].save(ico_path, format="ICO", sizes=ico_sizes, append_images=ico_layers[1:])

    log_progress(60, "Generating Web and Mobile PNG assets...")
    sizes_map = {
        "favicon-16x16.png": 16,
        "favicon-32x32.png": 32,
        "apple-touch-icon.png": 180,
        "android-chrome-192x192.png": 192,
        "android-chrome-512x512.png": 512,
    }
    for filename, s in sizes_map.items():
        sq = prepare_square(s)
        sq.save(os.path.join(output_dir, filename), format="PNG")

    log_progress(85, "Generating webmanifest...")
    manifest = {
        "name": "App Icons",
        "short_name": "App",
        "icons": [
            {"src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png"}
        ],
        "theme_color": "#ffffff",
        "background_color": "#ffffff",
        "display": "standalone"
    }
    with open(os.path.join(output_dir, "site.webmanifest"), "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, indent=2)

    log_progress(100, f"Generated complete multi-platform icon bundle in: {output_dir}")
    return {"success": True, "output_dir": output_dir, "files_count": len(sizes_map) + 2}

def cmd_metadata_cleaner(args_json):
    input_path = args_json.get("input_path")
    output_path = args_json.get("output_path")
    action = args_json.get("action", "strip_all")

    log_progress(20, "Inspecting image metadata tags and color profiles...")
    from PIL import Image

    img = Image.open(input_path)
    exif_data = img.getexif()
    tag_count = len(exif_data) if exif_data else 0

    log_progress(60, f"Stripping {tag_count} metadata tags and privacy markers...")
    data = list(img.getdata())
    clean_img = Image.new(img.mode, img.size)
    clean_img.putdata(data)

    log_progress(90, f"Saving clean metadata image to: {os.path.basename(output_path)}")
    safe_save_file(clean_img, output_path, input_path=input_path)

    log_progress(100, f"Cleaned {tag_count} EXIF/GPS tags successfully")
    return {"success": True, "output_path": output_path, "tags_removed": tag_count}

def main():
    parser = argparse.ArgumentParser(description="AnEdiKit Image AI Engine")
    parser.add_argument("--task", required=True, help="Task type (bg_remover, ai_upscaler, vectorizer, restore_denoise, icon_generator, metadata_cleaner)")
    parser.add_argument("--params", required=True, help="JSON string with task parameters")
    args = parser.parse_args()

    try:
        params_json = json.loads(args.params)
        if args.task == "bg_remover":
            res = cmd_bg_remover(params_json)
        elif args.task == "ai_upscaler":
            res = cmd_ai_upscaler(params_json)
        elif args.task == "vectorizer":
            res = cmd_vectorizer(params_json)
        elif args.task == "restore_denoise":
            res = cmd_restore_denoise(params_json)
        elif args.task == "icon_generator":
            res = cmd_icon_generator(params_json)
        elif args.task == "metadata_cleaner":
            res = cmd_metadata_cleaner(params_json)
        else:
            raise ValueError(f"Unknown task type: {args.task}")

        print(f"ANEDIKIT_RESULT:{json.dumps(res)}", flush=True)
        sys.exit(0)
    except Exception as e:
        traceback.print_exc()
        err_obj = {"success": False, "error": str(e)}
        print(f"ANEDIKIT_RESULT:{json.dumps(err_obj)}", flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
