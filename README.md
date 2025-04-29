# Система построения маршрутов

Система для построения и анализа маршрутов с использованием API 2GIS для геокодирования и расчета расстояний.

## Структура проекта

```
├── data/                      # Директория с данными
│   ├── geocoded_results/      # Геокодированные результаты
│   ├── parsed_addresses/      # Разобранные адреса
│   ├── route_results/         # Результаты расчета маршрутов
│   └── distance_matrix/       # Матрицы расстояний
├── frontend/                  # Веб-интерфейс на FastAPI
│   ├── static/                # Статические файлы
│   ├── templates/             # Шаблоны HTML
│   ├── data/                  # Локальные данные фронтенда
│   └── main.py                # Основной файл FastAPI
├── config.py                  # Конфигурация проекта
├── utils.py                   # Общие утилиты
├── geocoder.py                # Модуль геокодирования
├── route_distance.py          # Модуль расчета расстояний
├── parsing_route.py           # Модуль парсинга маршрутов
├── format_code.py             # Утилита форматирования кода
└── organize_project.py        # Утилита организации файлов
```

## Установка и запуск

1. Клонировать репозиторий:
   ```
   git clone <repository-url>
   cd postroenie_marshrutov_project
   ```

2. Установить зависимости:
   ```
   pip install -r requirements.txt
   ```

3. Запустить веб-интерфейс:
   ```
   cd frontend
   uvicorn main:app --reload
   ```
   Сервер будет доступен по адресу http://localhost:8000

## Использование

### Через веб-интерфейс

1. Загрузите Excel-файл с адресами
2. Просмотрите и исправьте адреса при необходимости
3. Запустите расчет маршрута
4. Просмотрите результаты

### Через командную строку

1. Парсинг исходных адресов:
   ```
   python parsing_route.py --excel_file путь/к/файлу.xlsx --route_name "Название маршрута"
   ```

2. Геокодирование адресов:
   ```
   python geocoder.py --route_name "Название маршрута"
   ```

3. Расчет расстояний:
   ```
   python route_distance.py --route_name "Название маршрута" --traffic_mode statistics
   ```

4. Запуск полного цикла:
   ```
   python run_all.py --excel_file путь/к/файлу.xlsx --route_name "Название маршрута"
   ```

## Утилиты для обслуживания

1. Форматирование кода:
   ```
   python format_code.py
   ```

2. Организация файлов:
   ```
   python organize_project.py --verbose
   ```

3. Проверка дубликатов файлов:
   ```
   python organize_project.py --check-duplicates
   ``` 