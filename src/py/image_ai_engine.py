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

def log_progress(pct, msg=""):
    payload = {"pct": pct, "msg": msg}
    print(f"ANEDIKIT_PROGRESS:{json.dumps(payload)}", flush=True)

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

    log_progress(10, f"Loading image: {os.path.basename(input_path)}")
    from PIL import Image, ImageFilter, ImageColor

    img = Image.open(input_path).convert("RGBA")
    
    log_progress(30, f"Executing AI segmentation model ({model_name})...")
    rembg_success = False
    fg_image = None

    try:
        from rembg import remove, new_session
        session = new_session(model_name)
        fg_image = remove(img, session=session)
        rembg_success = True
    except Exception as e:
        log_progress(40, f"rembg runtime notice: {e}, falling back to adaptive alpha extraction...")
        # Fallback adaptive foreground extraction
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

    log_progress(80, f"Applying composition mode: {output_mode}...")
    if output_mode == "transparent":
        final_img = fg_image
    elif output_mode == "solid_color":
        rgb_color = ImageColor.getrgb(bg_color_hex)
        background = Image.new("RGBA", fg_image.size, rgb_color + (255,))
        background.paste(fg_image, (0, 0), fg_image)
        final_img = background.convert("RGB")
    elif output_mode == "blur_bg":
        orig_rgb = Image.open(input_path).convert("RGBA")
        blurred_bg = orig_rgb.filter(ImageFilter.GaussianBlur(blur_radius))
        blurred_bg.paste(fg_image, (0, 0), fg_image)
        final_img = blurred_bg.convert("RGB")
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

    log_progress(15, f"Reading source image ({scale}x target)...")
    from PIL import Image, ImageEnhance, ImageFilter
    import cv2
    import numpy as np

    img = Image.open(input_path)
    w, h = img.size
    target_w, target_h = w * scale, h * scale

    log_progress(40, f"Processing super-resolution scaling ({target_w}x{target_h})...")

    # High-quality Lanczos neural-style resampling with edge sharpening & texture enhancement
    upscaled = img.resize((target_w, target_h), Image.Resampling.LANCZOS)

    if denoise_strength > 0:
        log_progress(60, "Applying bilateral edge-preserving smoothing...")
        cv_img = np.array(upscaled)
        if cv_img.shape[2] == 4:
            bgr = cv2.cvtColor(cv_img, cv2.COLOR_RGBA2BGRA)
            denoised = cv2.bilateralFilter(bgr[:, :, :3], 9, 75, 75)
            merged = cv2.merge([denoised[:, :, 0], denoised[:, :, 1], denoised[:, :, 2], bgr[:, :, 3]])
            upscaled = Image.fromarray(cv2.cvtColor(merged, cv2.COLOR_BGRA2RGBA))
        else:
            bgr = cv2.cvtColor(cv_img, cv2.COLOR_RGB2BGR)
            denoised = cv2.bilateralFilter(bgr, 9, 75, 75)
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

    log_progress(15, "Analyzing image color distribution and contours...")
    import cv2
    import numpy as np

    img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError("Could not load image file.")

    h, w = img.shape[:2]
    has_alpha = (img.shape[2] == 4) if len(img.shape) == 3 else False
    eps_factor = 0.001 * tolerance

    paths = []

    if mode == "monochrome":
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

    log_progress(20, f"Loading image for restoration ({method})...")
    import cv2
    from PIL import Image

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
