import os

# Пути к директориям
DATA_DIR = "data"
GEOCODED_DIR = os.path.join(DATA_DIR, "geocoded_results")
PARSED_DIR = os.path.join(DATA_DIR, "parsed_addresses")
ROUTE_RESULTS_DIR = os.path.join(DATA_DIR, "route_results")
DISTANCE_MATRIX_DIR = os.path.join(DATA_DIR, "distance_matrix")
CACHE_FILE = os.path.join(DATA_DIR, "distance_cache.json")

# Режим работы (True = без API-запросов, использование существующих данных)
OFFLINE_MODE = False

# Координаты офиса РТК (Стартовая/конечная точка)
OFFICE_LOCATION = {
    "lat": 51.686288,
    "lon": 39.266546,
    "name": "Офис РТК" # Добавим имя для ясности
}

# API ключи
API_KEYS = {
    "2gis": "4d9c0e8c-fd7f-4438-bbde-b5caa26c5db0"
}

# URL для API
API_URLS = {
    "2gis_geocode": "https://catalog.api.2gis.com/3.0/items/geocode",
    "2gis_matrix": "https://routing.api.2gis.com/get_dist_matrix"
}

# Настройки маршрутизации
ROUTING_SETTINGS = {
    "traffic_mode": "statistics",  # jam или statistics
    "chunk_size": 10,  # Размер чанков для матричного расчета
    "use_cache": True  # Использовать ли кэширование
} 