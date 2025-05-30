import pandas as pd
import requests
from collections import defaultdict
from natasha import Segmenter, MorphVocab, NewsEmbedding, NewsNERTagger, Doc
import argparse
import os
import csv
import sys
import codecs

# Устанавливаем кодировку UTF-8 для stdout и stderr
sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())

# Определяем константы для путей
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT_DIR, "data")
PARSED_ADDRESSES_DIR = os.path.join(DATA_DIR, "parsed_addresses")
GEOCODED_DIR = os.path.join(DATA_DIR, "geocoded_results")
ROUTE_RESULTS_DIR = os.path.join(DATA_DIR, "route_results")

# Создаем директории, если они не существуют
os.makedirs(PARSED_ADDRESSES_DIR, exist_ok=True)
os.makedirs(GEOCODED_DIR, exist_ok=True)
os.makedirs(ROUTE_RESULTS_DIR, exist_ok=True)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--excel", required=True)
    parser.add_argument("--openrouter_key", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--route", help="Название конкретного маршрута для обработки", default=None)
    args = parser.parse_args()

    filepath = args.excel
    api_key = args.openrouter_key
    model = args.model
    target_route = args.route

    # Извлекаем все маршруты или только указанный
    routes = extract_routes(filepath, target_route)
    
    if not routes:
        print(f"❌ Маршрут(ы) не найден(ы).")
        return
        
    all_exceptions = [] # Список для всех исключений (для вывода в stdout)

    for route_name, addresses_with_rows in routes.items():
        addresses = [addr for _, addr in addresses_with_rows]
        current_route_addresses = [] # <-- Локальный список для адресов текущего маршрута
        route_exceptions = [] # <-- Локальный список для исключений текущего маршрута

        print(f"\n=== 🚚 Маршрут: {route_name} ===")
        cleaned_result = send_route_to_llm(route_name, addresses, api_key, model)
        lines = [line for line in cleaned_result.split("\n") if line.strip()]

        valid_lines_output = [] # Для вывода в консоль
        for i, (excel_row, _) in enumerate(addresses_with_rows):
            if i >= len(lines):
                print(f"⚠️ Недостаточно строк от LLM для строки Excel {excel_row}")
                # Можно добавить "пустую" запись или пропустить - пока пропускаем
                continue
            line = lines[i]
            if "." not in line:
                 print(f"⚠️ Некорректный формат строки от LLM (нет точки-разделителя): '{line}'")
                 # Решаем, добавлять ли как исключение? Пока добавляем исходный
                 original_address = addresses[i] # Берем исходный адрес
                 route_exceptions.append((excel_row, original_address))
                 current_route_addresses.append((excel_row, original_address))
                 continue
                 
            _, content = line.split(".", 1)
            content = content.strip()
            
            if is_only_region_and_district(content):
                # Добавляем в локальные и глобальные исключения
                route_exceptions.append((excel_row, content))
                all_exceptions.append((excel_row, content, route_name)) # Глобальный для stdout
                # Добавляем в адреса для сохранения в файл (как есть)
                current_route_addresses.append((excel_row, content)) 
            else:
                valid_lines_output.append(line) # Для вывода в консоль
                # Добавляем валидный адрес для сохранения в файл
                current_route_addresses.append((excel_row, content))

        print("\n=== ✅ Нормализованные адреса (для консоли) ===")
        for line in valid_lines_output:
            print(line)
            
        # --- Сохранение CSV для ТЕКУЩЕГО маршрута --- 
        file_name = sanitize_filename(route_name)
        output_path = os.path.join(PARSED_ADDRESSES_DIR, f"parsed_addresses_{file_name}.csv")
        
        try:
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            sorted_route_addresses = sorted(current_route_addresses, key=lambda x: x[0])
            
            with open(output_path, "w", encoding="utf-8", newline="") as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=["excel_row", "route_name", "normalized_address"])
                writer.writeheader()
                for row_num, address_text in sorted_route_addresses:
                    writer.writerow({
                        "excel_row": row_num,
                        "route_name": route_name, # Используем имя текущего маршрута
                        "normalized_address": address_text
                    })
            print(f"\n📄 Адреса маршрута '{route_name}' сохранены в {output_path}")
        except Exception as e:
             print(f"❌ Ошибка при сохранении CSV для маршрута '{route_name}': {e}")
        # --- Конец сохранения CSV для текущего маршрута --- 

    # Вывод исключений в stdout остается без изменений
    if all_exceptions:
        print("\n=== ⚠️ Требуют ручной проверки (единый список для stdout) ===")
        # Сортируем глобальный список по имени маршрута, затем по номеру строки
        sorted_global_exceptions = sorted(all_exceptions, key=lambda x: (x[2], x[0])) 
        for excel_row, text, route_nm in sorted_global_exceptions:
            print(f"Маршрут '{route_nm}', Строка {excel_row}: {text}")

# === Инициализация Natasha ===
segmenter = Segmenter()
morph_vocab = MorphVocab()
emb = NewsEmbedding()
ner_tagger = NewsNERTagger(emb)

PROMPT_TEMPLATE = """
Ты — интеллектуальный парсер адресов.
Твоя задача — преобразовать неформатированные адреса в строгий и понятный формат, пригодный для последующей отправки в геокодер.

Маршрут: {route_name}

‼️ Учитывай название маршрута при интерпретации неполных адресов. Оно может содержать информацию о регионе, городе или районе.

Требования:

Выводи каждый адрес строго по шаблону:
[Индекс], [Регион / область], [Район (если есть)], [Населённый пункт], [Улица], [Дом], [Корпус (если есть)]

Удаляй все лишние слова и символы, мешающие восприятию адреса: "дом", "кв.", "ориентир", телефоны, комментарии и прочее.

Не сокращай названия: "обл" → "область", "г" → "город", "ул" → "улица", и т.д.

Не придумывай ничего. Если нет данных — просто не указывай их.

Каждый адрес — с новой строки, с номером:

Пример:
Ввод:
1. ,399870, Липецкая обл, Лев-Толстовский р-н, , Лев Толстой п, Октябрьская ул, 1б, , , дом, корпус, кв.
2. ,399832, Липецкая обл, Данковский р-н, , Зверево с, , позвонить за 30 мин, , , дом, корпус, кв.
3. ,, Курская обл, , Курск г, , Косухина ул, 45А. АЗС Заправка, , , дом, корпус, кв.
4. ,399370, Липецкая обл, Усманский р-н, Усмань г, , Советская ул, 15, ДОСТАВКА ДО 17-00 ОБЕД С 12-13.00, , дом, корпус, кв.
5. Трасса М-4 599 км, 2, Бобровский район, Воронежская область
6. пос. подсобного хозяйства санатория им. Цюрупы, пос. подсобного хозяйства санатория им. Цюрупы, Лискинский район, Воронежская область, 397964

Вывод:
1. 399870, Липецкая область, Лев-Толстовский район, поселок Лев Толстой, Октябрьская улица, 1б
2. 399832, Липецкая область, Данковский район, село Зверево
3. Курская область, город Курск, улица Косухина, 45А
4. 399370, Липецкая область, Усманский район, город Усмань, Советская улица, 15
5. Воронежская область, Бобровский район, Трасса М-4 599 км, 2
6. 397964, Воронежская область, Лискинский район, поселок подсобного хозяйства санатория им. Цюрупы

Теперь обработай список:

Ввод:
{route_block}
"""

def send_route_to_llm(route_name, address_list, api_key, model):
    input_block = "\n".join(f"{i+1}. {addr}" for i, addr in enumerate(address_list))
    prompt = PROMPT_TEMPLATE.format(route_name=route_name, route_block=input_block)

    API_URL = "https://openrouter.ai/api/v1/chat/completions"
    HEADERS = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}]
    }

    response = requests.post(API_URL, headers=HEADERS, json=payload)
    if response.status_code == 200:
        return response.json()["choices"][0]["message"]["content"].strip()
    else:
        return f"❌ Ошибка: {response.status_code} — {response.text}"

def extract_routes(filepath, target_route=None):
    try:
        xls = pd.ExcelFile(filepath)
        df = pd.read_excel(xls, sheet_name=0)
    except Exception as e:
        print(f"❌ Ошибка чтения Excel файла '{filepath}': {e}")
        return {}
        
    routes = defaultdict(list)
    current_route = None
    seen_kontragents_in_route = set() # <-- Множество для отслеживания контрагентов в ТЕКУЩЕМ маршруте

    # --- Динамический поиск колонок --- 
    region_col_name = None
    address_col_name = "Адрес доставки"
    kontragent_col_name = None # <-- Имя колонки контрагентов
    driver_col_name = None # <--- Имя колонки водителя (Добавлено)
    
    for col in df.columns:
        col_str = str(col).strip() # Преобразуем в строку и убираем пробелы по краям
        if region_col_name is None and col_str.startswith("Регион/Маршрут"):
            region_col_name = col_str
        if kontragent_col_name is None and col_str.startswith("Контрагентов"):
             kontragent_col_name = col_str
        if driver_col_name is None and col_str.startswith("Водитель"): # <--- Ищем колонку Водитель (Добавлено)
             driver_col_name = col_str
            
    # Проверяем наличие всех необходимых колонок
    missing_cols = []
    if region_col_name is None: missing_cols.append("колонка, начинающаяся с 'Регион/Маршрут'")
    if address_col_name not in df.columns: missing_cols.append(f"колонка '{address_col_name}'")
    if kontragent_col_name is None: missing_cols.append("колонка, начинающаяся с 'Контрагентов'")
    # if driver_col_name is None: missing_cols.append("колонка, начинающаяся с 'Водитель'") # <-- Проверку здесь можно опустить, т.к. водитель не критичен для ЭТОГО скрипта
    
    if missing_cols:
         print(f"❌ В файле '{filepath}' отсутствуют необходимые колонки: { ' и '.join(missing_cols) }.")
         return {} # Возвращаем пустой словарь, если колонок нет
    # --- Конец поиска --- 

    print(f"  ℹ️ [extract_routes] Используются колонки: Регион='{region_col_name}', Адрес='{address_col_name}', Контрагент='{kontragent_col_name}'")
    # Добавим лог для водителя, если колонка найдена
    if driver_col_name:
        print(f"  ℹ️ [extract_routes] Колонка водителя найдена: '{driver_col_name}'")
    else:
        print("  ⚠️ [extract_routes] Колонка водителя не найдена.")

    for idx, row in df.iterrows():
        # Используем найденные имена
        region = row.get(region_col_name)
        address = row.get(address_col_name)
        kontragent = row.get(kontragent_col_name) # <-- Получаем контрагента
        # driver = row.get(driver_col_name) # <-- Водителя здесь не используем, только извлекаем адреса
        
        # Определяем начало нового маршрута
        is_new_route_marker = False
        if pd.notna(region) and isinstance(region, str) and region.strip():
            potential_new_route = region.strip()
            if pd.isna(address) or not str(address).strip() or current_route is None or potential_new_route != current_route:
                 is_new_route_marker = True
                 current_route = potential_new_route
                 seen_kontragents_in_route.clear() # <-- Очищаем сет контрагентов для нового маршрута
                 # print(f"   -> Обнаружен новый маршрут: {current_route}") 
        
        # Добавляем адрес к ТЕКУЩЕМУ маршруту, если:
        # 1. Маршрут определен
        # 2. Адрес есть
        # 3. Контрагент есть и он еще НЕ встречался в ЭТОМ маршруте
        if current_route and pd.notna(address) and isinstance(address, str) and address.strip():
            if pd.notna(kontragent) and isinstance(kontragent, str) and kontragent.strip():
                kontragent_key = kontragent.strip()
                if kontragent_key not in seen_kontragents_in_route:
                    seen_kontragents_in_route.add(kontragent_key) # Добавляем контрагента в сет
                    routes[current_route].append((idx + 2, address.strip()))
                    # print(f"     Добавляем адрес для '{kontragent_key}' к '{current_route}' (строка Excel {idx+2})")
                # else:
                    # print(f"     Пропуск строки {idx+2}: дубликат контрагента '{kontragent_key}' в маршруте '{current_route}'")
            # else:
                 # print(f"     Пропуск строки {idx+2}: отсутствует или некорректный контрагент для маршрута '{current_route}'")
        
    # Удаляем маршруты без адресов (на всякий случай)
    routes = {r: adds for r, adds in routes.items() if adds}

    # Если указан конкретный маршрут, возвращаем только его
    if target_route:
        if target_route in routes:
             return {target_route: routes[target_route]}
        else:
             print(f"⚠️ Маршрут '{target_route}' не найден в файле (после извлечения). Проверьте имя.")
             return {}
    
    return routes

def is_only_region_and_district(text):
    doc = Doc(text)
    doc.segment(segmenter)
    doc.tag_ner(ner_tagger)
    entities = [span.text.lower() for span in doc.spans if span.type == "LOC"]
    if not entities:
        return False
    return all(any(kw in ent for kw in ["область", "край", "район"]) for ent in entities)

# Вспомогательная функция для создания безопасных имен файлов
def sanitize_filename(filename):
    """Преобразует строку в безопасное имя файла"""
    if not isinstance(filename, str):
        return "unnamed"
    # Заменяем пробелы на подчеркивания, сохраняя все остальные символы
    s = filename.strip().replace(' ', '_')
    return s if s else "unnamed"

if __name__ == "__main__":
    main()
