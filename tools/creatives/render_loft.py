"""Сборка креативов «Лофт-стол на стальном каркасе» поверх фото из GPT.

Запуск:  python3 tools/creatives/render_loft.py
Фото берутся из content/03-loft-stol-karkas/photos/ (см. gen_photos.py),
готовые PNG пишутся в content/03-loft-stol-karkas/.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "content" / "03-loft-stol-karkas"
PHOTOS = DIR / "photos"
FONTS = Path(__file__).resolve().parent / "fonts"

BG = (19, 20, 24)
CARD = (30, 32, 37)
WHITE = (255, 255, 255)
LIGHT = (220, 222, 226)
MUTED = (150, 153, 160)
ORANGE = (255, 138, 36)
STEEL = (165, 170, 178)

BRAND = "ЛОФТ-МЕБЕЛЬ · КАРАГАНДА"
FOOTER = "Лофт-мебель на стальном каркасе · Караганда"
M = 70  # боковой отступ


def font(weight, size):
    return ImageFont.truetype(str(FONTS / f"Montserrat-{weight}.ttf"), size)


def cover(path, w, h, focus=(0.5, 0.5)):
    """Масштабирует фото под w×h с обрезкой, focus — точка, которую держим в кадре."""
    img = Image.open(path).convert("RGB")
    scale = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = min(max(round(img.width * focus[0] - w / 2), 0), img.width - w)
    top = min(max(round(img.height * focus[1] - h / 2), 0), img.height - h)
    return img.crop((left, top, left + w, top + h))


def shade(img, stops):
    """Вертикальное затемнение: stops — [(y доля, непрозрачность 0..1), ...]."""
    w, h = img.size
    mask = Image.new("L", (1, h))
    for y in range(h):
        t = y / (h - 1)
        for (y0, a0), (y1, a1) in zip(stops, stops[1:]):
            if y0 <= t <= y1:
                k = (t - y0) / (y1 - y0) if y1 > y0 else 0
                mask.putpixel((0, y), round(255 * (a0 + (a1 - a0) * k)))
                break
    mask = mask.resize((w, h))
    return Image.composite(Image.new("RGB", (w, h), BG), img, mask)


def text(d, xy, s, f, fill, anchor="la", shadow=True):
    if shadow:
        # мягкая тень, чтобы текст читался на любом участке фото
        x, y = xy
        d.text((x, y + 3), s, font=f, fill=(0, 0, 0, 150), anchor=anchor)
    d.text(xy, s, font=f, fill=fill, anchor=anchor)


def header(d, w, page=None):
    text(d, (M, 78), BRAND, font("SemiBold", 26), MUTED, "lm")
    if page:
        text(d, (w - M, 78), page, font("SemiBold", 26), MUTED, "rm")


def dots(d, w, h, active):
    for i in range(3):
        x = w // 2 - 40 + i * 40
        d.ellipse((x - 8, h - 148, x + 8, h - 132), fill=ORANGE if i == active else (90, 92, 98))
    text(d, (w // 2, h - 80), FOOTER, font("Medium", 28), MUTED, "mm")


def button(d, cx, y, label, f, pad_x=50, h=104):
    tw = d.textlength(label, font=f)
    box = (cx - tw / 2 - pad_x, y, cx + tw / 2 + pad_x, y + h)
    d.rounded_rectangle(box, radius=h // 2, fill=ORANGE)
    d.text((cx, y + h / 2 + 2), label, font=f, fill=WHITE, anchor="mm")


def callout(d, dot, label_xy, title, sub, align="l"):
    """Выноска: точка на фото → линия → подчёркнутый заголовок и подпись."""
    tf, sf = font("Bold", 36), font("Medium", 28)
    x, y = label_xy
    tw = d.textlength(title, font=tf)
    x0 = x if align == "l" else x - tw
    line_end = (x0 if dot[0] < x0 else x0 + tw, y + 28)
    d.line([dot, line_end], fill=ORANGE, width=2)
    d.line([(x0, y + 28), (x0 + tw, y + 28)], fill=ORANGE, width=3)
    d.ellipse((dot[0] - 11, dot[1] - 11, dot[0] + 11, dot[1] + 11), fill=ORANGE, outline=WHITE, width=3)
    text(d, (x0, y), title, tf, WHITE, "ls")
    sx = x0 if align == "l" else x0 + tw
    text(d, (sx, y + 72), sub, sf, LIGHT, "ls" if align == "l" else "rs")


def canvas(photo, w, h, focus, stops):
    img = shade(cover(PHOTOS / photo, w, h, focus), stops)
    return img, ImageDraw.Draw(img, "RGBA")


def band(img, photo, y, h, focus=(0.5, 0.5), fade=140):
    """Фото полосой на всю ширину, верх и низ плавно уходят в фон."""
    w = img.width
    ph = cover(PHOTOS / photo, w, h, focus)
    mask = Image.new("L", (1, h), 255)
    for i in range(fade):
        a = round(255 * (i / fade) ** 1.5)
        mask.putpixel((0, i), a)
        mask.putpixel((0, h - 1 - i), a)
    img.paste(ph, (0, y), mask.resize((w, h)))


def dark(w, h):
    img = Image.new("RGB", (w, h), BG)
    return img, ImageDraw.Draw(img, "RGBA")


REAL = "real-table.jpg"  # фото реального стола заказчика


# ---------- Instagram 1080×1350 ----------

def ig1():
    img, d = dark(1080, 1350)
    band(img, REAL, 430, 860, (0.6, 0.5))
    header(d, 1080, "1/5")
    text(d, (M, 250), "Лофт-стол", font("ExtraBold", 112), WHITE, "ls")
    text(d, (M, 340), "не должен шататься", font("ExtraBold", 72), ORANGE, "ls")
    text(d, (M, 405), "Разбираем, что решает каркас", font("Medium", 40), LIGHT, "ls")
    text(d, (540, 1300), "Листайте →", font("Bold", 36), WHITE, "mm")
    return img


def ig2():
    img, d = canvas("profiles.jpg", 1080, 1350, (0.5, 0.5), [(0, 0.9), (0.3, 0.4), (0.45, 0), (0.62, 0.2), (0.75, 0.92), (1, 1)])
    header(d, 1080, "2/5")
    text(d, (M, 225), "Профильная труба", font("ExtraBold", 80), WHITE, "ls")
    text(d, (M, 300), "подбирается под нагрузку", font("ExtraBold", 50), ORANGE, "ls")
    rows = [("Сечение", ["длиннее стол, тяжелее столешница —", "крупнее профиль"]),
            ("Стенка", ["тонкая труба «играет» —", "берём с запасом"])]
    y = 1065
    for title, lines in rows:
        text(d, (M, y), title, font("Bold", 40), WHITE, "ls")
        for i, line in enumerate(lines):
            text(d, (290, y + i * 50), line, font("Medium", 36), LIGHT, "ls")
        y += 125
    return img


def ig3():
    img, d = canvas("weld.jpg", 1080, 1350, (0.5, 0.5), [(0, 0.9), (0.3, 0.35), (0.45, 0), (0.72, 0), (0.88, 0.85), (1, 0.95)])
    header(d, 1080, "3/5")
    text(d, (M, 245), "Сварка,", font("ExtraBold", 104), WHITE, "ls")
    text(d, (M, 330), "а не только болты", font("ExtraBold", 72), ORANGE, "ls")
    text(d, (1080 - M, 1140), "Жёсткий узел", font("Bold", 40), WHITE, "rs")
    tw = d.textlength("Жёсткий узел", font=font("Bold", 40))
    d.line([(1080 - M - tw, 1155), (1080 - M, 1155)], fill=ORANGE, width=3)
    text(d, (1080 - M, 1205), "не разбалтывается со временем", font("Medium", 30), LIGHT, "rs")
    text(d, (M, 1280), "Болты со временем ослабевают — отсюда шатание", font("Medium", 30), MUTED, "ls")
    return img


def ig4():
    img = Image.new("RGB", (1080, 1350), BG)
    photo = cover(PHOTOS / "coating.jpg", 940, 470)
    mask = Image.new("L", photo.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *photo.size), radius=28, fill=255)
    img.paste(photo, (M, 360), mask)
    d = ImageDraw.Draw(img, "RGBA")
    header(d, 1080, "4/5")
    text(d, (M, 225), "Покрытие", font("ExtraBold", 96), WHITE, "ls")
    text(d, (M, 305), "защищает каркас", font("ExtraBold", 66), ORANGE, "ls")
    # подписи на фото: слева порошок, справа лак
    for x, label, color in ((M + 24, "порошок", ORANGE), (M + 940 - 24, "лак", STEEL)):
        f = font("Bold", 30)
        tw = d.textlength(label, font=f)
        x0 = x if color == ORANGE else x - tw - 40
        d.rounded_rectangle((x0, 360 + 470 - 76, x0 + tw + 40, 360 + 470 - 24), radius=26, fill=color)
        d.text((x0 + 20 + tw / 2, 360 + 470 - 49), label, font=f, fill=BG if color == STEEL else WHITE, anchor="mm")
    cards = [
        (ORANGE, "Порошковая краска", "ровный цвет, стойкая к царапинам и влаге —", "для кухни и офиса. Чёрный, графит, белый и др."),
        (STEEL, "Лак по металлу", "видна фактура стали и швы — «сырой»", "индустриальный вид. Мягче, чем порошок."),
    ]
    y = 870
    for color, title, l1, l2 in cards:
        d.rounded_rectangle((M, y, 1080 - M, y + 210), radius=28, fill=CARD, outline=color, width=3)
        d.rounded_rectangle((M + 40, y + 42, M + 84, y + 86), radius=10, fill=color)
        d.text((M + 110, y + 64), title, font=font("ExtraBold", 40), fill=WHITE, anchor="lm")
        d.text((M + 40, y + 128), l1, font=font("Medium", 30), fill=LIGHT, anchor="lm")
        d.text((M + 40, y + 170), l2, font=font("Medium", 30), fill=LIGHT, anchor="lm")
        y += 240
    return img


def ig5():
    img, d = dark(1080, 1350)
    band(img, REAL, 470, 640, (0.62, 0.55), fade=110)
    header(d, 1080, "5/5")
    text(d, (M, 230), "Под ваш интерьер", font("ExtraBold", 84), WHITE, "ls")
    for i, line in enumerate(["размер — под помещение", "цвет каркаса — на выбор", "столешница — массив или слэб"]):
        y = 320 + i * 70
        d.line([(M, y - 10), (M + 14, y + 4), (M + 38, y - 24)], fill=ORANGE, width=5, joint="curve")
        text(d, (M + 60, y), line, font("SemiBold", 40), WHITE, "ls")
    text(d, (540, 1150), "Напишите, что нужно: стол, стеллаж, консоль", font("SemiBold", 34), WHITE, "mm")
    button(d, 540, 1195, "Директ или WhatsApp →", font("ExtraBold", 50))
    return img


# ---------- WhatsApp-статусы 1080×1920 ----------

def wa1():
    img, d = dark(1080, 1920)
    band(img, REAL, 500, 1040, (0.62, 0.5))
    header(d, 1080)
    text(d, (540, 330), "Лофт-мебель", font("ExtraBold", 112), WHITE, "ms")
    text(d, (540, 420), "на стальном каркасе", font("ExtraBold", 66), ORANGE, "ms")
    text(d, (540, 1610), "Столы · стеллажи · консоли", font("SemiBold", 46), LIGHT, "ms")
    text(d, (540, 1675), "под ваш размер", font("SemiBold", 46), LIGHT, "ms")
    dots(d, 1080, 1920, 0)
    return img


def wa2():
    # Фото 2000×1500 → полоса 1080×1000 с y=480: x' = x·⅔ − 286, y' = y·⅔ + 480.
    img, d = dark(1080, 1920)
    band(img, REAL, 480, 1000, (0.62, 0.5))
    header(d, 1080)
    text(d, (540, 290), "Почему не шатается", font("ExtraBold", 80), WHITE, "ms")
    callout(d, (681, 700), (M, 420), "Массив дерева", "или слэб")
    callout(d, (364, 845), (M, 1580), "Сварные узлы", "а не только болты")
    callout(d, (887, 1013), (1080 - M, 1580), "Порошковая краска", "или лак по металлу", align="r")
    dots(d, 1080, 1920, 1)
    return img


def wa3():
    img, d = dark(1080, 1920)
    band(img, REAL, 520, 860, (0.58, 0.5))
    header(d, 1080)
    text(d, (540, 370), "Сделаем", font("ExtraBold", 120), WHITE, "ms")
    text(d, (540, 470), "под ваш размер", font("ExtraBold", 92), ORANGE, "ms")
    text(d, (540, 1450), "Напишите, что нужно: стол, стеллаж", font("SemiBold", 40), WHITE, "ms")
    text(d, (540, 1508), "или консоль — и примерные размеры", font("SemiBold", 40), WHITE, "ms")
    button(d, 540, 1560, "Ответьте на этот статус →", font("ExtraBold", 50))
    dots(d, 1080, 1920, 2)
    return img


def main():
    out = {
        "instagram-1.png": ig1(), "instagram-2.png": ig2(), "instagram-3.png": ig3(),
        "instagram-4.png": ig4(), "instagram-5.png": ig5(),
        "whatsapp-status-1.png": wa1(), "whatsapp-status-2.png": wa2(),
        "whatsapp-status-3.png": wa3(),
    }
    for name, im in out.items():
        im.save(DIR / name, optimize=True)
        print("saved", name)


if __name__ == "__main__":
    main()
