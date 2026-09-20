"""
Unit tests for AnEdiKit Image AI Engine (src/py/image_ai_engine.py).
Tests automatic model downloading, cache verification, directory synchronization,
and processing tasks.
"""

import os
import sys
import json
import unittest
import tempfile
import shutil
from unittest.mock import patch, MagicMock

# Add src/py to sys.path so image_ai_engine can be imported
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC_PY = os.path.join(PROJECT_ROOT, "src", "py")
if SRC_PY not in sys.path:
    sys.path.insert(0, SRC_PY)

import image_ai_engine as engine


class TestImageAIEngine(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="anedikit_test_")
        self.sample_img_path = os.path.join(PROJECT_ROOT, "test", "images", "sample_studio_portrait.png")
        if not os.path.exists(self.sample_img_path):
            self.sample_img_path = os.path.join(PROJECT_ROOT, "test", "images", "sample_studio_portrait.jpg")

    def tearDown(self):
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_rembg_model_urls_coverage(self):
        """Verify all standard UI model choices have mapped download URLs."""
        required_models = [
            "u2net",
            "u2netp",
            "u2net_human_seg",
            "u2net_cloth_seg",
            "isnet-general-use",
            "isnet-anime",
            "silueta",
            "birefnet-general",
            "birefnet-general-lite",
            "birefnet-portrait",
            "birefnet-dis",
            "birefnet-hrsod",
            "birefnet-cod",
            "birefnet-massive",
        ]
        for model in required_models:
            self.assertIn(model, engine.REMBG_MODEL_URLS, f"Missing URL mapping for model: {model}")
            url = engine.REMBG_MODEL_URLS[model]
            self.assertTrue(url.startswith("https://"), f"Invalid HTTPS URL for model {model}: {url}")

    def test_ensure_rembg_model_already_cached(self):
        """When a model is already present in cache (>100KB), ensure_rembg_model returns immediately without downloading."""
        fake_model_name = "test_mock_model"
        fake_onnx = f"{fake_model_name}.onnx"
        mock_dest = os.path.join(self.temp_dir, fake_onnx)
        
        # Write dummy model file > 100KB
        with open(mock_dest, "wb") as f:
            f.write(b"0" * 150000)

        with patch.object(engine, "bg_models_dir", self.temp_dir), \
             patch.object(engine, "download_model_file") as mock_dl:
            result = engine.ensure_rembg_model(fake_model_name)
            self.assertEqual(result, mock_dest)
            mock_dl.assert_not_called()

    def test_ensure_rembg_model_downloads_when_missing(self):
        """When a model is missing from cache, ensure_rembg_model triggers download_model_file."""
        fake_model_name = "u2net"
        fake_onnx = f"{fake_model_name}.onnx"
        mock_dest = os.path.join(self.temp_dir, fake_onnx)

        with patch.object(engine, "bg_models_dir", self.temp_dir), \
             patch("os.path.expanduser", return_value=self.temp_dir), \
             patch.object(engine, "download_model_file") as mock_dl:
            
            result = engine.ensure_rembg_model(fake_model_name)
            self.assertEqual(result, mock_dest)
            mock_dl.assert_called_once()
            args, _ = mock_dl.call_args
            self.assertEqual(args[0], engine.REMBG_MODEL_URLS["u2net"])
            self.assertEqual(args[1], mock_dest)

    def test_ensure_rembg_model_syncs_to_u2net_home(self):
        """Verify model file in bg_models_dir is synced to ~/.u2net if missing there."""
        fake_model_name = "test_sync_model"
        fake_onnx = f"{fake_model_name}.onnx"
        bg_dir = os.path.join(self.temp_dir, "bg_models")
        home_dir = os.path.join(self.temp_dir, "home_u2net")
        os.makedirs(bg_dir, exist_ok=True)
        os.makedirs(os.path.join(home_dir, ".u2net"), exist_ok=True)

        dest_file = os.path.join(bg_dir, fake_onnx)
        with open(dest_file, "wb") as f:
            f.write(b"X" * 120000)

        with patch.object(engine, "bg_models_dir", bg_dir), \
             patch("os.path.expanduser", return_value=home_dir):
            engine.ensure_rembg_model(fake_model_name)
            
            synced_file = os.path.join(home_dir, ".u2net", fake_onnx)
            self.assertTrue(os.path.exists(synced_file), "Model was not synchronized to ~/.u2net")
            self.assertEqual(os.path.getsize(synced_file), 120000)

    def test_download_model_file_mock_stream(self):
        """Test download_model_file writes data atomically and logs progress."""
        dest_path = os.path.join(self.temp_dir, "downloaded_model.onnx")
        mock_chunks = [b"chunk1" * 1000, b"chunk2" * 1000, b"chunk3" * 1000]

        mock_resp = MagicMock()
        mock_resp.headers.get.return_value = str(sum(len(c) for c in mock_chunks))
        mock_resp.read.side_effect = mock_chunks + [b""]
        mock_resp.__enter__.return_value = mock_resp
        mock_resp.__exit__.return_value = False

        with patch("urllib.request.urlopen", return_value=mock_resp), \
             patch.object(engine, "log_progress") as mock_log:
            
            result = engine.download_model_file("https://example.com/model.onnx", dest_path, "Test Model")
            self.assertEqual(result, dest_path)
            self.assertTrue(os.path.exists(dest_path))
            self.assertEqual(os.path.getsize(dest_path), sum(len(c) for c in mock_chunks))
            self.assertFalse(os.path.exists(dest_path + ".tmp_download"))
            self.assertTrue(mock_log.called)

    def test_cmd_bg_remover_execution(self):
        """Test bg_remover task execution produces an image output."""
        if not os.path.exists(self.sample_img_path):
            self.skipTest("Sample image not found")

        output_path = os.path.join(self.temp_dir, "nobg_output.png")
        params = {
            "input_path": self.sample_img_path,
            "output_path": output_path,
            "model": "u2net",
            "output_mode": "transparent",
            "bg_color": "#ffffff",
            "blur_radius": 25,
            "device": "cpu"
        }
        res = engine.cmd_bg_remover(params)
        self.assertTrue(res.get("success"))
        self.assertTrue(os.path.exists(res.get("output_path")))
        self.assertGreater(os.path.getsize(res.get("output_path")), 100)

    def test_cmd_ai_upscaler_execution(self):
        """Test ai_upscaler task execution."""
        if not os.path.exists(self.sample_img_path):
            self.skipTest("Sample image not found")

        output_path = os.path.join(self.temp_dir, "upscaled_output.png")
        params = {
            "input_path": self.sample_img_path,
            "output_path": output_path,
            "scale": 2,
            "model": "clarity_hdr",
            "denoise": 15,
            "device": "cpu"
        }
        res = engine.cmd_ai_upscaler(params)
        self.assertTrue(res.get("success"))
        self.assertTrue(os.path.exists(output_path))
        self.assertIn("dimensions", res)

    def test_cmd_vectorizer_execution(self):
        """Test vectorizer task produces SVG."""
        if not os.path.exists(self.sample_img_path):
            self.skipTest("Sample image not found")

        output_path = os.path.join(self.temp_dir, "vector_output.svg")
        params = {
            "input_path": self.sample_img_path,
            "output_path": output_path,
            "mode": "color",
            "num_colors": 4,
            "tolerance": 1.0,
            "monochrome_color": "#000000"
        }
        res = engine.cmd_vectorizer(params)
        self.assertTrue(res.get("success"))
        self.assertTrue(os.path.exists(output_path))
        with open(output_path, "r", encoding="utf-8") as f:
            content = f.read()
            self.assertTrue(content.startswith("<svg"))

    def test_cmd_metadata_cleaner_execution(self):
        """Test metadata_cleaner task cleans EXIF tags."""
        if not os.path.exists(self.sample_img_path):
            self.skipTest("Sample image not found")

        output_path = os.path.join(self.temp_dir, "clean_metadata.png")
        params = {
            "input_path": self.sample_img_path,
            "output_path": output_path,
            "action": "strip_all"
        }
        res = engine.cmd_metadata_cleaner(params)
        self.assertTrue(res.get("success"))
        self.assertTrue(os.path.exists(output_path))


if __name__ == "__main__":
    unittest.main()
