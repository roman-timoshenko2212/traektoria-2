import argparse
import csv
import json
import os
import requests
import sys
import time
import pandas as pd
from datetime import datetime, timedelta, time as dt_time
import re
import random
import math
from typing import List, Dict, Any, Optional

import config
from utils import ensure_data_dirs, get_api_key

# Переопределяем функцию sanitize_filename для единообразия форматирования
def sanitize_filename(filename):
    """Преобразует строку в безопасное имя файла по единому правилу"""
    if not isinstance(filename, str):
        return "unnamed"
    
    # Просто заменяем пробелы на подчеркивания
    s = filename.strip().replace(' ', '_')
    return s if s else "unnamed"

ensure_data_dirs()

def parse_args():
    parser = argparse.ArgumentParser(description='Calculate route distances for a sequence of points.')
    parser.add_argument('--geocoded_file', type=str, help='Path to geocoded results file.')
    parser.add_argument('--route_name', type=str, help='Name of the route to process.')
    parser.add_argument('--output_path', type=str, help='Path to save the route results.')
    parser.add_argument('--traffic_mode', type=str, choices=['jam', 'statistics'], default='statistics', 
                       help='Traffic mode: "jam" for current traffic, "statistics" for historical data at 9:00 AM')
    return parser.parse_args()

def get_input_file_path(route_name, geocoded_file_arg=None):
    """Определяет путь к файлу с геокодированными данными."""
    if geocoded_file_arg:
        return geocoded_file_arg
    
    if route_name:
        # Try to find route-specific geocoded file
        safe_name = sanitize_filename(route_name)
        route_specific_file = os.path.join(config.GEOCODED_DIR, f"geocoded_results_{safe_name}.csv")
        if os.path.exists(route_specific_file):
            return route_specific_file
        else:
            print(f"⚠️ Не найден специфичный файл для маршрута: {route_specific_file}")
            # Можно вернуть None или стандартное имя, решим по ходу
            # return os.path.join(config.GEOCODED_DIR, "geocoded_results.csv") # Стандартное имя? 
            return None # Лучше вернуть None, если файл не найден
    
    # Default to the standard filename if no route_name provided
    # return os.path.join(config.GEOCODED_DIR, "geocoded_results.csv")
    return None # Если имя маршрута не задано, файл не определить

def calculate_route_in_chunks(points, api_key, start_time_iso, traffic_mode='statistics'):
    """
    Рассчитывает расстояния между последовательными точками маршрута.
    
    Args:
        points: Список точек в формате [{"lat": float, "lon": float}, ...]
        api_key: API ключ 2GIS
        start_time_iso: ISO 8601 UTC время для запроса
        traffic_mode: Режим расчета пробок ('jam' или 'statistics')
        
    Returns:
        Список результатов с информацией о расстоянии и времени между каждой парой точек
    """
    results = []
    
    # Проходим по парам последовательных точек
    for i in range(len(points) - 1):
        point_pair = [points[i], points[i + 1]]
        
        # Рассчитываем расстояние между текущей парой точек
        print(f"[calculate_route_in_chunks] Вызов calculate_matrix_chunk для пары {i}-{i+1} с start_time: {start_time_iso}, mode: {traffic_mode}")
        chunk_result = calculate_matrix_chunk(point_pair, api_key, start_time_iso=start_time_iso, traffic_mode=traffic_mode)
        
        if chunk_result:
            # Извлекаем результат для пары точек
            pair_result = chunk_result.get("0:1", {})
            
            # Добавляем информацию о точках и индексах
            result = {
                "from_index": i,
                "to_index": i + 1,
                "from_point": point_pair[0],
                "to_point": point_pair[1],
                "distance": pair_result.get("distance", 0),
                "duration": pair_result.get("duration", 0),
                "status": pair_result.get("status", "ERROR")
            }
            
            results.append(result)
            print(f"✅ Обработана пара точек {i} -> {i+1}")
        else:
            print(f"❌ Ошибка при обработке пары точек {i} -> {i+1}")
            results.append({
                "from_index": i,
                "to_index": i + 1,
                "from_point": point_pair[0],
                "to_point": point_pair[1],
                "distance": 0,
                "duration": 0,
                "status": "ERROR"
            })
    
    return results

def calculate_matrix_chunk(points, api_key, start_time_iso, traffic_mode='statistics'):
    """
    Рассчитывает расстояние между двумя последовательными точками маршрута,
    используя структуру запроса, аналогичную test_2gis_api.py.

    Args:
        points: Список из двух точек в формате [{"lat": float, "lon": float}, ...]
        api_key: API ключ 2GIS
        start_time_iso: ISO 8601 UTC время для запроса
        traffic_mode: Режим расчета пробок ('jam' или 'statistics')

    Returns:
        Словарь с информацией о расстоянии и времени между точками,
        или None в случае ошибки.
    """
    if len(points) != 2:
        print(f"❌ Ожидается ровно 2 точки, получено: {len(points)}")
        return None

    # Проверяем OFFLINE_MODE
    if hasattr(config, 'OFFLINE_MODE') and config.OFFLINE_MODE:
        print("🔄 Работаем в OFFLINE режиме, используем демо-данные вместо API")
        try:
            lat_diff = points[1]["lat"] - points[0]["lat"]
            lon_diff = points[1]["lon"] - points[0]["lon"]
            distance_km = 111.0 * ((lat_diff**2 + lon_diff**2)**0.5)
            distance_m = int(distance_km * 1000 * (1 + random.uniform(0.1, 0.3)))
            duration_sec = int(distance_km / 40 * 3600)

            return {
                "0:1": {
                    "distance": distance_m,
                    "duration": duration_sec,
                    "status": "OK"
                }
            }
        except Exception as e:
            print(f"⚠️ Ошибка при создании демо-данных: {e}")
            return None

    # Если не в OFFLINE режиме, продолжаем обычное выполнение с API-запросами
    url = config.API_URLS["2gis_matrix"]

    # Формируем параметры URL
    params = {
        "key": api_key,
        "version": "2.0"
    }

    # Формируем тело запроса
    payload = {
        "points": points,
        "sources": [0],             # Индекс точки отправления в points
        "targets": [1],             # Индекс точки назначения в points
        "transport": "driving",     # Тип транспорта (автомобиль)
        "type": traffic_mode,       # Используем переданный режим ('statistics' или другой)
        "start_time": start_time_iso # Используем переданное время
    }
    print(f"[calculate_matrix_chunk] Сформирован payload: type={payload.get('type')}, start_time={payload.get('start_time')}")
    # print(f"   Тело JSON: {json.dumps(payload)}") # Для отладки

    # Заголовки
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
        # Можно добавить User-Agent как в тесте, если нужно
        # "User-Agent": "PostroenieMarshrutov/1.0"
    }

    try:
        print(f"📤 Отправляем запрос к API:")
        print(f"   URL: {url}")
        print(f"   Параметры URL: {params}")
        print(f"   Тело JSON: {json.dumps(payload, ensure_ascii=False)}")

        # Отправляем запрос с ключом в параметрах URL и данными в теле
        response = requests.post(url, params=params, json=payload, headers=headers)

        print(f"📥 Получен ответ от API (Статус: {response.status_code}):")
        if response.text:
             print(f"   Тело ответа: {response.text[:500]}...") # Печатаем начало ответа

        if response.status_code == 200:
            response_data = response.json()

            if "routes" in response_data and response_data["routes"]:
                # Результат для пары 0 -> 1 должен быть первым в списке routes
                route_result = response_data["routes"][0]

                if route_result.get("status") == "OK":
                    distance = route_result.get("distance", 0)
                    duration = route_result.get("duration", 0)
                    print(f"  ✅ Расстояние: {distance/1000:.1f} км, Время: {duration/60:.1f} мин")
                    return {
                        "0:1": { # Ключ оставляем прежним для совместимости с calculate_route_in_chunks
                            "distance": distance,
                            "duration": duration,
                            "status": "OK"
                        }
                    }
                else:
                    error_status = route_result.get('status', 'Неизвестная ошибка API')
                    print(f"❌ Ошибка расчета в ответе API: {error_status}")
                    return { "0:1": { "distance": 0, "duration": 0, "status": error_status } } # Возвращаем ошибку
            else:
                print("❌ Структура ответа API не содержит ожидаемых данных ('routes')")
                return None # Или вернуть ошибку?
        else:
            print(f"❌ Ошибка HTTP: {response.status_code}")
            # Попытка извлечь сообщение об ошибке из ответа, если есть
            try:
                 error_details = response.json()
                 error_message = error_details.get("message", response.text)
                 print(f"   Детали ошибки: {error_message}")
                 # Возвращаем статус ошибки, если можем его извлечь
                 if isinstance(error_details, dict) and "message" in error_details:
                     return { "0:1": { "distance": 0, "duration": 0, "status": f"HTTP_{response.status_code}_{error_details.get('type', 'ERROR')}" } }
            except json.JSONDecodeError:
                 print(f"   Ответ не является валидным JSON: {response.text[:200]}...")
            # Возвращаем общую ошибку, если не удалось распарсить
            return { "0:1": { "distance": 0, "duration": 0, "status": f"HTTP_{response.status_code}" } }

    except requests.exceptions.RequestException as e:
        print(f"❌ Ошибка сети при обращении к API: {e}")
        return None # Возвращаем None при сетевой ошибке
    except Exception as e:
        print(f"❌ Непредвиденная ошибка при обращении к API: {e}")
        return None

def save_distance_matrix_to_csv(points, matrix, route_name=None):
    """Сохраняет матрицу расстояний в CSV файл для анализа"""
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"distance_matrix_{route_name}_{timestamp}.csv" if route_name else f"distance_matrix_{timestamp}.csv"
        
        with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            
            # Заголовок: ID точек
            header = ['From', 'To', 'From Lat', 'From Lon', 'To Lat', 'To Lon', 'Distance (m)', 'Duration (sec)', 'Status', 'Reliability']
            writer.writerow(header)  # Используем writerow вместо writeheader для csv.writer
            
            # Перебираем каждую запись в матрице
            for route in matrix:
                source_id = route.get("source_id")
                target_id = route.get("target_id")
                status = route.get("status", "UNKNOWN")
                reliability = route.get("reliability", 1)
                
                if source_id is not None and target_id is not None and source_id < len(points):
                    # Получаем источник
                    from_idx = source_id
                    if from_idx < len(points):
                        from_point = points[from_idx]
                        from_lat = from_point.get("lat", "N/A")
                        from_lon = from_point.get("lon", "N/A")
                    else:
                        from_lat, from_lon = "N/A", "N/A"
                    
                    # Получаем назначение
                    to_idx = target_id
                    if to_idx < len(points):
                        to_point = points[to_idx]
                        to_lat = to_point.get("lat", "N/A")
                        to_lon = to_point.get("lon", "N/A")
                    else:
                        to_lat, to_lon = "N/A", "N/A"
                    
                    # Извлекаем данные маршрута
                    distance = route.get("distance", 0)
                    duration = route.get("duration", 0)
                    
                    # Записываем строку
                    row = [
                        source_id, 
                        target_id, 
                        from_lat, 
                        from_lon,
                        to_lat, 
                        to_lon,
                        distance, 
                        duration, 
                        status,
                        reliability
                    ]
                    writer.writerow(row)
        
        print(f"✅ Матрица расстояний сохранена в {filename}")
    except Exception as e:
        print(f"❌ Ошибка при сохранении матрицы расстояний: {e}")

def calculate_and_save_route(route_name, geocoded_file_path, output_dir=config.ROUTE_RESULTS_DIR, traffic_mode='jam', report_date_str=None):
    """
    Основная функция для расчета маршрута и сохранения результата.
    Вызывается как из main(), так и напрямую из других модулей.
    
    Args:
        route_name (str): Имя маршрута.
        geocoded_file_path (str): Путь к JSON файлу с геокодированными точками.
        output_dir (str): Директория для сохранения JSON результата.
        traffic_mode (str): Режим учета пробок ('jam' или 'statistics').
        report_date_str (str, optional): Дата отчета в формате YYYY-MM-DD. Defaults to None.
        
    Returns:
        bool: True в случае успеха, False в случае ошибки.
    """
    print(f"\n--- Запуск расчета для маршрута: {route_name} ---")
    print(f"   Входной файл: {geocoded_file_path}")
    print(f"   Режим пробок: {traffic_mode}")
    print(f"   Дата отчета (получено): {report_date_str}")
    
    # Проверяем OFFLINE режим
    if hasattr(config, 'OFFLINE_MODE') and config.OFFLINE_MODE:
        print("\n🔌 ВНИМАНИЕ: Программа запущена в OFFLINE режиме! (из calculate_and_save_route)")
        # Логика OFFLINE режима (проверка существования файла) может быть перенесена сюда, если нужно
    
    if not os.path.exists(geocoded_file_path):
        print(f"❌ Файл {geocoded_file_path} не найден.")
        return False
    
    # Определяем имя выходного файла JSON
    sanitized_name = sanitize_filename(route_name)
    output_path = os.path.join(output_dir, f"route_results_{sanitized_name}.json")
    
    # Получаем API ключ 2GIS
    api_key = get_api_key("2gis")
    if not api_key:
        print("❌ Ошибка: API ключ для '2gis' не найден в config.py или пустой.")
        return False
    else:
        print("🔑 API ключ 2GIS успешно получен.")

    # --- ДОБАВЛЕНО: Получение start_time_iso --- 
    start_time_iso = get_start_time_iso(report_date_str)
    if not start_time_iso:
        print(f"❌ Не удалось определить время начала (start_time) для расчета. Проверьте формат даты отчета (если указана).")
        return False # Прерываем расчет, если время не определено
    print(f"   Время для расчета (start_time): {start_time_iso}")
    # --- КОНЕЦ ДОБАВЛЕНИЯ ---

    # --- Загрузка точек из JSON --- 
    points_from_file = []
    try:
        with open(geocoded_file_path, 'r', encoding='utf-8') as f:
            geocoded_data = json.load(f) # Читаем JSON
            
        # Проверяем, что загружен список
        if not isinstance(geocoded_data, list):
            print(f"❌ Ошибка: Файл {geocoded_file_path} не содержит ожидаемый список точек.")
            return False
            
        # Извлекаем валидные координаты
        for point in geocoded_data:
            if isinstance(point, dict) and pd.notna(point.get('lat')) and pd.notna(point.get('lon')):
                try:
                    lat = float(point['lat'])
                    lon = float(point['lon'])
                    if -90 <= lat <= 90 and -180 <= lon <= 180:
                        points_from_file.append({"lat": lat, "lon": lon})
                    else:
                        print(f"⚠️ Некорректный диапазон координат в файле {geocoded_file_path}: lat={lat}, lon={lon} (вход: {point.get('input', '?')})")
                except (ValueError, TypeError):
                    print(f"⚠️ Невозможно преобразовать координаты в числа в файле {geocoded_file_path}: {point.get('lat')}, {point.get('lon')} (вход: {point.get('input', '?')})")
            # else: # Опционально: логировать точки без координат или некорректного формата
            #     print(f"   Пропущена точка из {geocoded_file_path} без валидных lat/lon: {point}")
                 
    except FileNotFoundError:
        print(f"❌ Ошибка: Файл не найден при попытке чтения: {geocoded_file_path}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ Ошибка декодирования JSON файла {geocoded_file_path}: {e}")
        return False
    except Exception as e:
        print(f"❌ Непредвиденная ошибка при чтении или обработке JSON файла {geocoded_file_path}: {e}")
        return False

    if not points_from_file:
        print(f"❌ Не найдено валидных точек в файле {geocoded_file_path}")
        return False
    print(f"✅ Загружено {len(points_from_file)} точек из {geocoded_file_path}")

    # --- Добавление склада в начало и конец --- 
    points = []
    try:
        # Используем новые координаты офиса
        start_end_point = config.OFFICE_LOCATION
        point_name = start_end_point.get("name", "Стартовая/конечная точка")
        
        if not isinstance(start_end_point, dict) or "lat" not in start_end_point or "lon" not in start_end_point:
             print(f"❌ Ошибка: OFFICE_LOCATION не найден или некорректен в config.py")
             return False
        
        # --- ИСПРАВЛЕНО: Формируем список точек ТОЛЬКО с нужными полями lat, lon ---
        office_coords = {"lat": start_end_point["lat"], "lon": start_end_point["lon"]}
        # points_from_file уже содержит словари вида {"lat": ..., "lon": ...}
        points = [office_coords] + points_from_file + [office_coords]
        # --- КОНЕЦ ИСПРАВЛЕНИЯ ---
        print(f"📍 Добавлен {point_name} ({office_coords['lat']}, {office_coords['lon']}). Итого точек для маршрута: {len(points)}")
        
    except AttributeError:
        # Сообщение об ошибке тоже обновляем
        print("❌ Ошибка: Переменная OFFICE_LOCATION не найдена в config.py")
        return False
    except Exception as e:
        print(f"❌ Непредвиденная ошибка при добавлении стартовой/конечной точки: {e}")
        return False
    
    # --- Расчет маршрута --- 
    print(f"\n🚀 Начинаем расчет сегментов для {len(points)} точек...")
    segments = calculate_route_in_chunks(points, api_key, start_time_iso, traffic_mode=traffic_mode)

    # Проверка, что расчет прошел хотя бы частично
    if not segments:
         print("❌ Не удалось рассчитать ни одного сегмента.")
         # Решаем, возвращать False или сохранять пустой результат?
         # Пока сохраним пустой
         segments = [] 

    total_distance = sum(seg.get('distance', 0) for seg in segments if seg.get('status') == 'OK')
    total_duration = sum(seg.get('duration', 0) for seg in segments if seg.get('status') == 'OK')

    result_data = {
        "route_name": route_name,
        "points_count": len(points), 
        "calculation_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_distance": total_distance,
        "total_duration": total_duration,
        "segments": segments,
        # --- ДОБАВЛЕНО: Сохраняем использованное время --- 
        "start_time_used": start_time_iso 
        # --- КОНЕЦ ДОБАВЛЕНИЯ --- 
    }
    
    # --- Сохранение результата --- 
    try:
        os.makedirs(output_dir, exist_ok=True) # Убедимся, что директория есть
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result_data, f, ensure_ascii=False, indent=2)
        print(f"\n✅ Результат расчета маршрута сохранен в {output_path}")
        print(f"📏 Общее расстояние: {total_distance/1000:.2f} км")
        print(f"⏱️ Общее время: {total_duration//3600} ч {(total_duration%3600)//60} мин")
        return True # Успех
    except IOError as e:
        print(f"❌ Ошибка записи JSON файла {output_path}: {e}")
        return False
    except Exception as e:
        print(f"❌ Непредвиденная ошибка при сохранении JSON файла: {e}")
        return False

# --- НОВАЯ ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ СЕГМЕНТОВ --- 
def get_route_segments(points: List[Dict[str, float]], start_time_iso: Optional[str] = None, traffic_mode: str = 'statistics') -> List[Dict[str, Any]]:
    """
    Рассчитывает сегменты маршрута между точками, не сохраняя результат.
    Использует существующую логику calculate_route_in_chunks.
    
    Args:
        points: Список точек в формате [{"lat": float, "lon": float}, ...]
        start_time_iso (str, optional): ISO 8601 UTC время для запроса. Если None, будет использовано время по умолчанию.
        traffic_mode (str): Режим учета пробок ('jam' или 'statistics').
        
    Returns:
        Список словарей, описывающих сегменты маршрута (расстояние, время, статус).
        Пустой список, если точек меньше 2 или произошла ошибка.
    """
    if len(points) < 2:
        print("⚠️ get_route_segments: Требуется как минимум 2 точки для расчета.")
        return []
        
    api_key = get_api_key("2gis")
    if not api_key:
        print("❌ get_route_segments: API ключ 2GIS не найден.")
        # Можно вернуть ошибку или пустой список
        return [] 

    # --- ДОБАВЛЕНО: Определяем start_time_iso, если он не передан ---
    if not start_time_iso:
        print("⚠️ get_route_segments: start_time_iso не передан, будет использовано время по умолчанию.")
        start_time_iso = get_start_time_iso() # Используем функцию для получения дефолтного времени
        if not start_time_iso:
             print("❌ get_route_segments: Не удалось получить время по умолчанию. Расчет невозможен.")
             return []
    # --- КОНЕЦ ДОБАВЛЕНИЯ ---
             
    try:
        # --- ИЗМЕНЕНО: Передаем параметры в calculate_route_in_chunks ---
        print(f"[get_route_segments] Calling calculate_route_in_chunks with start_time: {start_time_iso}, mode: {traffic_mode}")
        segments = calculate_route_in_chunks(points, api_key, start_time_iso=start_time_iso, traffic_mode=traffic_mode)
        # --- КОНЕЦ ИЗМЕНЕНИЯ ---
        return segments
    except Exception as e:
        print(f"❌ get_route_segments: Ошибка при вызове calculate_route_in_chunks: {e}")
        return []
# --- КОНЕЦ НОВОЙ ФУНКЦИИ ---

# --- НОВАЯ ФУНКЦИЯ --- 
def get_start_time_iso(report_date_str=None):
    """Определяет дату и время для параметра start_time API 2GIS в формате ISO 8601 UTC.

    Args:
        report_date_str (str, optional): Дата отчета в формате 'YYYY-MM-DD'.
                                         Если None, используется сегодня - 7 дней.
                                         Defaults to None.

    Returns:
        str: Дата и время в формате 'YYYY-MM-DDTHH:MM:SSZ'.
             Возвращает None в случае ошибки парсинга даты.
    """
    target_date = None
    try:
        if report_date_str:
            # Пытаемся распарсить предоставленную дату
            target_date = datetime.strptime(report_date_str, '%Y-%m-%d').date()
            print(f"[get_start_time_iso] Используется указанная дата отчета: {target_date}")
        else:
            # Используем сегодня минус 7 дней
            target_date = datetime.now().date() - timedelta(days=7)
            print(f"[get_start_time_iso] Дата отчета не указана. Используется дата: {target_date} (сегодня - 7 дней)")

        # Устанавливаем время 8:00
        target_datetime = datetime.combine(target_date, dt_time(8, 0, 0))

        # Форматируем в ISO 8601 UTC (добавляем 'Z')
        iso_string = target_datetime.isoformat() + "Z"
        print(f"[get_start_time_iso] Сформированная строка start_time: {iso_string}")
        return iso_string

    except ValueError:
        print(f"[get_start_time_iso] Ошибка: Неверный формат даты отчета '{report_date_str}'. Ожидался 'YYYY-MM-DD'.")
        return None # Возвращаем None в случае ошибки
    except Exception as e:
        print(f"[get_start_time_iso] Произошла непредвиденная ошибка при расчете start_time: {e}")
        return None
# --- КОНЕЦ НОВОЙ ФУНКЦИИ ---

def main():
    args = parse_args()
    
    # Определяем входной файл
    input_file = get_input_file_path(args.route_name, args.geocoded_file)
    if not input_file:
        print("❌ Не удалось определить входной файл JSON. Укажите --route_name или --geocoded_file.")
        sys.exit(1)
        
    # Определяем директорию для вывода (если задан полный путь)
    output_dir = config.ROUTE_RESULTS_DIR
    if args.output_path:
         # Если указан полный путь, берем его директорию
         output_dir = os.path.dirname(args.output_path)
         # Добавим проверку, что директория существует или ее можно создать?
         # Пока предполагаем, что calculate_and_save_route создаст ее
         # Важно: calculate_and_save_route сама формирует имя файла, 
         # так что передавать output_path напрямую в нее не нужно, только директорию.

    # Вызываем новую основную функцию
    success = calculate_and_save_route(
        route_name=args.route_name, 
        geocoded_file_path=input_file, 
        output_dir=output_dir, 
        traffic_mode=args.traffic_mode or 'jam', # Передаем режим или 'jam' по умолч.
        report_date_str=args.report_date_str
    )
    
    if not success:
        sys.exit(1) # Завершаем с ошибкой, если расчет не удался

if __name__ == "__main__":
    main()
