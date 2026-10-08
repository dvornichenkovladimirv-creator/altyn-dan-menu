#!/usr/bin/env python3
"""Проверочный расчёт стальных элементов по методике СП 16.13330.2017.

Реализовано:
  * балка (однопролётная шарнирная или консоль): прочность при изгибе (упругая стадия),
    прочность на срез, прогиб (предельные прогибы по СП 20.13330);
  * центрально-сжатый стержень: устойчивость (φ по формулам СП 16), предельная гибкость.

НЕ реализовано (агент обязан явно об этом сообщать):
  * общая (изгибно-крутильная) устойчивость балок (φb), местная устойчивость стенок/полок;
  * внецентренное сжатие, растяжение со смятием, узлы, сварные и болтовые соединения;
  * сбор нагрузок — на вход подаются уже собранные расчётные и нормативные нагрузки.

Единицы: длины в м, нагрузки в кН и кН/м, напряжения в МПа, размеры сечений в мм.
Запуск: python3 steelcalc.py input.json   |   python3 steelcalc.py --sections
"""
from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass

E = 206_000.0  # МПа, модуль упругости стали

# Расчётные сопротивления Ry (МПа) по пределу текучести для фасонного/листового проката.
# Значения упрощены по СП 16.13330.2017 табл. В.5: (макс. толщина, мм, Ry).
# Перед выпуском документации сверять с действующей редакцией таблицы.
STEELS: dict[str, list[tuple[float, float]]] = {
    "С235": [(20, 230), (40, 220)],
    "С245": [(20, 240), (30, 230)],
    "С255": [(10, 240), (20, 240), (40, 230)],
    "С345": [(10, 335), (20, 315), (40, 300)],
    "С355": [(16, 345), (40, 335)],
    "С390": [(50, 380)],
}

# Двутавры ГОСТ 8239-89: h, b, s, t (мм), A (см²), Ix (см⁴), Wx (см³), Sx (см³), Iy (см⁴), iy (см)
GOST_8239 = {
    "10": (100, 55, 4.5, 7.2, 12.0, 198, 39.7, 23.0, 17.9, 1.22),
    "12": (120, 64, 4.8, 7.3, 14.7, 350, 58.4, 33.7, 27.9, 1.38),
    "14": (140, 73, 4.9, 7.5, 17.4, 572, 81.7, 46.8, 41.9, 1.55),
    "16": (160, 81, 5.0, 7.8, 20.2, 873, 109, 62.3, 58.6, 1.70),
    "18": (180, 90, 5.1, 8.1, 23.4, 1290, 143, 81.4, 82.6, 1.88),
    "20": (200, 100, 5.2, 8.4, 26.8, 1840, 184, 104, 115, 2.07),
    "22": (220, 110, 5.4, 8.7, 30.6, 2550, 232, 131, 157, 2.27),
    "24": (240, 115, 5.6, 9.5, 34.8, 3460, 289, 163, 198, 2.37),
    "27": (270, 125, 6.0, 9.8, 40.2, 5010, 371, 210, 260, 2.54),
    "30": (300, 135, 6.5, 10.2, 46.5, 7080, 472, 268, 337, 2.69),
    "33": (330, 140, 7.0, 11.2, 53.8, 9840, 597, 339, 419, 2.79),
    "36": (360, 145, 7.5, 12.3, 61.9, 13380, 743, 423, 516, 2.89),
    "40": (400, 155, 8.3, 13.0, 72.6, 19062, 953, 545, 667, 3.03),
    "45": (450, 160, 9.0, 14.2, 84.7, 27696, 1231, 708, 808, 3.09),
    "50": (500, 170, 10.0, 15.2, 100.0, 39727, 1589, 919, 1043, 3.23),
}

# Коэффициенты α, β для типов сечений a, b, c (СП 16.13330.2017, п. 7.1.3, табл. 7)
CURVES = {"a": (0.03, 0.06), "b": (0.04, 0.09), "c": (0.04, 0.14)}


@dataclass
class Section:
    """Геометрические характеристики в мм-единицах."""
    name: str
    A: float     # мм²
    Ix: float    # мм⁴
    Iy: float    # мм⁴
    Wx: float    # мм³
    Sx: float    # мм³, статический момент полусечения
    tw: float    # мм, толщина, воспринимающая срез (стенка / 2 стенки трубы)
    t_max: float  # мм, наибольшая толщина элемента — для выбора Ry
    curve: str   # тип сечения для φ по умолчанию

    @property
    def ix(self) -> float:
        return math.sqrt(self.Ix / self.A)

    @property
    def iy(self) -> float:
        return math.sqrt(self.Iy / self.A)


def i_beam(h: float, b: float, tw: float, tf: float, name: str | None = None) -> Section:
    """Сварной двутавр (без учёта галтелей)."""
    hw = h - 2 * tf
    A = 2 * b * tf + hw * tw
    Ix = (b * h**3 - (b - tw) * hw**3) / 12
    Iy = (2 * tf * b**3 + hw * tw**3) / 12
    Sx = b * tf * (h - tf) / 2 + tw * hw**2 / 8
    return Section(name or f"Двутавр сварной {h}x{b}x{tw}x{tf}", A, Ix, Iy, Ix / (h / 2), Sx, tw, max(tw, tf), "b")


def rect_tube(h: float, b: float, t: float) -> Section:
    """Прямоугольная труба (без скруглений углов)."""
    hi, bi = h - 2 * t, b - 2 * t
    A = b * h - bi * hi
    Ix = (b * h**3 - bi * hi**3) / 12
    Iy = (h * b**3 - hi * bi**3) / 12
    Sx = b * h**2 / 8 - bi * hi**2 / 8
    return Section(f"Труба прямоуг. {h}x{b}x{t}", A, Ix, Iy, Ix / (h / 2), Sx, 2 * t, t, "b")


def circ_tube(D: float, t: float) -> Section:
    """Круглая труба."""
    d = D - 2 * t
    A = math.pi * (D**2 - d**2) / 4
    I = math.pi * (D**4 - d**4) / 64
    Sx = (D**3 - d**3) / 12
    return Section(f"Труба круглая {D}x{t}", A, I, I, I / (D / 2), Sx, 2 * t, t, "a")


def gost_8239(number: str) -> Section:
    if number not in GOST_8239:
        raise ValueError(f"Нет двутавра №{number} в ГОСТ 8239-89. Доступны: {', '.join(GOST_8239)}")
    h, b, s, t, A, Ix, Wx, Sx, Iy, _ = GOST_8239[number]
    return Section(f"Двутавр {number} ГОСТ 8239-89", A * 1e2, Ix * 1e4, Iy * 1e4, Wx * 1e3, Sx * 1e3, s, t, "b")


def make_section(spec: dict) -> Section:
    kind = spec["type"]
    if kind == "gost8239":
        return gost_8239(str(spec["number"]))
    if kind == "i_beam":
        return i_beam(spec["h"], spec["b"], spec["tw"], spec["tf"])
    if kind == "rect_tube":
        return rect_tube(spec["h"], spec["b"], spec["t"])
    if kind == "circ_tube":
        return circ_tube(spec["D"], spec["t"])
    raise ValueError(f"Неизвестный тип сечения: {kind}")


def design_strength(steel: str, t: float, Ry_override: float | None = None) -> float:
    if Ry_override:
        return float(Ry_override)
    if steel not in STEELS:
        raise ValueError(f"Нет стали {steel}. Доступны: {', '.join(STEELS)} или задайте Ry явно")
    for t_max, Ry in STEELS[steel]:
        if t <= t_max:
            return Ry
    raise ValueError(f"Толщина {t} мм вне таблицы для {steel}; задайте Ry явно")


def deflection_limit_ratio(L: float) -> float:
    """n в пределе f ≤ L/n — СП 20.13330, табл. Д.1, п. 2 (эстетико-психологические требования)."""
    pts = [(1, 120), (3, 150), (6, 200), (24, 250), (36, 300)]
    if L <= pts[0][0]:
        return pts[0][1]
    if L >= pts[-1][0]:
        return pts[-1][1]
    for (l1, n1), (l2, n2) in zip(pts, pts[1:]):
        if l1 <= L <= l2:
            return n1 + (n2 - n1) * (L - l1) / (l2 - l1)
    raise AssertionError


def phi_compression(lam_bar: float, curve: str) -> float:
    """Коэффициент устойчивости при центральном сжатии, СП 16.13330.2017 формулы (8)–(9)."""
    if lam_bar <= 0:
        return 1.0
    a, b = CURVES[curve]
    delta = 9.87 * (1 - a + b * lam_bar) + lam_bar**2
    phi = 0.5 * (delta - math.sqrt(delta**2 - 39.48 * lam_bar**2)) / lam_bar**2
    return min(1.0, phi, 7.6 / lam_bar**2)


def check_beam(d: dict) -> dict:
    sec = make_section(d["section"])
    L = float(d["L"])                    # м
    scheme = d.get("scheme", "simple")   # simple | cantilever
    q, qn = float(d.get("q", 0)), float(d.get("qn", 0))   # кН/м
    P, Pn = float(d.get("P", 0)), float(d.get("Pn", 0))   # кН (в середине пролёта / на конце консоли)
    gc = float(d.get("gamma_c", 1.0))
    Ry = design_strength(d.get("steel", "С245"), sec.t_max, d.get("Ry"))
    Rs = 0.58 * Ry
    Lmm = L * 1000

    if scheme == "simple":
        M = q * L**2 / 8 + P * L / 4
        Q = q * L / 2 + P / 2
        f = 5 * qn * Lmm**4 / (384 * E * sec.Ix) + Pn * 1e3 * Lmm**3 / (48 * E * sec.Ix)
        L_defl = L
    elif scheme == "cantilever":
        M = q * L**2 / 2 + P * L
        Q = q * L + P
        f = qn * Lmm**4 / (8 * E * sec.Ix) + Pn * 1e3 * Lmm**3 / (3 * E * sec.Ix)
        L_defl = 2 * L  # для консоли пролёт принимается равным удвоенному вылету (СП 20, прим. к табл. Д.1)
    else:
        raise ValueError("scheme: simple | cantilever")

    n = float(d["defl_n"]) if d.get("defl_n") else deflection_limit_ratio(L_defl)
    f_u = L_defl * 1000 / n
    sigma = M * 1e6 / sec.Wx
    tau = Q * 1e3 * sec.Sx / (sec.Ix * sec.tw)
    checks = [
        ("Прочность при изгибе σ = M/Wx ≤ Ry·γc (СП 16, ф. 41, упругая стадия)", sigma, Ry * gc, "МПа"),
        ("Прочность на срез τ = Q·S/(I·tw) ≤ Rs·γc (СП 16, ф. 42)", tau, Rs * gc, "МПа"),
        (f"Прогиб f ≤ L/{n:.0f} (СП 20.13330, табл. Д.1)", f, f_u, "мм"),
    ]
    return _result("Балка", sec, d, {"Ry, МПа": Ry, "Rs, МПа": Rs, "γc": gc, "M, кН·м": M, "Q, кН": Q}, checks)


def check_column(d: dict) -> dict:
    sec = make_section(d["section"])
    N = float(d["N"])                                   # кН, сжатие
    Lx, Ly = float(d["Lx"]), float(d.get("Ly", d["Lx"]))  # м, геометрические длины
    mux, muy = float(d.get("mu_x", 1.0)), float(d.get("mu_y", 1.0))
    gc = float(d.get("gamma_c", 1.0))
    curve = d.get("curve", sec.curve)
    Ry = design_strength(d.get("steel", "С245"), sec.t_max, d.get("Ry"))

    lam_x = mux * Lx * 1000 / sec.ix
    lam_y = muy * Ly * 1000 / sec.iy
    lam = max(lam_x, lam_y)
    lam_bar = lam * math.sqrt(Ry / E)
    phi = phi_compression(lam_bar, curve)
    sigma = N * 1e3 / (phi * sec.A)
    alpha = max(0.5, N * 1e3 / (phi * sec.A * Ry * gc))
    lam_u = 180 - 60 * alpha
    checks = [
        ("Устойчивость N/(φ·A) ≤ Ry·γc (СП 16, ф. 7)", sigma, Ry * gc, "МПа"),
        ("Гибкость λ ≤ λu = 180 − 60α (СП 16, табл. 32, колонны)", lam, lam_u, ""),
    ]
    extra = {"Ry, МПа": Ry, "γc": gc, "λx": lam_x, "λy": lam_y, "λ̄": lam_bar,
             f"φ (тип «{curve}»)": phi, "N, кН": N}
    return _result("Колонна (центральное сжатие)", sec, d, extra, checks)


def _result(kind: str, sec: Section, d: dict, extra: dict, checks: list) -> dict:
    rows = [{"check": n, "actual": a, "limit": lim, "unit": u, "util": a / lim, "ok": a <= lim}
            for n, a, lim, u in checks]
    return {
        "element": d.get("name", kind),
        "kind": kind,
        "section": sec.name,
        "props": {"A, см²": sec.A / 1e2, "Ix, см⁴": sec.Ix / 1e4, "Iy, см⁴": sec.Iy / 1e4,
                  "Wx, см³": sec.Wx / 1e3, "ix, см": sec.ix / 10, "iy, см": sec.iy / 10},
        "values": extra,
        "checks": rows,
        "max_util": max(r["util"] for r in rows),
        "ok": all(r["ok"] for r in rows),
    }


def format_report(r: dict) -> str:
    f = lambda v: f"{v:.3g}" if abs(v) < 10 else f"{v:,.1f}".replace(",", " ")
    out = [f"## {r['element']} — {r['section']}", ""]
    out.append("Характеристики: " + "; ".join(f"{k} = {f(v)}" for k, v in r["props"].items()))
    out.append("Исходные/промежуточные: " + "; ".join(f"{k} = {f(v)}" for k, v in r["values"].items()))
    out += ["", "| Проверка | Факт | Предел | Использование | Итог |", "|---|---|---|---|---|"]
    for c in r["checks"]:
        out.append(f"| {c['check']} | {f(c['actual'])} {c['unit']} | {f(c['limit'])} {c['unit']} "
                   f"| {c['util']:.0%} | {'✅' if c['ok'] else '❌'} |")
    out += ["", f"**Итог: {'проходит' if r['ok'] else 'НЕ проходит'}, макс. использование {r['max_util']:.0%}**"]
    return "\n".join(out)


def run(data: dict | list) -> list[dict]:
    items = data if isinstance(data, list) else [data]
    handlers = {"beam": check_beam, "column": check_column}
    return [handlers[it["element"]](it) for it in items]


def main(argv: list[str]) -> int:
    if argv[1:] == ["--sections"]:
        print("Двутавры ГОСТ 8239-89:", ", ".join(GOST_8239))
        print("Стали:", ", ".join(STEELS))
        return 0
    if len(argv) != 2:
        print(__doc__)
        return 2
    data = json.load(sys.stdin if argv[1] == "-" else open(argv[1], encoding="utf-8"))
    results = run(data)
    print("\n\n".join(format_report(r) for r in results))
    return 0 if all(r["ok"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
