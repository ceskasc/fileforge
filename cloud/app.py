import json
import logging
import threading
from base64 import b64encode
from contextlib import closing
from io import BytesIO

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from inference import restore


ORIGINS = ["https://ceskasc.github.io", "http://localhost:8080", "http://127.0.0.1:8080"]
INPUT_BYTES = 4_000_000
INPUT_PIXELS = 24_000_000
OUTPUT_PIXELS = 16_000_000
OUTPUT_EDGE = 8_192
FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
HEADERS = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
SLOT = threading.BoundedSemaphore(1)
LOGGER = logging.getLogger("fileforge.cloud")

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["POST"], allow_headers=["Content-Type"])


@app.get("/api/health")
def health():
    return {"service": "fileforge", "model": "Real-ESRGAN x2plus", "protocol": 1}


def decode_image(data, content_type, scale):
    try:
        with Image.open(BytesIO(data), formats=[FORMATS[content_type]]) as source:
            if getattr(source, "is_animated", False):
                raise HTTPException(422, "ANIMATED")
            width, height = source.size
            if width * height > INPUT_PIXELS:
                raise HTTPException(413, "INPUT_PIXELS")
            if width * height * scale * scale > OUTPUT_PIXELS or max(width, height) * scale > OUTPUT_EDGE:
                raise HTTPException(413, "OUTPUT_PIXELS")
            image = ImageOps.exif_transpose(source).convert("RGBA")
            profile = source.info.get("icc_profile")
            if profile:
                try:
                    rgb = ImageCms.profileToProfile(image.convert("RGB"), BytesIO(profile), ImageCms.createProfile("sRGB"))
                    rgb.putalpha(image.getchannel("A"))
                    image = rgb
                except (ImageCms.PyCMSError, OSError, ValueError):
                    pass
            image.info.clear()
            return image
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(422, "INVALID_FILE") from exc


def line(record):
    return (json.dumps(record, separators=(",", ":")) + "\n").encode("ascii")


def process(image, scale, strength, denoise, contrast, output, quality, background):
    if not SLOT.acquire(blocking=False):
        yield {"error": "CLOUD_BUSY"}
        return

    try:
        result = yield from restore(image, scale, strength, denoise, contrast)
        yield {"stage": "encode", "value": 0.90}
        mime = f"image/{output}"
        if output == "jpeg":
            flattened = Image.new("RGB", result.size, background)
            flattened.paste(result, mask=result.getchannel("A"))
            result = flattened

        with BytesIO() as picture:
            result.save(picture, format=FORMATS[mime], quality=quality)
            size = picture.tell()
            picture.seek(0)
            while block := picture.read(48 * 1024):
                yield {"chunk": b64encode(block).decode("ascii")}
        yield {"result": {"width": result.width, "height": result.height,
                          "sourceWidth": image.width, "sourceHeight": image.height,
                          "type": mime, "bytes": size}}
    except Exception:
        LOGGER.exception("FileForge enhancement failed")
        yield {"error": "CLOUD_UNAVAILABLE"}
    finally:
        SLOT.release()


def response_lines(records):
    with closing(records):
        yield from (line(record) for record in records)


@app.post("/api/enhance")
async def enhance(
    request: Request,
    scale: int = Query(1, ge=1, le=2),
    strength: int = Query(90, ge=0, le=100),
    denoise: int = Query(0, ge=0, le=100),
    contrast: bool = False,
    output: str = Query("png", pattern="^(jpeg|png|webp)$"),
    quality: int = Query(100, ge=30, le=100),
    background: str = Query("#ffffff", pattern="^#[0-9a-fA-F]{6}$"),
):
    if request.headers.get("origin") not in ORIGINS:
        raise HTTPException(403, "CLOUD_UNAVAILABLE")
    content_type = request.headers.get("content-type", "").split(";", 1)[0]
    if content_type not in FORMATS:
        raise HTTPException(415, "UNSUPPORTED")

    body = bytearray()
    async for part in request.stream():
        if len(body) + len(part) > INPUT_BYTES:
            raise HTTPException(413, "CLOUD_FILE_SIZE")
        body.extend(part)

    image = await run_in_threadpool(decode_image, body, content_type, scale)
    del body
    return StreamingResponse(
        response_lines(process(image, scale, strength / 100, denoise / 100, contrast, output, quality, background)),
        media_type="application/x-ndjson", headers=HEADERS,
    )
