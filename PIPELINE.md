# Пайплайн обработки данных в проекте Postroenie Marshrutov

Документ подробно описывает последовательность шагов и взаимосвязь компонентов проекта для быстрого погружения нового разработчика.

---
## 1. Загрузка исходного файла (Excel)

Эндпоинт: POST `/api/upload`
- Ввод: Excel-файл с адресами, время на точку, дата отчета
- Действия:
  1. Сохраняет файл во `frontend/uploaded/`
  2. Устанавливает в `route_data`: `current_file`, `report_date_str`, `global_service_time_minutes`
  3. Считывает Excel через `pandas.read_excel`
  4. Динамически находит колонки:
     - Регион/Маршрут
     - Адрес доставки
     - Контрагенты
     - Водитель
  5. Собирает словарь маршрутов с номерами строк и адресами

Файлы локации: `frontend/uploaded/{имя файла}`

**Интерфейс шага 1 (Загрузка файла):**
- HTML:
  - `<div id="step-1-content" class="step-content">` — контейнер экрана загрузки
  - `<div id="upload-area" class="upload-area">` — область drag&drop и клика
  - `<input type="file" id="file-input" name="file" accept=".xlsx, .xls" style="display: none;">`
  - `<input type="number" id="service-time-input" name="service_time_per_stop_minutes" placeholder="мин" min="0">`
  - `<input type="date" id="report-date-input" name="report_date">`
  - `<button type="button" id="step-1-next-btn" class="btn" disabled>Далее</button>`
- JavaScript:
  - Обработчик выбора/drag&drop файла: активирует `#step-1-next-btn`, показывает имя файла
  - При клике кнопки `#step-1-next-btn`: создает `FormData`, добавляет `file`, `service_time_per_stop_minutes`, `report_date`
  - Вызывает `fetch('/api/upload', { method: 'POST', body: formData })`
  - Отображает оверлей `#loading` и сообщение загрузки, обрабатывает JSON-ответ
  - При ошибках показывает `#error-container` и лог `#persistent-error-log`, при успехе переключает на шаг 2 или 3
- API-контракт:
  - Request: multipart/form-data поля:
    - `file`: файл Excel
    - `service_time_per_stop_minutes`: целое число
    - `report_date`: строка формата `YYYY-MM-DD`
  - Response JSON:
    ```json
    { "status": "needs_correction", "exceptions": [...], "routes": [...] }
    ```
    или
    ```json
    { "status": "processed", "exceptions": [], "routes": [...] }
    ```

---
## 2. Парсинг и нормализация адресов

Скрипт: `parsing_route.py`
- Запускается из `main.py` через `subprocess.run`
- На вход получает файл Excel и параметры LLM
- Вызывает Natasha + OpenRouter для нормализации каждым адреса
- Вывод:
  - CSV-файл `data/parsed_addresses/parsed_addresses_{route}.csv`
  - Список исключений, если формат невозможен

Ответ в `main.py`
- Если есть исключения, возвращается статус `needs_correction` и список ошибок
- Если ошибок нет, переходим к геокодированию

---
## 3. Корректировка вручную

Эндпоинт: POST `/api/submit-corrections`
- Получает исправления для `parsed_addresses_{route}.csv`
- Вносит изменения в CSV (loop 1)
- Повторно запускает геокодирование и расчёт для всех маршрутов (loop 2)
- Возвращает статус `saved` и обновлённый список маршрутов

**Интерфейс шага 2 (корректировка адресов):**
- HTML:
  - `<div id="step-2-content" class="step-content hidden">` — контейнер экрана
  - `<form id="corrections-form">` — форма с таблицей исправлений
  - `<tbody id="exceptions-table">` — тело таблицы
  - Строка таблицы:
    ```html
    <tr>
      <td>{{route_name}}</td>
      <td>{{original_address}}</td>
      <td><input type="text" name="corrections[{{route_name}}][{{row}}]" value="{{corrected_address}}"></td>
    </tr>
    ```
  - Кнопки:
    - Назад: `<button type="button" class="btn btn-outline" data-step="1">Назад</button>`
    - Продолжить: `<button type="submit" class="btn">Продолжить</button>`

- JavaScript:
  - На событии `submit` формы собирает все `<input name^=\"corrections\">` и формирует массив объектов:
    ```js
    corrections = Array.from(document.querySelectorAll('#corrections-form input')).map(input => {
      const parts = input.name.match(/corrections\[(.*)\]\[(\d+)\]/);
      return { route: parts[1], row: Number(parts[2]), corrected: input.value };
    });
    ```
  - Отправляет POST на `/api/submit-corrections` с JSON `{ "corrections": corrections }`
  - По ответу `{status:"saved"}` скрывает форму и показывает `<div id="correction-success">`, обновляет счетчик `#correction-count`

- API-контракт для исправлений:
  - Request JSON:
    ```json
    { "corrections": [ {"route":"Маршрут1","row":2,"corrected":"Новый адрес"}, ... ] }
    ```
  - Response JSON: `{ "status": "saved", "routes": [...], "exceptions": [] }`

---
## 4. Геокодирование адресов

Скрипт: `geocoder.py` (функция `geocode_address`)
- Читает CSV `data/parsed_addresses/parsed_addresses_{route}.csv`
- Для каждого адреса отправляет запрос к 2GIS API
- Подставляет тип, описание, координаты
- Сохраняет результат в CSV: `data/geocoded_results/geocoded_results_{route}.csv`

В `main.py`:
- Функция `process_route` оборачивает geocoding + дальнейшие шаги

---
## 5. Расчёт дистанций и времени

Скрипт: `route_distance.py`, функция `calculate_and_save_route`
- Читает `geocoded_results_{route}.csv`
- Строит точки маршрута, добавляет офис из `config.OFFICE_LOCATION`
- Разбивает точки на пары и вызывает API 2GIS Matrix или OFFLINE расчёт
- Собирает массив результатов и сохраняет JSON: `data/route_results/route_results_{route}.json`
- Возвращает `True/False` о результате расчёта

**Интерфейс шага 3 (Экран результатов):**
- HTML:
  - `<div id="step-3-content" class="step-content hidden">` — контейнер для результата
  - `<div id="map-container" class="map-container">` — область карты Leaflet
  - `<div id="route-info">` — панель с данными маршрута:
      - `<strong id="route-name-header"></strong>` — название маршрута
      - `<span id="distance-value"></span>` — общее расстояние
      - `<span id="duration-value"></span>` — время в пути
      - `<span id="total-route-time-value"></span>` — общее время на маршруте
  - `<button id="recalculate-button" class="recalculate-btn" title="Пересчитать маршрут"></button>` — кнопка пересчёта

- JavaScript:
  - При отображении экрана выполняется запрос:
    ```js
    fetch(`/api/route-data/${routeName}`).then(res=>res.json())
    ```
  - Инициализация карты и маршрута:
    ```js
    const map = L.map('map-container').setView([officeLat, officeLon], 12);
    L.Routing.control({ waypoints: routeData.route_points }).addTo(map);
    ```
  - Заполнение DOM-элементов:
    ```js
    document.getElementById('distance-value').textContent = routeData.distance;
    document.getElementById('duration-value').textContent = routeData.formatted_duration;
    document.getElementById('total-route-time-value').textContent = routeData.total_route_time_formatted;
    ```
  - Обработчик пересчёта:
    ```js
    document.getElementById('recalculate-button').onclick = () => {
      fetch('/api/update-service-time', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ service_time: newServiceTime })
      }).then(res=>res.json()).then(updateSummary);
    };
    ```

- API-контракт:
  - GET `/api/route-data/{route_name}` → JSON:
    ```json
    {
      "route_name": "string",
      "geocoder_output": [...],
      "route_points": [...],
      "distance_data": {...},
      "number_of_stops": 5,
      "global_service_time_minutes": 10
    }
    ```
  - GET `/api/all-route-data` → JSON: полный dump всех маршрутов
  - POST `/api/update-service-time`:
    - Request JSON: `{ "service_time": 10 }`
    - Response JSON: `{ "status": "ok", "summary": [...], "global_service_time_minutes": 10 }`
  - POST `/api/summary/update`:
    - Request JSON: `{ "route_name": "Маршрут", "report_distance": 120, "report_duration_hours": 2, "report_duration_minutes": 15 }`
    - Response JSON: `{ "status": "ok", "summary": [...] }`

  - **Вкладка «Резюме» (модальное окно):**
    1. HTML:
       - Кнопка открытия: `<button type="button" id="show-summary-btn" class="btn">Резюме</button>`
       - Модал: `<div id="summary-modal" class="modal hidden">` содержит:
         - Заголовок `<h3>Резюме по всем маршрутам</h3>` и кнопку закрытия `<button id="close-modal" class="close-button">×</button>`
         - Тело с таблицей `<table id="summary-table">` и заголовками колонок
         - Кнопка экспорта `<button id="export-summary-btn" class="btn btn-export">Экспорт XLSX</button>`
    2. JavaScript:
       - По клику `#show-summary-btn` показывать `#summary-modal`, делать `fetch('/api/summary')` или `/api/all-route-data`, парсить JSON и заполнять таблицу
       - По клику `#close-modal` скрывать `#summary-modal`
       - По клику `#export-summary-btn` вызывать `fetch('/api/export-summary', { method: 'POST' })` и скачивать файл
    3. Стили:
       - Модал: позиционирование фиксированное, фон затемненный, `.hidden` переключает видимость
       - Таблица: адаптивная, прокрутка по горизонтали
    4. API-контракт:
       - GET `/api/summary` → JSON `{ summary: [...], global_service_time_minutes: int }`
       - POST `/api/export-summary` → StreamingResponse XLSX

---
## 6. Формирование внутренней базы маршрутов

Класс `RouteData` (`frontend/main.py`)
- Хранит:
  - `routes`: полные данные для каждого маршрута
  - `summary`: сводная информация (расстояние, время, разница, общее время)
  - `drivers`: ФИО водителей по маршрутам
  - `global_service_time_minutes`, `report_date_str`
- Методы:
  - `load_from_disk` / `save_to_disk`
  - `add_route`, `update_summary_item`, `_recalculate_summary_fields`
  - `get_route_data_endpoint`, `get_summary`, `export_summary`
  - Эндпоинты FastAPI формируют JSON ответ для фронтенда

---
## 7. Эндпоинты FastAPI для фронтенда

1. GET `/api/health` — проверка статуса
2. GET `/api/routes` — список маршрутов из `original_route_names.json`
3. GET `/api/route-data/{route_name}` — гео-данные, точки, расстояния, офис
4. GET `/api/summary` — сводная информация с полями:
   - расстояние, время, разницы, общее время, кол-во точек, ФИО водителя
5. POST `/api/summary/update` — обновление полей отчёта (расстояние, время) и пересчёт
6. POST `/api/export-summary` — формирование и скачивание Excel сводки
7. POST `/api/update-service-time` — обновление глобального времени на точку и пересчёт
8. GET `/api/all-route-data` — полный dump данных всех маршрутов

---
## 8. Экспорт итоговой сводки

- Генерируется Excel через `pandas.ExcelWriter` + `openpyxl`
- Применяются стили, форматы, условное форматирование
- Имя файла в формате `summary_{дд.мм.гггг}.xlsx`
- Отправляется как `StreamingResponse`

---
## 9. Хранилище и кеш

Папки:
- `data/parsed_addresses/`
- `data/geocoded_results/`
- `data/route_results/`
- `data/original_route_names.json` — актуальный порядок маршрутов
- `data/route_data.json` — внутренний `RouteData`
- `data/summary_csv/` — (опционально) CSV текущей сводки

---
## 10. Полезные утилиты

- `utils.py` — общие функции (создание директорий, sanitization)
- `organize_project.py`, `format_code.py` — скрипты для поддержки (не задействованы напрямую)
- `README.md`, `.gitignore`, `requirements.txt`

---
## 11. Контракты данных
- **Parsed CSV** (`parsed_addresses_{route}.csv`): поля `excel_row` (int), `route_name` (str), `normalized_address` (str)
- **Geocoded CSV** (`geocoded_results_{route}.csv`): поля `excel_row`, `route_name`, `input`, `found`, `type`, `description`, `lat`, `lon`, `error`
- **Route JSON** (`route_results_{route}.json`): структура `{"routes": [...], "points": [...], ...}` (ключи `total_distance`, `total_duration` и т.п.)
- **Summary JSON** (API `/api/summary`): массив объектов с ключами `route_name`, `driver_name`, `distance`, `duration_seconds`, `duration`, `report_distance`, `report_duration_hours`, `report_duration_minutes`, `distance_difference`, `time_difference_formatted`, `time_difference_seconds`, `total_route_time_seconds`, `total_route_time_formatted`, `number_of_stops`

---
## 12. Валидация и тестирование
- Разбить логику на чистые функции и модули для unit‑тестов:
  - `extract_routes`, `is_only_region_and_district`, `geocode_address`, `calculate_matrix_chunk`
- Написать тесты с `pytest`, мокать внешние API (requests, pandas I/O)
- Добавить smoke-тесты для эндпоинтов FastAPI с `TestClient`
- Проверять версии зависимостей и поддерживать `requirements.txt` в актуальном состоянии

---
## 13. Обработка ошибок и логирование
- Централизовать уровни логирования (info/warning/error) через `logging`
- Описать возможные ошибки каждого этапа и способы восстановления (например, повтор запросов при таймаутах)
- Логи записывать в файлы с ротацией или визуализировать в системе сбора метрик

---
## 14. Конфигурация и окружение
- Документировать все переменные в `config.py`: пути, API_KEYS, OFFLINE_MODE, ROUTING_SETTINGS и т.п.
- Использовать `.env` и `python-dotenv` для локальной настройки ключей
- Отдельно описать режим OFFLINE_MODE для отладки без API-запросов

---
## 15. CI/CD и контроль качества
- Настроить GitHub Actions/GitLab CI:
  - Установка окружения и зависимостей
  - Запуск `pytest` и проверка покрытия
  - Линтинг `flake8`/`black --check`
  - Проверка типизации (mypy)
- Проверять сборку Docker-контейнеров (если используется)

---
## 16. Чеклист перед слиянием и релизом
- [ ] Пройдены все unit и интеграционные тесты
- [ ] Эндпоинты отвечают ожидаемыми статусами и данными
- [ ] Новые сценарии задокументированы в PIPELINE.md
- [ ] Обновлены версии зависимостей в `requirements.txt`
- [ ] Целостность файловой структуры и контрактов данных сохранена
- [ ] Выполнена проверка в OFFLINE_MODE и в реальном режиме API

---
## 17. Интерфейс пользователя (Frontend)
- **Шаг 1: Загрузка файла**: ...  
- **Шаг 2: Проверка адресов**:
  1. HTML:
     - `<div id="step-2-content" class="step-content hidden">`
     - `<form id="corrections-form">` с `<tbody id="exceptions-table">`
     - Кнопки «Назад»/«Продолжить»
  2. JavaScript: сбор исправлений, POST `/api/submit-corrections`, показ `#correction-success`
  3. Стили: управление видимостью через класс `hidden`

- **Шаг 3: Результаты**:
  1. HTML:
     - `<div id="step-3-content" class="step-content hidden">` — основной контейнер
     - `<div id="map-container" class="map-container">` — карта Leaflet
     - `<div id="route-info">` — панель с карточками:
         - `<strong id="route-name-header"></strong>` — имя маршрута
         - `<span id="distance-value"></span>` — общее расстояние
         - `<span id="duration-value"></span>` — время в пути
         - `<span id="total-route-time-value"></span>` — общее время маршрута
     - `<button id="recalculate-button" class="recalculate-btn"></button>` — кнопка пересчета
  2. JavaScript:
     - При загрузке экрана запрашивать `/api/route-data/{route}` для конкретного маршрута или `/api/all-route-data`
     - Инициализировать карту: `L.map(...).setView(...)`, `L.Routing.control({ waypoints: route_points })`
     - Заполнять элементы DOM значениями из JSON (distance, duration и т.д.)
     - Вешать обработчик на `#recalculate-button`, который вызывает `POST /api/update-service-time` или перезапрашивает `/api/route-data`
  3. Стили:
     - Карта: ширина 100%, высота минимум 400px
     - Карточки `.result-card`: адаптивный layout, отступы и тени
  4. API-контракт:
     - GET `/api/route-data/{route_name}` → JSON:
       `{ "route_name": str, "geocoder_output": [...], "route_points": [...], "distance_data": {...}, "number_of_stops": int, "global_service_time_minutes": int }`
     - GET `/api/all-route-data` → полный dump для всех маршрутов
     - POST `/api/update-service-time` → Request `{ service_time: int }`, Response `{ status: "ok", summary: [...], global_service_time_minutes: int }`
     - POST `/api/summary/update` → Request `{ route_name, report_distance, report_duration_hours, report_duration_minutes }`, Response `{ status: "ok", summary: [...] }`

---
*После изучения этого файла новый разработчик получит полное представление о структуре и порядке выполнения всех этапов обработки данных.*