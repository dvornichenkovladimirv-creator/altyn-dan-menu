"""Генерация фото для креативов через OpenAI Images API.

Запуск:  python3 tools/creatives/gen_photos.py content/03-loft-stol-karkas [имя ...]
Промпты берутся из <папка>/photos.json, результат — <папка>/photos/<имя>.jpg.
Уже сгенерированные фото пропускаются (удалите файл, чтобы перегенерировать).
Ключ: переменная OPENAI_API_KEY (в облачной сессии подставляет прокси).
"""
import base64
import io
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

MODEL = os.environ.get("IMAGE_MODEL", "gpt-image-2")
STYLE = (
    "Photorealistic commercial photograph, shot on a full-frame camera, natural "
    "materials, realistic imperfections, dark moody industrial loft mood, deep "
    "charcoal tones with warm wood accents. No text, no logos, no watermarks, no people."
)


def generate(name, spec, out_dir):
    out = out_dir / f"{name}.jpg"
    if out.exists():
        print(f"skip {name}")
        return
    body = {
        "model": MODEL,
        "prompt": f"{spec['prompt']}\n\n{STYLE}",
        "size": spec.get("size", "1024x1536"),
        "quality": spec.get("quality", "high"),
        "n": 1,
        # Потоковый режим: промежуточные кадры держат соединение живым,
        # иначе прокси рвёт запрос, который молчит дольше ~30 секунд.
        "stream": True,
        "partial_images": 3,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/images/generations",
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ.get('OPENAI_API_KEY', 'proxy')}",
        },
    )
    final = None
    with urllib.request.urlopen(req, timeout=600) as r:
        for line in r:
            if not line.startswith(b"data:"):
                continue
            event = json.loads(line[5:])
            if event.get("type", "").endswith(".completed"):
                final = event["b64_json"]
    if final is None:
        raise RuntimeError(f"{name}: no completed image in stream")
    Image.open(io.BytesIO(base64.b64decode(final))).convert("RGB").save(out, quality=92)
    print(f"ok   {name}")


def main():
    folder = Path(sys.argv[1])
    specs = json.loads((folder / "photos.json").read_text())
    only = sys.argv[2:]
    out_dir = folder / "photos"
    out_dir.mkdir(exist_ok=True)
    with ThreadPoolExecutor(4) as pool:
        futures = [
            pool.submit(generate, n, s, out_dir)
            for n, s in specs.items()
            if not only or n in only
        ]
        for f in futures:
            f.result()


if __name__ == "__main__":
    main()
