"""Карусель «Ограждение для площади»: 3 слайда в двух форматах.

Запуск:  python3 tools/creatives/render_fence.py
Фото — content/04-ograzhdenie-ploshchadi/photos/ (section.png — фото заказчика,
detail.jpg и row.jpg сделаны по нему через gen_photos.py).
Выход: instagram-N.png (1080×1350) и story-N.png (1080×1920: TikTok, WhatsApp, Stories).
"""
from pathlib import Path

from PIL import Image, ImageDraw

from render_loft import BG, LIGHT, M, MUTED, ORANGE, WHITE, button, cover, font, shade, text

DIR = Path(__file__).resolve().parents[2] / "content" / "04-ograzhdenie-ploshchadi"
PHOTOS = DIR / "photos"
BRAND = "ОГРАЖДЕНИЯ · КАРАГАНДА"

SPECS = [
    ("Стойки", "профильная труба 60×60 мм"),
    ("Поперечины", "профильная труба 60×40 мм"),
    ("Крест", "профильная труба 60×40 мм"),
    ("Покраска", "полимерная, не боится влаги и мороза"),
]


def canvas(photo, w, h, focus, stops):
    img = shade(cover(PHOTOS / photo, w, h, focus), stops)
    return img, ImageDraw.Draw(img, "RGBA")


def head(d, w, page=None):
    text(d, (M, 78), BRAND, font("SemiBold", 26), WHITE, "lm")
    if page:
        text(d, (w - M, 78), page, font("SemiBold", 26), WHITE, "rm")


def specs(d, y, step, size=36):
    for title, value in SPECS:
        d.rounded_rectangle((M, y - 34, M + 10, y + 10), radius=5, fill=ORANGE)
        text(d, (M + 34, y), title, font("Bold", size), WHITE, "ls")
        text(d, (M + 34, y + size + 8), value, font("Medium", size - 8), LIGHT, "ls")
        y += step


# ---------- 1. Секция целиком ----------

def slide1(w, h):
    if h == 1350:
        img, d = canvas("section.png", w, h, (0.5, 0.531), [(0, 0.7), (0.1, 0), (0.68, 0), (0.8, 0.85), (1, 0.95)])
        head(d, w, "1/3")
        text(d, (M, 1150), "Ограждение", font("ExtraBold", 96), WHITE, "ls")
        text(d, (M, 1230), "для площади", font("ExtraBold", 66), ORANGE, "ls")
        text(d, (M, 1295), "Профильная труба · полимерная покраска", font("Medium", 34), LIGHT, "ls")
    else:
        img, d = canvas("section.png", w, h, (0.5, 0.5), [(0, 0.95), (0.2, 0.85), (0.29, 0.2), (0.31, 0), (0.74, 0), (0.82, 0.85), (1, 0.95)])
        head(d, w)
        text(d, (540, 300), "Ограждение", font("ExtraBold", 112), WHITE, "ms")
        text(d, (540, 390), "для площади", font("ExtraBold", 76), ORANGE, "ms")
        text(d, (540, 1680), "Профильная труба", font("SemiBold", 46), WHITE, "ms")
        text(d, (540, 1745), "полимерная покраска", font("SemiBold", 46), WHITE, "ms")
        text(d, (540, 1850), "Листайте →", font("Bold", 34), LIGHT, "mm")
    return img


# ---------- 2. Из чего собрано ----------

def slide2(w, h):
    tall = h == 1920
    ph_h = 1060 if tall else 760
    img = Image.new("RGB", (w, h), BG)
    ph = shade(cover(PHOTOS / "detail.jpg", w, ph_h, (0.5, 0.42)), [(0, 0.85), (0.3, 0.2), (0.45, 0), (0.8, 0), (1, 1)])
    img.paste(ph, (0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    head(d, w, None if tall else "2/3")
    text(d, (M, 230 if tall else 210), "Из чего собрано", font("ExtraBold", 86 if tall else 80), WHITE, "ls")
    specs(d, 1160 if tall else 820, 150 if tall else 125, 40 if tall else 36)
    if tall:
        text(d, (540, 1850), "Листайте →", font("Bold", 34), LIGHT, "mm")
    return img


# ---------- 3. Под вашу площадку + CTA ----------

def slide3(w, h):
    if h == 1350:
        img, d = canvas("row.jpg", w, h, (0.5, 1.0), [(0, 0.95), (0.2, 0.85), (0.3, 0.3), (0.4, 0), (0.76, 0), (0.84, 0.9), (1, 0.95)])
        head(d, w, "3/3")
        text(d, (M, 220), "Под вашу площадку", font("ExtraBold", 78), WHITE, "ls")
        text(d, (M, 290), "любое число секций · цвет по RAL", font("ExtraBold", 48), ORANGE, "ls")
        text(d, (540, 1180), "Напишите, сколько секций нужно — посчитаем", font("SemiBold", 34), WHITE, "mm")
        button(d, 540, 1220, "Директ или WhatsApp →", font("ExtraBold", 50))
    else:
        img, d = canvas("row.jpg", w, h, (0.5, 0.5), [(0, 0.95), (0.25, 0.88), (0.34, 0.3), (0.42, 0), (0.8, 0), (0.86, 0.9), (1, 0.95)])
        head(d, w)
        text(d, (540, 300), "Под вашу", font("ExtraBold", 110), WHITE, "ms")
        text(d, (540, 400), "площадку", font("ExtraBold", 110), WHITE, "ms")
        text(d, (540, 480), "любое число секций · цвет по RAL", font("ExtraBold", 46), ORANGE, "ms")
        text(d, (540, 1700), "Напишите, сколько секций нужно — посчитаем", font("SemiBold", 36), WHITE, "mm")
        button(d, 540, 1745, "Написать в WhatsApp →", font("ExtraBold", 50))
    return img


def main():
    for i, fn in enumerate((slide1, slide2, slide3), 1):
        fn(1080, 1350).save(DIR / f"instagram-{i}.png", optimize=True)
        fn(1080, 1920).save(DIR / f"story-{i}.png", optimize=True)
        print("saved slide", i)


if __name__ == "__main__":
    main()
