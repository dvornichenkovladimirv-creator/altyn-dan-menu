import math
import unittest

import steelcalc as sc


class SectionTests(unittest.TestCase):
    def test_gost_table_consistent_with_geometry(self):
        # Ловит опечатки в таблице: расчёт по габаритам без галтелей отличается от ГОСТ на единицы %
        for num in sc.GOST_8239:
            h, b, s, t, A, Ix, Wx, *_ = sc.GOST_8239[num]
            geo = sc.i_beam(h, b, s, t)
            self.assertAlmostEqual(geo.A / 1e2 / A, 1, delta=0.08, msg=f"A №{num}")
            self.assertAlmostEqual(geo.Ix / 1e4 / Ix, 1, delta=0.08, msg=f"Ix №{num}")
            self.assertAlmostEqual(Ix / (h / 20) / Wx, 1, delta=0.01, msg=f"Wx №{num}")

    def test_circ_tube(self):
        s = sc.circ_tube(100, 5)
        self.assertAlmostEqual(s.A, math.pi * (100**2 - 90**2) / 4)
        self.assertAlmostEqual(s.ix, math.sqrt(100**2 + 90**2) / 4)


class BeamTests(unittest.TestCase):
    def test_i20_6m_hand_calc(self):
        r = sc.check_beam({"section": {"type": "gost8239", "number": "20"}, "L": 6,
                           "q": 10, "qn": 8, "steel": "С245"})
        bend, shear, defl = r["checks"]
        self.assertAlmostEqual(r["values"]["M, кН·м"], 45)
        self.assertAlmostEqual(bend["actual"], 45e6 / 184e3)          # 244.6 МПа
        self.assertFalse(bend["ok"])
        self.assertAlmostEqual(shear["actual"], 30e3 * 104e3 / (1840e4 * 5.2))
        self.assertAlmostEqual(defl["actual"], 5 * 8 * 6000**4 / (384 * sc.E * 1840e4))  # ≈35.6 мм
        self.assertAlmostEqual(defl["limit"], 30)                      # L/200
        self.assertFalse(r["ok"])

    def test_cantilever_uses_double_span_for_limit(self):
        r = sc.check_beam({"section": {"type": "gost8239", "number": "30"}, "L": 1.5,
                           "scheme": "cantilever", "q": 5, "qn": 4})
        self.assertAlmostEqual(r["checks"][2]["limit"], 3000 / 150)


class ColumnTests(unittest.TestCase):
    def test_phi_bounds(self):
        self.assertEqual(sc.phi_compression(0.2, "b"), 1.0)
        for curve in "abc":
            prev = 1.0
            for lb in [0.5, 1, 2, 3, 4, 5, 6]:
                phi = sc.phi_compression(lb, curve)
                self.assertLessEqual(phi, prev)
                prev = phi
        # a ≥ b ≥ c
        self.assertGreater(sc.phi_compression(2, "a"), sc.phi_compression(2, "b"))
        self.assertGreater(sc.phi_compression(2, "b"), sc.phi_compression(2, "c"))

    def test_phi_close_to_old_snip(self):
        # СНиП II-23-81 при λ̄=2, Ry=230: φ = 1 − (0.073 − 5.53·Ry/E)·λ̄^1.5 ≈ 0.81
        old = 1 - (0.073 - 5.53 * 230 / sc.E) * 2**1.5
        self.assertAlmostEqual(sc.phi_compression(2, "b"), old, delta=0.03)

    def test_column_tube(self):
        r = sc.check_column({"section": {"type": "circ_tube", "D": 159, "t": 6}, "N": 300, "Lx": 3,
                             "steel": "С245"})
        sec = sc.circ_tube(159, 6)
        lam = 3000 / sec.ix
        phi = sc.phi_compression(lam * math.sqrt(240 / sc.E), "a")
        self.assertAlmostEqual(r["checks"][0]["actual"], 300e3 / (phi * sec.A))
        self.assertTrue(r["ok"])


if __name__ == "__main__":
    unittest.main()
