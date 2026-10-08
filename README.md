# altyn-dan-menu

## Агент расчёта металлоконструкций

- Агент Claude Code: `.claude/agents/metal-structures.md` (вызов: «используй агента metal-structures, посчитай балку…»).
- Расчётный модуль: `tools/steelcalc/steelcalc.py` — балки (прочность, срез, прогиб) и центрально-сжатые колонны по СП 16.13330.2017.
- Пример: `python3 tools/steelcalc/steelcalc.py tools/steelcalc/example.json`
- Тесты: `python3 -m unittest discover -s tools/steelcalc`
