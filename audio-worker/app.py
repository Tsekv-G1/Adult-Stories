import ipaddress, os, shutil, socket, subprocess, tempfile, uuid
from pathlib import Path
from urllib.parse import urlparse

import requests
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

app = FastAPI(title="Adult Stories Audio Processor", docs_url=None, redoc_url=None)
MAX_INPUT = 60 * 1024 * 1024
MAX_PARTS = 20

def run(args, timeout=600):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if result.returncode:
        raise RuntimeError("ffmpeg_processing_failed")
    return result

def duration(path):
    result = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)], 60)
    try:
        return max(0.0, float(result.stdout.decode().strip()))
    except Exception as exc:
        raise RuntimeError("audio_duration_unavailable") from exc

def valid_presigned(url):
    parsed = urlparse(url)
    return parsed.scheme == "https" and parsed.hostname and parsed.hostname.endswith(".r2.cloudflarestorage.com") and "X-Amz-Signature=" in parsed.query

def upload(url, path):
    if not valid_presigned(url):
        raise RuntimeError("invalid_upload_target")
    with open(path, "rb") as handle:
        response = requests.put(url, data=handle, headers={"Content-Type": "audio/mpeg"}, timeout=300)
    if response.status_code // 100 != 2:
        raise RuntimeError("r2_upload_failed")

def safe_source(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
        return False
    try:
        addresses = {ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)}
        return bool(addresses) and all(address.is_global for address in addresses)
    except Exception:
        return False

def download_source(url, path):
    if not safe_source(url):
        raise HTTPException(400, "invalid_audio_source")
    try:
        with requests.get(url, stream=True, timeout=(10, 60), allow_redirects=False) as response:
            if response.status_code != 200:
                raise HTTPException(422, "audio_source_unavailable")
            length = int(response.headers.get("content-length", "0") or 0)
            if length > MAX_INPUT:
                raise HTTPException(413, "audio_too_large")
            size = 0
            with open(path, "wb") as target:
                for chunk in response.iter_content(1024 * 1024):
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > MAX_INPUT:
                        raise HTTPException(413, "audio_too_large")
                    target.write(chunk)
            if not size:
                raise HTTPException(422, "audio_source_unavailable")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, "audio_source_unavailable") from exc

@app.get("/health")
def health():
    return {"ok": True, "processor": "ffmpeg"}

@app.post("/process")
async def process(
    upload_full_url: str = Form(...),
    upload_preview_url: str = Form(...),
    preview_seconds: int = Form(60),
    voice_chunks: list[UploadFile] = File(...),
    background_music: UploadFile = File(...),
    authorization: str = Header(default=""),
):
    expected = os.environ.get("AUDIO_PROCESSOR_TOKEN", "")
    if not expected or authorization != f"Bearer {expected}":
        raise HTTPException(401, "unauthorized")
    if not valid_presigned(upload_full_url) or not valid_presigned(upload_preview_url):
        raise HTTPException(400, "invalid_upload_target")
    if not 1 <= len(voice_chunks) <= MAX_PARTS or not 15 <= preview_seconds <= 180:
        raise HTTPException(400, "invalid_audio_request")
    with tempfile.TemporaryDirectory(prefix="adult-audio-") as temp:
        root = Path(temp)
        inputs = []
        total = 0
        for index, item in enumerate(voice_chunks):
            target = root / f"voice-{index:02d}.mp3"
            content = await item.read(MAX_INPUT + 1)
            total += len(content)
            if not content or total > MAX_INPUT:
                raise HTTPException(413, "audio_too_large")
            target.write_bytes(content)
            inputs.append(target)
        music_path = root / "music-input"
        music_data = await background_music.read(20 * 1024 * 1024 + 1)
        if not music_data or len(music_data) > 20 * 1024 * 1024:
            raise HTTPException(413, "music_too_large")
        music_path.write_bytes(music_data)

        concat = root / "voice-list.txt"
        concat.write_text("\n".join(f"file '{path}'" for path in inputs), encoding="utf-8")
        voice = root / "voice.mp3"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-vn", "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", str(voice)])
        voice_duration = duration(voice)
        if voice_duration < 2:
            raise HTTPException(422, "voice_audio_too_short")

        master = root / "master.mp3"
        music_volume = os.environ.get("BACKGROUND_MUSIC_VOLUME", "0.10")
        try:
            music_volume = min(0.25, max(0.03, float(music_volume)))
        except ValueError:
            music_volume = 0.10
        fade_start = max(0.0, voice_duration - 2.5)
        filt = f"[1:a]volume={music_volume},afade=t=out:st={fade_start}:d=2.5[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-18:TP=-1.0:LRA=11[out]"
        run(["ffmpeg", "-y", "-i", str(voice), "-stream_loop", "-1", "-i", str(music_path), "-filter_complex", filt, "-map", "[out]", "-t", f"{voice_duration:.3f}", "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", str(master)])
        actual_preview = min(float(preview_seconds), voice_duration)
        preview = root / "preview.mp3"
        preview_fade = min(1.5, actual_preview / 4)
        preview_start = max(0.0, actual_preview - preview_fade)
        run(["ffmpeg", "-y", "-i", str(master), "-t", f"{actual_preview:.3f}", "-af", f"afade=t=out:st={preview_start}:d={preview_fade}", "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", str(preview)])
        upload(upload_full_url, master)
        upload(upload_preview_url, preview)
        return {"ok": True, "duration_seconds": round(voice_duration), "preview_seconds": round(actual_preview), "full_bytes": master.stat().st_size, "preview_bytes": preview.stat().st_size}

@app.post("/trim")
async def trim(
    source_url: str = Form(...),
    upload_preview_url: str = Form(...),
    start_seconds: float = Form(...),
    end_seconds: float = Form(...),
    authorization: str = Header(default=""),
):
    expected = os.environ.get("AUDIO_PROCESSOR_TOKEN", "")
    if not expected or authorization != f"Bearer {expected}":
        raise HTTPException(401, "unauthorized")
    if not valid_presigned(upload_preview_url):
        raise HTTPException(400, "invalid_upload_target")
    if not (0 <= start_seconds < end_seconds <= 86400) or not 5 <= end_seconds - start_seconds <= 180:
        raise HTTPException(400, "invalid_audio_range")
    with tempfile.TemporaryDirectory(prefix="adult-audio-crop-") as temp:
        root = Path(temp)
        source = root / "source-audio"
        preview = root / "preview.mp3"
        download_source(source_url, source)
        total = duration(source)
        if end_seconds > total:
            raise HTTPException(400, "invalid_audio_range")
        clip_length = end_seconds - start_seconds
        fade_out = min(0.4, clip_length / 6)
        fade_start = max(0.0, clip_length - fade_out)
        run(["ffmpeg", "-y", "-ss", f"{start_seconds:.3f}", "-i", str(source), "-t", f"{clip_length:.3f}", "-vn", "-af", f"afade=t=in:st=0:d=0.12,afade=t=out:st={fade_start:.3f}:d={fade_out:.3f}", "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", str(preview)], 300)
        upload(upload_preview_url, preview)
        return {"ok": True, "duration_seconds": round(clip_length, 2), "preview_bytes": preview.stat().st_size}
