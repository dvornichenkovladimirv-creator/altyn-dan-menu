"""Карусель «Пандус: 4 вопроса до заказа» на реальных фото заказчика.

Запуск:  python3 tools/creatives/render_ramp.py
Фото — content/05-pandus-4-voprosa/photos/ (ramp.jpg, stairs-public.jpg, porch-house.jpg).
Выход: instagram-1..5.png (1080×1350) и story-1..3.png (1080×1920: WhatsApp, TikTok, Stories).
"""
from pathlib import Path

from PIL import Image, ImageDraw

from render_loft import BG, LIGHT, M, MUTED, ORANGE, STEEL, WHITE, band, button, cover, font, shade, text

DIR = Path(__file__).resolve().parents[2] / "content" / "05-pandus-4-voprosa"
PHOTOS = DIR / "photos"
BRAND = "НЕРЖАВЕЙКА · КАРАГАНДА"
FOOTER = "Перила и пандусы из нержавейки · Караганда"


def photo(name):
    return str(PHOTOS / name)  # абсолютный путь: помощники render_loft ищут фото в своей папке


def canvas(name, w, h, focus, stops):
    img = shade(cover(photo(name), w, h, focus), stops)
    return img, ImageDraw.Draw(img, "RGBA")


def dark(w, h):
    img = Image.new("RGB", (w, h), BG)
    return img, ImageDraw.Draw(img, "RGBA")


def head(d, w, page=None):
    text(d, (M, 78), BRAND, font("SemiBold", 26), LIGHT, "lm")
    if page:
        text(d, (w - M, 78), page, font("SemiBold", 26), LIGHT, "rm")


def title(d, y, num, line1, line2, s1=84, s2=56):
    text(d, (M, y), f"{num}  {line1}" if num else line1, font("ExtraBold", s1), WHITE, "ls")
    text(d, (M, y + s2 + 24), line2, font("ExtraBold", s2), ORANGE, "ls")


def para(d, y, lines, size=34, color=LIGHT, step=None):
    for i, line in enumerate(lines):
        text(d, (M, y + i * (step or size + 14)), line, font("Medium", size), color, "ls")


def footer(d, w, h, active, total=3):
    for i in range(total):
        x = w // 2 - (total - 1) * 20 + i * 40
        d.ellipse((x - 8, h - 148, x + 8, h - 132), fill=ORANGE if i == active else (90, 92, 98))
    text(d, (w // 2, h - 80), FOOTER, font("Medium", 28), MUTED, "mm")


# ---------- Instagram 1080×1350 ----------

def ig1():
    img, d = canvas("ramp.jpg", 1080, 1350, (0.5, 0.56), [(0, 0.94), (0.26, 0.85), (0.36, 0), (0.86, 0), (1, 0.85)])
    head(d, 1080, "1/5")
    text(d, (M, 225), "Пандус:", font("ExtraBold", 110), WHITE, "ls")
    text(d, (M, 315), "4 вопроса до заказа", font("ExtraBold", 72), ORANGE, "ls")
    text(d, (M, 375), "Чтобы не переделывать после монтажа", font("Medium", 36), LIGHT, "ls")
    text(d, (540, 1300), "Листайте →", font("Bold", 36), WHITE, "mm")
    return img


def ig2():
    img, d = canvas("stairs-public.jpg", 1080, 1350, (0.5, 0.55), [(0, 0.9), (0.2, 0.75), (0.3, 0), (0.62, 0), (0.74, 0.92), (1, 0.97)])
    head(d, 1080, "2/5")
    title(d, 210, "1.", "Где стоит", "улица или помещение")
    text(d, (M, 1080), "Улица — нержавейка AISI 304:", font("Bold", 38), WHITE, "ls")
    para(d, 1130, ["держит дождь, снег и реагенты"])
    text(d, (M, 1215), "Помещение — AISI 201:", font("Bold", 38), WHITE, "ls")
    para(d, 1265, ["в сухом месте дешевле и служит долго"])
    return img


def ramp_scheme(d, x0, ground, x1, top, rail=105):
    """Профиль пандуса: марш, площадка, поручень и размеры H и L."""
    plat = x1 + 190
    d.line([(M, ground), (1080 - M, ground)], fill=(70, 72, 78), width=4)
    d.polygon([(x0, ground), (x1, top), (plat, top), (plat, ground)], fill=(52, 55, 62))
    d.line([(x0, ground), (x1, top), (plat, top)], fill=STEEL, width=8)
    # поручень и стойки
    d.line([(x0 + 20, ground - rail), (x1, top - rail), (plat, top - rail)], fill=WHITE, width=9, joint="curve")
    for t in (0.04, 0.37, 0.7, 1.0):
        x = x0 + 20 + (x1 - x0 - 20) * t
        y = ground + (top - ground) * (x - x0) / (x1 - x0)
        d.line([(x, y), (x, y - rail)], fill=LIGHT, width=6)
    d.line([(plat - 6, top), (plat - 6, top - rail)], fill=LIGHT, width=6)
    # размеры
    hx = plat + 50
    d.line([(hx, ground), (hx, top)], fill=ORANGE, width=4)
    for y in (ground, top):
        d.line([(hx - 16, y), (hx + 16, y)], fill=ORANGE, width=4)
    text(d, (hx - 24, (ground + top) // 2), "H", font("ExtraBold", 48), ORANGE, "rm")
    ly = ground + 50
    d.line([(x0, ly), (x1, ly)], fill=ORANGE, width=4)
    for x in (x0, x1):
        d.line([(x, ly - 16), (x, ly + 16)], fill=ORANGE, width=4)
    text(d, (x0, ly + 62), "L — длина марша", font("Bold", 34), ORANGE, "ls")
    text(d, (1080 - M, ly + 62), "H — высота подъёма", font("Bold", 34), ORANGE, "rs")


def ig3():
    img, d = dark(1080, 1350)
    head(d, 1080, "3/5")
    title(d, 210, "2.", "Высота и длина", "от них зависит уклон")
    ramp_scheme(d, 110, 860, 700, 560)
    para(d, 1090, ["Чем выше подъём, тем длиннее пандус.",
                   "Не хватает места — делаем площадку",
                   "и второй марш.",
                   "Уклон считаем по нормам РК на замере."], size=36, step=54)
    return img


def ig4():
    img, d = dark(1080, 1350)
    band(img, photo("porch-house.jpg"), 330, 760, (0.6, 0.55), fade=120)
    head(d, 1080, "4/5")
    title(d, 210, "3.", "Поручни", "с одной или двух сторон")
    para(d, 1160, ["Поручень — опора на всём подъёме.",
                   "Высоту подбираем по нормам на замере."], size=34, step=52)
    return img


def ig5():
    img, d = canvas("ramp-detail.jpg", 1080, 1350, (0.5, 0.5), [(0, 0.94), (0.3, 0.85), (0.4, 0), (0.62, 0), (0.74, 0.9), (1, 0.97)])
    head(d, 1080, "5/5")
    title(d, 210, "4.", "Замер до расчёта", "цена — после замера")
    para(d, 380, ["Выезжаем на объект, меряем вход, высоту", "подъёма и место — потом считаем точно."], size=34, step=50)
    text(d, (540, 1100), "Пришлите фото входа и высоту подъёма", font("SemiBold", 36), WHITE, "mm")
    text(d, (540, 1150), "— подскажем вариант", font("SemiBold", 36), WHITE, "mm")
    button(d, 540, 1200, "Директ или WhatsApp →", font("ExtraBold", 50))
    return img


# ---------- Вертикальные 1080×1920 ----------

def st1():
    img, d = canvas("ramp.jpg", 1080, 1920, (0.5, 0.5), [(0, 0.92), (0.2, 0.75), (0.3, 0), (0.8, 0), (0.88, 0.9), (1, 0.97)])
    head(d, 1080)
    text(d, (540, 320), "Нужен пандус?", font("ExtraBold", 104), WHITE, "ms")
    text(d, (540, 420), "Сначала замер", font("ExtraBold", 84), ORANGE, "ms")
    footer(d, 1080, 1920, 0)
    return img


def st2():
    img, d = canvas("stairs-public.jpg", 1080, 1920, (0.5, 0.5), [(0, 0.92), (0.24, 0.8), (0.34, 0), (0.6, 0), (0.7, 0.92), (1, 0.97)])
    head(d, 1080)
    text(d, (540, 320), "Что важно", font("ExtraBold", 110), WHITE, "ms")
    text(d, (540, 410), "до расчёта пандуса", font("ExtraBold", 66), ORANGE, "ms")
    items = ["улица или помещение", "высота подъёма", "длина и место под марш", "поручни: одна или две стороны"]
    for i, s in enumerate(items):
        y = 1450 + i * 75
        d.rounded_rectangle((M, y - 34, M + 10, y + 6), radius=5, fill=ORANGE)
        text(d, (M + 34, y), s, font("SemiBold", 44), WHITE, "ls")
    footer(d, 1080, 1920, 1)
    return img


def st3():
    img, d = dark(1080, 1920)
    band(img, photo("porch-house.jpg"), 520, 900, (0.6, 0.55), fade=150)
    head(d, 1080)
    text(d, (540, 330), "Пришлите", font("ExtraBold", 110), WHITE, "ms")
    text(d, (540, 430), "фото входа", font("ExtraBold", 92), ORANGE, "ms")
    text(d, (540, 1500), "и примерную высоту подъёма —", font("SemiBold", 42), WHITE, "ms")
    text(d, (540, 1560), "подскажем вариант", font("SemiBold", 42), WHITE, "ms")
    button(d, 540, 1600, "Написать в WhatsApp →", font("ExtraBold", 50))
    footer(d, 1080, 1920, 2)
    return img


def main():
    for i, fn in enumerate((ig1, ig2, ig3, ig4, ig5), 1):
        fn().save(DIR / f"instagram-{i}.png", optimize=True)
    for i, fn in enumerate((st1, st2, st3), 1):
        fn().save(DIR / f"story-{i}.png", optimize=True)
    print("ok")


if __name__ == "__main__":
    main()
