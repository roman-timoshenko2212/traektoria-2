import os
import re
import json
import config

def sanitize_filename(filename):
    """Преобразует строку в безопасное имя файла.
    
    Args:
        filename: Исходное имя файла или строка
        
    Returns:
        Безопасное имя файла, где все пробелы заменены на подчеркивания
    """
    if not isinstance(filename, str) or not filename:
        return "unnamed"
    
    # Просто заменяем пробелы на подчеркивания, сохраняя все остальные символы
    s = filename.strip().replace(' ', '_')
    return s if s else "unnamed"

def normalize_route_name(name):
    """Нормализует название маршрута для сопоставления"""
    if not isinstance(name, str):
        return ""
    # Убираем запятые, точки и другие знаки пунктуации
    s = re.sub(r'[,\.\;\:\-]', '', name)
    # Заменяем множественные пробелы/подчеркивания одним пробелом
    s = re.sub(r'[\s_]+', ' ', s)
    # Убираем пробелы в начале/конце и переводим в нижний регистр
    return s.strip().lower()

def sanitize_data_for_json(data):
    """Очищает данные перед JSON сериализацией"""
    import math
    
    if isinstance(data, dict):
        return {k: sanitize_data_for_json(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_data_for_json(item) for item in data]
    elif isinstance(data, float):
        if math.isnan(data) or math.isinf(data):
            return None  # Заменяем NaN/inf на None
        return data
    else:
        return data

def get_api_key(api_name="2gis"):
    """Получает API ключ из конфигурации"""
    return config.API_KEYS.get(api_name, "")

def ensure_data_dirs():
    """Создает необходимые директории для данных"""
    data_dirs = [
        config.DATA_DIR,
        config.GEOCODED_DIR,
        config.PARSED_DIR,
        config.ROUTE_RESULTS_DIR,
        config.DISTANCE_MATRIX_DIR
    ]
    
    for directory in data_dirs:
        os.makedirs(directory, exist_ok=True) 