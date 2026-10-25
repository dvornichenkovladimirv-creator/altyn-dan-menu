"""Собирает workflow.json для импорта в n8n из кода узлов в src/."""
import json
import pathlib
import uuid

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"

SHEETS = "https://sheets.googleapis.com/v4/spreadsheets/{{ $('Разбор сообщения').first().json.sheet }}"
CHAT = "={{ $('Разбор сообщения').first().json.chatId }}"


def code(name, file, pos):
    return {
        "parameters": {"jsCode": (SRC / file).read_text(encoding="utf-8")},
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": pos,
    }


def openai(name, pos):
    return {
        "parameters": {
            "method": "POST",
            "url": "https://api.openai.com/v1/chat/completions",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "openAiApi",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify($json.body) }}",
            "options": {"timeout": 180000},
        },
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": pos,
        "onError": "continueRegularOutput",
    }


def sheets_get(name, ranges, pos, execute_once=False):
    query = "&".join("ranges={{ encodeURIComponent(\"" + r + "\") }}" for r in ranges)
    node = {
        "parameters": {
            "url": "=" + SHEETS + "/values:batchGet?" + query,
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "googleSheetsOAuth2Api",
            "options": {},
        },
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": pos,
    }
    if execute_once:
        node["executeOnce"] = True
    return node


def sheets_append(name, rng, body_expr, pos):
    return {
        "parameters": {
            "method": "POST",
            "url": "=" + SHEETS + "/values/{{ encodeURIComponent(\"" + rng + "\") }}:append"
                   "?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",
            "authentication": "predefinedCredentialType",
            "nodeCredentialType": "googleSheetsOAuth2Api",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify(" + body_expr + ") }}",
            "options": {},
        },
        "name": name,
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": pos,
        "executeOnce": True,
    }


def tg_file(name, pos):
    return {
        "parameters": {
            "resource": "file",
            "fileId": "={{ $json.fileId }}",
            "additionalFields": {},
        },
        "name": name,
        "type": "n8n-nodes-base.telegram",
        "typeVersion": 1.2,
        "position": pos,
    }


def switch(name, outputs, expr, pos):
    return {
        "parameters": {"mode": "expression", "numberOutputs": outputs, "output": "={{ " + expr + " }}"},
        "name": name,
        "type": "n8n-nodes-base.switch",
        "typeVersion": 3.2,
        "position": pos,
    }


def tg_send(name, chat, text, pos):
    return {
        "parameters": {
            "chatId": chat,
            "text": text,
            "additionalFields": {
                "appendAttribution": False,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
        },
        "name": name,
        "type": "n8n-nodes-base.telegram",
        "typeVersion": 1.2,
        "position": pos,
    }



nodes = [
    {
        "parameters": {"updates": ["message"], "additionalFields": {}},
        "name": "Telegram",
        "type": "n8n-nodes-base.telegramTrigger",
        "typeVersion": 1.1,
        "position": [0, 300],
    },
    {
        "parameters": {"rule": {"interval": [{
            "field": "weeks", "weeksInterval": 1, "triggerAtDay": [1], "triggerAtHour": 9, "triggerAtMinute": 0,
        }]}},
        "name": "Каждый понедельник",
        "type": "n8n-nodes-base.scheduleTrigger",
        "typeVersion": 1.2,
        "position": [0, 520],
    },
    code("Разбор сообщения", "01_parse_message.js", [220, 300]),
    switch("Маршрут", 4, "({check: 0, pdf: 1, denied: 3})[$json.route] ?? 2", [440, 300]),
    # чек
    tg_file("Скачать фото", [680, 0]),
    code("Запрос: чек", "02_check_request.js", [900, 0]),
    openai("OpenAI: чек", [1120, 0]),
    code("Чеки из ответа", "03_check_parse.js", [1340, 0]),
    sheets_get("Расходы: прочитать", ["'Расходы'!A2:H", "'Итог'!B4"], [1560, 0]),
    code("Новые чеки", "04_check_new.js", [1780, 0]),
    switch("Есть новые чеки?", 2, "$json.skip ? 1 : 0", [2000, 0]),
    sheets_append("Расходы: добавить", "'Расходы'!A:H", "$('Новые чеки').first().json.body", [2220, -80]),
    # выписка
    tg_file("Скачать PDF", [680, 340]),
    code("Запрос: выписка", "05_statement_request.js", [1120, 340]),
    openai("OpenAI: выписка", [1340, 340]),
    code("Поступления из ответа", "06_statement_parse.js", [1560, 340]),
    sheets_get("Доходы: прочитать", ["'Доходы'!A2:F", "'Итог'!B4"], [1780, 340]),
    code("Новые поступления", "07_statement_new.js", [2000, 340]),
    switch("Есть новые поступления?", 3, "$json.invalid ? 2 : ($json.skip ? 1 : 0)", [2220, 340]),
    sheets_append("Доходы: добавить", "'Доходы'!A:F", "$('Новые поступления').first().json.body", [2440, 260]),
    sheets_append("Выписки: записать", "'Выписки'!A:F", "$('Новые поступления').first().json.logBody", [2660, 340]),
    # итог
    sheets_get("Итог: прочитать", ["'Итог'!A4:B20"], [2880, 300], execute_once=True),
    code("Сообщения", "08_messages.js", [3100, 300]),
    tg_send("Ответ", "={{ $json.chatId }}", "={{ $json.text }}", [3320, 300]),
    tg_send(
        "Нет доступа",
        "={{ $json.chatId }}",
        "=Этот бот закрыт. Ваш chat id: <code>{{ $json.chatId }}</code>\n"
        "Если это вы, впишите его в узел «Разбор сообщения» (ALLOWED_CHAT_IDS).",
        [680, 700],
    ),
]

def link(*targets):
    return [[{"node": t, "type": "main", "index": 0} for t in targets]]


connections = {
    "Telegram": {"main": link("Разбор сообщения")},
    "Каждый понедельник": {"main": link("Разбор сообщения")},
    "Разбор сообщения": {"main": link("Маршрут")},
    "Маршрут": {"main": [
        [{"node": "Скачать фото", "type": "main", "index": 0}],
        [{"node": "Скачать PDF", "type": "main", "index": 0}],
        [{"node": "Итог: прочитать", "type": "main", "index": 0}],
        [{"node": "Нет доступа", "type": "main", "index": 0}],
    ]},
    "Скачать фото": {"main": link("Запрос: чек")},
    "Запрос: чек": {"main": link("OpenAI: чек")},
    "OpenAI: чек": {"main": link("Чеки из ответа")},
    "Чеки из ответа": {"main": link("Расходы: прочитать")},
    "Расходы: прочитать": {"main": link("Новые чеки")},
    "Новые чеки": {"main": link("Есть новые чеки?")},
    "Есть новые чеки?": {"main": [
        [{"node": "Расходы: добавить", "type": "main", "index": 0}],
        [{"node": "Итог: прочитать", "type": "main", "index": 0}],
    ]},
    "Расходы: добавить": {"main": link("Итог: прочитать")},
    "Скачать PDF": {"main": link("Запрос: выписка")},
    "Запрос: выписка": {"main": link("OpenAI: выписка")},
    "OpenAI: выписка": {"main": link("Поступления из ответа")},
    "Поступления из ответа": {"main": link("Доходы: прочитать")},
    "Доходы: прочитать": {"main": link("Новые поступления")},
    "Новые поступления": {"main": link("Есть новые поступления?")},
    "Есть новые поступления?": {"main": [
        [{"node": "Доходы: добавить", "type": "main", "index": 0}],
        [{"node": "Выписки: записать", "type": "main", "index": 0}],
        [{"node": "Итог: прочитать", "type": "main", "index": 0}],
    ]},
    "Доходы: добавить": {"main": link("Выписки: записать")},
    "Выписки: записать": {"main": link("Итог: прочитать")},
    "Итог: прочитать": {"main": link("Сообщения")},
    "Сообщения": {"main": link("Ответ")},
}

for n in nodes:
    n["id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, "tax-bot/" + n["name"]))

workflow = {
    "name": "Налоговый бот ИП МК",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1", "timezone": "Asia/Almaty"},
    "pinData": {},
}

names = {n["name"] for n in nodes}
for src, c in connections.items():
    assert src in names, src
    for out in c["main"]:
        for t in out:
            assert t["node"] in names, t["node"]

(ROOT / "workflow.json").write_text(json.dumps(workflow, ensure_ascii=False, indent=2), encoding="utf-8")
print("nodes:", len(nodes))
