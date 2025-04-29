# Построение маршрутов/geocoder.py

import requests
import argparse
import sys
import csv
import json
import os
import config
from utils import sanitize_filename, ensure_data_dirs

API_KEY = config.API_KEYS["2gis"]
BASE_URL = config.API_URLS["2gis_geocode"]

ensure_data_dirs()

# Словарь для расшифровки типов точности из 2ГИС и добавления Emoji + код категории
# Формат: 'тип_2гис': ('html_описание', 'код_категории')
TYPE_DESCRIPTIONS = {
    # Высокая точность -> 'exact'
    'building': ('<span class="accuracy-tag tag-exact">🏠 Здание — высокая точность</span>', 'exact'),
    'address': ('<span class="accuracy-tag tag-exact">🎯 Адрес — высокая точность</span>', 'exact'),
    'poi': ('<span class="accuracy-tag tag-exact">📍 POI — высокая точность</span>', 'exact'),
    'station_entrance': ('<span class="accuracy-tag tag-exact">🚇 Вход в метро — высокая точность</span>', 'exact'),
    'attraction': ('<span class="accuracy-tag tag-exact">🏛️ Достопримечательность — высокая точность</span>', 'exact'),

    # Средняя точность -> 'house', 'street', 'near'
    'street': ('<span class="accuracy-tag tag-street">🛣️ Улица — средняя точность</span>', 'street'),
    'crossroad': ('<span class="accuracy-tag tag-near">🚦 Перекресток — средняя точность</span>', 'near'),
    'route': ('<span class="accuracy-tag tag-street">🛤️ Маршрут — средняя точность</span>', 'street'),
    'parking': ('<span class="accuracy-tag tag-near">🅿️ Парковка — средняя точность</span>', 'near'),
    'adm_div': ('<span class="accuracy-tag tag-locality">🏘️ Населенный пункт — средняя точность</span>', 'locality'), # Населенный пункт -> средняя -> locality

    # Низкая точность -> 'locality'
    'district': ('<span class="accuracy-tag tag-locality">🗺️ Район — низкая точность</span>', 'locality'),
    'living_area': ('<span class="accuracy-tag tag-locality">🏘️ Жилой район — низкая точность</span>', 'locality'),
    'place': ('<span class="accuracy-tag tag-locality">📍 Место — низкая точность</span>', 'locality'),
    'gate': ('<span class="accuracy-tag tag-locality">🚧 Въезд/КПП — низкая точность</span>', 'locality'),
    'road': ('<span class="accuracy-tag tag-street">🛣️ Дорога — низкая точность</span>', 'street'), # Дорога -> низкая -> street ? (возможно, locality)

    # Очень низкая точность / Неопределенные -> 'other'
    'region': ('<span class="accuracy-tag tag-other">🌍 Регион — очень низкая точность</span>', 'other'),
    'division': ('<span class="accuracy-tag tag-other">🌐 Административное деление — очень низкая точность</span>', 'other'),
    'settlement': ('<span class="accuracy-tag tag-other">🏘️ Поселение — очень низкая точность</span>', 'other'),
    'station': ('<span class="accuracy-tag tag-other">🚉 Станция — неопределенная точность</span>', 'other'),
    'hydro': ('<span class="accuracy-tag tag-other">💧 Гидрообъект — неопределенная точность</span>', 'other'),
    'railway_platform': ('<span class="accuracy-tag tag-other">🚆 Ж/Д платформа — неопределенная точность</span>', 'other'),

    # Ошибки и прочее -> 'unknown', 'error', 'not_found'
    '': ('<span class="accuracy-tag tag-unknown">❓ Не определено</span>', 'unknown'), # Пустой тип
    'error': ('<span class="accuracy-tag tag-error">⚠️ Ошибка геокодера</span>', 'error'), # Тип для обозначения ошибок
    'not_found': ('<span class="accuracy-tag tag-error">🤷 Не найдено</span>', 'not_found') # Тип для обозначения отсутствия результата
}

def geocode_address(address):
    """
    Геокодировать адрес с помощью API 2GIS.
    """
    params = {
        "q": address,
        "key": API_KEY,
        "fields": "items.point,items.type,items.name" # Добавили items.name
    }
    
    result_template = {
        "input": address,
        "found": "",
        "type": "unknown", # Код категории по умолчанию
        "description": TYPE_DESCRIPTIONS[''][0], # HTML описание по умолчанию
        "lat": "",
        "lon": "",
        "error": ""
    }

    try:
        response = requests.get(BASE_URL, params=params)
        response.raise_for_status()  # Проверка на HTTP ошибки
        data = response.json()
    except requests.exceptions.RequestException as e:
        print(f"❌ Ошибка при запросе к API: {e}")
        result_template["error"] = f"Ошибка запроса: {e}"
        result_template["type"] = "error"
        result_template["description"] = TYPE_DESCRIPTIONS['error'][0]
        return result_template
    except json.JSONDecodeError:
        print(f"❌ Ошибка при разборе ответа API. Некорректный JSON.")
        result_template["error"] = "Некорректный ответ API"
        result_template["type"] = "error"
        result_template["description"] = TYPE_DESCRIPTIONS['error'][0]
        return result_template
    
    if not data.get("result") or not data["result"].get("items"):
        print(f"⚠️ Не удалось найти координаты для адреса: {address}")
        result_template["error"] = "Адрес не найден"
        result_template["type"] = "not_found"
        result_template["description"] = TYPE_DESCRIPTIONS['not_found'][0]
        return result_template
    
    # Берем первый результат
    item = data["result"]["items"][0]
    
    # Определяем тип объекта и получаем описание + код категории
    item_type_from_api = item.get("type", "")
    # Получаем кортеж (описание, код_категории) или используем значения для пустого типа
    description_html, type_category_code = TYPE_DESCRIPTIONS.get(item_type_from_api, TYPE_DESCRIPTIONS[''])
    
    # Получаем координаты
    point = item.get("point", {})
    lat = point.get("lat")
    lon = point.get("lon")
    
    if not lat or not lon:
        print(f"⚠️ Координаты не найдены для адреса: {address}")
        # Оставляем тип 'not_found', но указываем ошибку с координатами
        result_template["error"] = "Координаты не найдены"
        result_template["type"] = "not_found"
        result_template["description"] = TYPE_DESCRIPTIONS['not_found'][0] # или кастомное описание?
        return result_template
    
    # Формируем результат 
    found = item.get("name", address)
    result = {
        "input": address,
        "found": found,
        "type": type_category_code, # Возвращаем КОД КАТЕГОРИИ
        "description": description_html, # Возвращаем HTML ОПИСАНИЕ
        "lat": lat,
        "lon": lon,
        "error": ""
    }
    
    print(f"✅ Геокодирован адрес: {address} → ({lat}, {lon}) [{type_category_code}]")
    return result

def main():
    parser = argparse.ArgumentParser(description="Геокодировать адреса с помощью API 2GIS")
    parser.add_argument("--parsed_file", help="Путь к файлу с разобранными адресами (по умолчанию: parsed_addresses.csv)", default=None)
    parser.add_argument("--route_name", help="Название маршрута для обработки", default=None)
    args = parser.parse_args()

    # Определяем путь к файлу с разобранными адресами
    if args.parsed_file:
        input_path = args.parsed_file
    else:
        # Для обратной совместимости
        if args.route_name:
            safe_name = sanitize_filename(args.route_name)
            input_path = os.path.join(config.PARSED_DIR, f"parsed_addresses_{safe_name}.csv")
        else:
            input_path = os.path.join(config.PARSED_DIR, "parsed_addresses.csv")

    # Определяем путь к выходному файлу
    if args.route_name:
        safe_name = sanitize_filename(args.route_name)
        output_path = os.path.join(config.GEOCODED_DIR, f"geocoded_results_{safe_name}.csv")
    else:
        output_path = os.path.join(config.GEOCODED_DIR, "geocoded_results.csv")

    if not os.path.exists(input_path):
        print(f"❌ Файл {input_path} не найден. Сначала запусти парсинг маршрутов.")
        sys.exit(1)

    with open(input_path, "r", encoding="utf-8") as infile, open(output_path, "w", encoding="utf-8", newline="") as outfile:
        reader = csv.DictReader(infile)
        writer = csv.DictWriter(outfile, fieldnames=["excel_row", "route_name", "input", "found", "type", "description", "lat", "lon", "error"])
        writer.writeheader()

        for row in reader:
            address = row["normalized_address"]
            result = geocode_address(address)
            writer.writerow({
                "excel_row": row["excel_row"],
                "route_name": row["route_name"],
                "input": result["input"],
                "found": result["found"],
                "type": result["type"],
                "description": result["description"],
                "lat": result["lat"],
                "lon": result["lon"],
                "error": result["error"]
                })

    print(f"✅ Геокодирование для маршрута {args.route_name or 'всех маршрутов'} завершено.")

if __name__ == "__main__":
    main()
