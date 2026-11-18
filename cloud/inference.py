import math
from functools import lru_cache
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import Request, urlopen

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageChops, ImageFilter, ImageOps

from convert_model import export


CHECKPOINT_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/"
    "v0.2.1/RealESRGAN_x2plus.pth"
)
CHECKPOINT_SIZE = 67_061_725
TILE_SIZE = 288
TILE_PADDING = 16
MODEL_MAX_PIXELS = 560_000
MODEL_MAX_EDGE = 1_120
RESAMPLING = Image.Resampling.LANCZOS


@lru_cache(maxsize=1)
def model():
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.enable_mem_pattern = False
    options.add_session_config_entry("session.intra_op.allow_spinning", "0")

    with TemporaryDirectory(prefix="fileforge-model-") as directory:
        checkpoint = Path(directory) / "weights.pth"
        request = Request(CHECKPOINT_URL, headers={"User-Agent": "FileForge/1.4"})
        with urlopen(request, timeout=25) as response, checkpoint.open("wb") as destination:
            remaining = CHECKPOINT_SIZE
            while remaining:
                block = response.read(min(remaining, 1024 * 1024))
                if not block:
                    raise ValueError("Incomplete Real-ESRGAN checkpoint")
                destination.write(block)
                remaining -= len(block)
            if response.read(1):
                raise ValueError("Unexpected Real-ESRGAN checkpoint size")
        graph = Path(directory) / "x2plus.onnx"
        export(checkpoint, graph)
        return ort.InferenceSession(str(graph), sess_options=options, providers=["CPUExecutionProvider"])


def model_dimensions(width, height):
    factor = min(1, MODEL_MAX_EDGE / max(width, height), math.sqrt(MODEL_MAX_PIXELS / (width * height)))
    return max(1, int(width * factor)), max(1, int(height * factor))


def upscale_tiles(image, session):
    width, height = image.size
    pad = TILE_PADDING
    source = np.asarray(image)
    source = np.pad(source, ((pad, pad + height % 2), (pad, pad + width % 2), (0, 0)), mode="reflect")
    output = np.empty((height * 2, width * 2, 3), np.uint8)
    completed = 0

    for y in range(0, height, TILE_SIZE):
        for x in range(0, width, TILE_SIZE):
            w, h = min(TILE_SIZE, width - x), min(TILE_SIZE, height - y)
            pw, ph = w + 2 * pad + w % 2, h + 2 * pad + h % 2
            patch = source[y : y + ph, x : x + pw].transpose(2, 0, 1).astype(np.float32) / 255
            # RRDBNet takes a 2× pixel-unshuffled image in PyTorch channel order.
            pixels = patch.reshape(3, ph // 2, 2, pw // 2, 2).transpose(0, 2, 4, 1, 3)
            pixels = np.ascontiguousarray(pixels.reshape(1, 12, ph // 2, pw // 2))
            prediction, = session.run(None, {"pixels": pixels})
            center = prediction[0, :, pad * 2 : (pad + h) * 2, pad * 2 : (pad + w) * 2]
            output[y * 2 : (y + h) * 2, x * 2 : (x + w) * 2] = np.rint(
                np.clip(center.transpose(1, 2, 0), 0, 1) * 255
            ).astype(np.uint8)
            completed += w * h
            value = 0.19 + 0.66 * completed / (width * height)
            yield {"stage": "cloudAi", "value": round(value, 3)}

    return Image.fromarray(output)


def restore(image, scale, strength, denoise, contrast):
    width, height = image.size
    output_size = width * scale, height * scale
    original = image.resize(output_size, RESAMPLING) if scale != 1 else image
    if not strength and not contrast:
        return original

    alpha = image.getchannel("A")
    source_rgb = Image.composite(image.convert("RGB"), Image.new("RGB", image.size, "white"), alpha)
    work_size = model_dimensions(width, height)
    source_rgb = source_rgb.resize(work_size, RESAMPLING) if work_size != image.size else source_rgb
    restored = source_rgb
    if strength:
        yield {"stage": "cloudModel", "value": 0.13}
        session = model()
        if denoise:
            restored = Image.blend(source_rgb, source_rgb.filter(ImageFilter.MedianFilter(3)), denoise * 0.35)
        yield {"stage": "cloudAi", "value": 0.19}
        restored = yield from upscale_tiles(restored, session)

    # Transfer the restoration's luma changes to the original-size pixels.
    # Keep original chroma and avoid replacing a large photo with a resized proxy.
    work_output = work_size[0] * scale, work_size[1] * scale
    base_luma = source_rgb.convert("L").resize(work_output, RESAMPLING)
    new_luma = restored.convert("L").resize(work_output, RESAMPLING)
    new_luma = Image.blend(base_luma, new_luma, strength)
    if contrast:
        new_luma = Image.blend(new_luma, ImageOps.autocontrast(new_luma, cutoff=0.5), 0.2)
    residual = ImageChops.subtract(new_luma, base_luma, offset=128)
    residual = residual.resize(output_size, RESAMPLING).point(lambda value: max(72, min(184, value)))
    residual = Image.composite(residual, Image.new("L", output_size, 128), original.getchannel("A"))
    red, green, blue, alpha = original.split()
    channels = tuple(ImageChops.add(channel, residual, offset=-128) for channel in (red, green, blue))
    return Image.merge("RGBA", (*channels, alpha))
