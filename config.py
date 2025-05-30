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
    "2gis": "4d9c0e8c-fd7f-4438-bbde-b5caa26c5db0",
    "openrouter": "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"  # <--- ЗАМЕНИТЕ НА СВОЙ КЛЮЧ
}

# URL для API
API_URLS = {
    "2gis_geocode": "https://catalog.api.2gis.com/3.0/items/geocode",
    "2gis_matrix": "https://routing.api.2gis.com/get_dist_matrix",
    "openrouter_chat_completions": "https://openrouter.ai/api/v1/chat/completions"
}

# Настройки LLM (языковой модели)
LLM_SETTINGS = {
    "model_name": "google/gemini-flash-1.5"
}

# Настройки маршрутизации
ROUTING_SETTINGS = {
    "traffic_mode": "statistics",  # jam или statistics
    "chunk_size": 10,  # Размер чанков для матричного расчета
    "use_cache": True  # Использовать ли кэширование
} 