console.log("[step3_results.js] File loaded.");

// Убираем DOMContentLoaded
// document.addEventListener('DOMContentLoaded', () => {

// --- Глобальные переменные для элементов DOM (будут инициализированы в initStep3UI) ---
let verticalRouteSelector = null;
let routeListContainer = null;
let distanceValueEl = null;
let durationValueEl = null;
let totalTimeValueEl = null;
let geocoderTableBody = null;
let lottieIconContainer = null;
let routeNameHeaderEl = null;
let recalculateBtn = null;
let resultsLayout = null;
let tableScrollWrapper = null;

// --- Глобальные переменные состояния ---
let currentSelectedRouteId = null;
let lottiePlayer = null;
let recalculateLottiePlayer = null;
let previousDistance = 0;
let previousDurationMinutes = 0;
let previousTotalTimeMinutes = 0;
let currentRoutesData = {}; // Хранилище для данных маршрутов
let modifiedAddresses = {}; // Хранилище для измененных адресов
let rowContextMenu = null; // Переменная для контекстного меню

// --- SVG иконки ---
const pencilSvgIcon = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.2929 2.29289C11.6834 1.90237 12.3166 1.90237 12.7071 2.29289L13.7071 3.29289C14.0976 3.68342 14.0976 4.31658 13.7071 4.70711L13 5.41421L10.5858 3L11.2929 2.29289Z" fill="#6c757d"/><path d="M9.87868 3.70711L3 10.5858V13H5.41421L12.2929 6.12132L9.87868 3.70711Z" fill="#6c757d"/></svg>`;
const eyeSvgIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 4.5C7.3056 4.5 3.2088 7.1575 1.5 12c1.7088 4.8425 5.8056 7.5 10.5 7.5s8.7912-2.6575 10.5-7.5C20.7912 7.1575 16.6944 4.5 12 4.5zm0 12.5c-2.7614 0-5-2.2386-5-5s2.2386-5 5-5 5 2.2386 5 5-2.2386 5-5 5zM12 9.5c-1.3807 0-2.5 1.1193-2.5 2.5s1.1193 2.5 2.5 2.5 2.5-1.1193 2.5-2.5S13.3807 9.5 12 9.5z"/></svg>`;

// --- Главная функция инициализации UI для Шага 3 ---
window.initStep3UI = function(routesData) {
    console.log("[step3_results.js] initStep3UI called with data:", routesData);
    currentRoutesData = routesData || {}; // Сохраняем данные

    // --- ДОБАВЛЕНО: Проверка входных данных ---
    if (!routesData || typeof routesData !== 'object' || Object.keys(routesData).length === 0) {
        console.warn("[step3_results.js] initStep3UI called with invalid or empty routesData. Displaying empty state.");
        // Попытаемся найти элементы, чтобы показать пустое состояние
        geocoderTableBody = document.getElementById('geocoder-table');
        routeNameHeaderEl = document.getElementById('route-name-header');
        distanceValueEl = document.getElementById('distance-value');
        durationValueEl = document.getElementById('duration-value');
        totalTimeValueEl = document.getElementById('total-route-time-value');
        if (geocoderTableBody) geocoderTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Нет данных для отображения.</td></tr>';
        if (routeNameHeaderEl) routeNameHeaderEl.textContent = 'Нет данных';
        if (distanceValueEl) distanceValueEl.textContent = '-';
        if (durationValueEl) durationValueEl.textContent = '-';
        if (totalTimeValueEl) totalTimeValueEl.textContent = '-';
        // Очищаем список маршрутов тоже
        routeListContainer = document.getElementById('route-list');
        if (routeListContainer) routeListContainer.innerHTML = '<li class="route-list-item"><div class="route-list-item-content"><span class="route-name">Нет доступных маршрутов</span></div></li>';
        return; // Прерываем выполнение, если данных нет
    }

    // --- Инициализация элементов DOM ---
    verticalRouteSelector = document.getElementById('vertical-route-selector');
    routeListContainer = document.getElementById('route-list');
    distanceValueEl = document.getElementById('distance-value');
    durationValueEl = document.getElementById('duration-value');
    totalTimeValueEl = document.getElementById('total-route-time-value');
    geocoderTableBody = document.getElementById('geocoder-table');
    lottieIconContainer = document.getElementById('lottie-icon-container');
    routeNameHeaderEl = document.getElementById('route-name-header');
    recalculateBtn = document.getElementById('recalculate-button');
    resultsLayout = recalculateBtn?.closest('.results-layout'); // Получаем родительский layout
    tableScrollWrapper = document.getElementById('table-scroll-wrapper');

    // --- Создание контекстного меню (если его нет) ---
    if (!document.getElementById('row-context-menu')) {
        rowContextMenu = document.createElement('div');
        rowContextMenu.id = 'row-context-menu';
        rowContextMenu.className = 'context-menu';
        rowContextMenu.innerHTML = `
            <ul>
                <li data-action="delete-row">Удалить строку</li>
                <!-- Можно добавить другие пункты -->
            </ul>
        `;
        document.body.appendChild(rowContextMenu); // Добавляем в конец body
    } else {
        rowContextMenu = document.getElementById('row-context-menu');
    }

    // Проверка наличия основных элементов
    if (!verticalRouteSelector || !routeListContainer || !geocoderTableBody || !recalculateBtn || !resultsLayout) {
        console.error("[step3_results.js] Critical UI elements for Step 3 not found!");
        // --- ДОБАВЛЕНО: Выводим, чего не хватает ---
        if (!verticalRouteSelector) console.error("Element with ID 'vertical-route-selector' not found.");
        if (!routeListContainer) console.error("Element with ID 'route-list' not found.");
        if (!geocoderTableBody) console.error("Element with ID 'geocoder-table' not found.");
        if (!recalculateBtn) console.error("Element with ID 'recalculate-button' not found.");
        if (!resultsLayout) console.error("Parent element '.results-layout' for recalculate button not found.");
        return; // Прерываем инициализацию, если чего-то не хватает
    }

    // --- Вызов функций инициализации ---
    initializeRouteList();
    initializeLottie();
    initializeRecalculateLottie();
    setupEventListeners(); // Меню будет управляться из setupEventListeners

    // Сбрасываем предыдущие значения для анимации
    previousDistance = 0;
    previousDurationMinutes = 0;
    previousTotalTimeMinutes = 0;

    // Выбираем первый маршрут по умолчанию, если он есть
    const routeIds = Object.keys(currentRoutesData);
    if (routeIds.length > 0) {
        updateDisplay(routeIds[0]);
         // --- ДОБАВЛЕНО: Вызов showMap для первого маршрута --- 
        const firstRouteId = routeIds[0];
        const firstRouteData = currentRoutesData[firstRouteId];
        if (firstRouteData && firstRouteData.route_points && typeof window.showMap === 'function') {
             console.log(`[step3_results.js] Calling window.showMap for initial routeId: ${firstRouteId}`);
             // --- ИЗМЕНЕНО: Добавлен try...catch --- 
             try {
             window.showMap(firstRouteData.route_points);
             } catch (mapError) {
                 console.error(`[step3_results.js] Error during initial window.showMap call for routeId ${firstRouteId}:`, mapError);
                 // Скрываем только контейнер карты
                 const mapContainer = document.getElementById('map-container');
                 if (mapContainer) mapContainer.classList.add('hidden');
                 // Очищаем маркеры, если функция есть
                 if (typeof window.clearMapMarkers === 'function') {
                     window.clearMapMarkers();
                 }
             }
             // --- КОНЕЦ ИЗМЕНЕНИЯ --- 
        } else {
             console.warn(`[step3_results.js] Could not call showMap for initial routeId: ${firstRouteId}. Missing data, route_points, or showMap function.`);
             // Опционально: очистить карту
             if (typeof window.clearMapMarkers === 'function') {
                 window.clearMapMarkers();
             }
        }
         // --- Конец добавленного кода --- 
    } else {
        // Обработка случая, когда нет маршрутов
        geocoderTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Нет доступных маршрутов для отображения.</td></tr>';
        if (routeNameHeaderEl) routeNameHeaderEl.textContent = '';
        if (distanceValueEl) distanceValueEl.textContent = '-';
        if (durationValueEl) durationValueEl.textContent = '-';
        if (totalTimeValueEl) totalTimeValueEl.textContent = '-';
    }
}

console.log("[step3_results.js] initStep3UI assigned to window.");

// --- Вспомогательная функция для получения отображения точности ---
function getAccuracyDisplay(accuracyCode) {
    if (!accuracyCode) return '<span class="accuracy-tag tag-unknown">❓ Не определено</span>';

    const codeLower = String(accuracyCode).toLowerCase(); // Приводим к строке на всякий случай

    // Используем Set для быстрой проверки принадлежности
    const highAccuracyTypes = new Set([
        'building', 'gate', 'station_entrance', 'attraction', 'coordinates',
        'coordinates_additional', 'kilometer_road_sign', 'parking',
        'station_platform', 'adm_div.living_area', 'adm_div.place',
        'exact', 'office'
    ]);
    const mediumAccuracyTypes = new Set([
        'street', 'crossroad', 'road', 'adm_div.settlement', 'locality'
    ]);
    // Все остальное, включая 'adm_div.*' (кроме перечисленных выше) и неизвестные/ошибки, считаем низкой точностью.

    if (highAccuracyTypes.has(codeLower)) {
         // Просто возвращаем display HTML, level тут не используется напрямую для строки (класс не нужен)
         // Но можно было бы вернуть { level: 'high', ... } для единообразия, если понадобится
         // Найдем более подходящий текст из старой версии для этих типов
         if (codeLower === 'building') return '<span class="accuracy-tag tag-house">🏠 Здание</span>';
         if (codeLower === 'parking') return '<span class="accuracy-tag tag-exact">🅿️ Парковка</span>';
         if (codeLower === 'coordinates') return '<span class="accuracy-tag tag-exact">📍 Координаты</span>';
         if (codeLower === 'station_platform') return '<span class="accuracy-tag tag-near">🚉 Платформа</span>';
         if (codeLower === 'office') return '<span class="accuracy-tag tag-house">🏢 Офис</span>';
         // Для остальных пока оставим "Точный"
         return '<span class="accuracy-tag tag-exact">🎯 Точный</span>';
    } else if (mediumAccuracyTypes.has(codeLower)) {
         if (codeLower === 'street') return '<span class="accuracy-tag tag-street">🛣️ Улица</span>';
         if (codeLower === 'road') return '<span class="accuracy-tag tag-street">🛣️ Дорога</span>';
         if (codeLower === 'crossroad') return '<span class="accuracy-tag tag-near">🚦 Перекресток</span>';
         if (codeLower === 'adm_div.settlement') return '<span class="accuracy-tag tag-locality">🏘️ Поселение</span>';
         if (codeLower === 'locality') return '<span class="accuracy-tag tag-locality">🏘️ Н.Пункт</span>';
         // По умолчанию для средних
         return '<span class="accuracy-tag tag-near">📍 Средняя</span>'; // Класс tag-near используется для оранжевого цвета
    } else {
         // Низкая точность (все остальные известные adm_div, other, unknown, error, not_found)
         if (codeLower === 'adm_div.city') return '<span class="accuracy-tag tag-locality">🏙️ Город</span>';
         if (codeLower === 'adm_div.district') return '<span class="accuracy-tag tag-locality">🗺️ Район</span>';
         if (codeLower === 'adm_div.region') return '<span class="accuracy-tag tag-locality">🌍 Регион</span>';
         // По умолчанию для низких
         return '<span class="accuracy-tag tag-other">❓ Низкая</span>'; // Класс tag-other используется для красного цвета
    }
}

// --- Вспомогательные функции для времени ---
function parseTimeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    let hours = 0;
    let minutes = 0;
    const hourMatch = timeStr.match(/(\d+)\s*ч/);
    const minMatch = timeStr.match(/(\d+)\s*мин/);
    if (hourMatch) hours = parseInt(hourMatch[1], 10);
    if (minMatch) minutes = parseInt(minMatch[1], 10);
    return hours * 60 + minutes;
}

function formatMinutesToTime(totalMinutes) {
    if (isNaN(totalMinutes) || totalMinutes < 0) return '-';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60); // Округляем минуты
    let result = '';
    if (hours > 0) {
      result += hours + ' ч';
    }
    if (minutes > 0) {
      if (result) result += ' '; // Добавляем пробел, если есть часы
      result += minutes + ' мин';
    }
    if (!result) { // Если получилось 0ч 0мин
       result = '0 мин';
    }
    return result;
}

// --- Функция для анимации чисел ---
function animateCounter(element, start, end, duration, unit = '', formatter = null) {
    let startTime = null;
    
    // Убираем нечисловые символы и парсим в число (или используем как есть, если не строка)
    const startValue = typeof start === 'number' ? start : parseFloat(String(start).replace(/[^\d.-]/g, '')) || 0;
    const endValue = typeof end === 'number' ? end : parseFloat(String(end).replace(/[^\d.-]/g, '')) || 0;
    const range = endValue - startValue;

    // Если значения совпадают, просто устанавливаем и выходим
    if (range === 0) {
        // Используем formatter, если он есть, иначе стандартное форматирование
        element.textContent = formatter ? formatter(endValue) : Math.round(endValue) + unit;
        return;
    }

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const currentValue = startValue + range * progress;
      
      // Используем formatter, если он есть, иначе стандартное форматирование
      element.textContent = formatter ? formatter(currentValue) : Math.round(currentValue) + unit;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
         // Убедимся, что финальное значение точное
         element.textContent = formatter ? formatter(endValue) : Math.round(endValue) + unit;
      }
    };

    requestAnimationFrame(step);
}

// --- Функция обновления данных на странице ---
function updateDisplay(selectedRouteId) {
    // Используем сохраненные данные currentRoutesData
    const data = currentRoutesData[selectedRouteId];
    console.log(`[step3_results.js] updateDisplay called for routeId: ${selectedRouteId}. Data found:`, data);

    if (!data) {
      console.error("[step3_results.js] No data found for route:", selectedRouteId);
      // Очистка полей
      if (distanceValueEl) distanceValueEl.textContent = '-';
      if (durationValueEl) durationValueEl.textContent = '-';
      if (totalTimeValueEl) totalTimeValueEl.textContent = '-';
      if (geocoderTableBody) geocoderTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Ошибка: данные для маршрута не найдены.</td></tr>';
      if (routeNameHeaderEl) routeNameHeaderEl.textContent = '';
      // Убираем активный класс со всех элементов списка
      if (routeListContainer) {
          routeListContainer.querySelectorAll('.route-list-item.active').forEach(el => el.classList.remove('active'));
      }
      currentSelectedRouteId = null;
      return;
    }

    // Обновляем заголовок с именем маршрута
    if (routeNameHeaderEl) {
        routeNameHeaderEl.textContent = data.route_name;
    }

    // Обновляем инфо-карточки с анимацией
    if (distanceValueEl && durationValueEl && totalTimeValueEl) {
        const newDistance = (data.distance_data && typeof data.distance_data.total_distance === 'number')
                                ? data.distance_data.total_distance
                                : 0;
        const newDistanceFormatted = data.distance_data?.formatted_distance || 'Н/Д';
        animateCounter(distanceValueEl, previousDistance, newDistance, 500, ' км', (value) => {
            return (value === newDistance) ? newDistanceFormatted : `${Math.round(value)} км`;
        });
        previousDistance = newDistance;

        const newDuration = data.distance_data?.formatted_duration || 'Н/Д';
        const newDurationMinutes = parseTimeToMinutes(newDuration);
        animateCounter(durationValueEl, previousDurationMinutes, newDurationMinutes, 500, '', formatMinutesToTime);
        previousDurationMinutes = newDurationMinutes;

        const newTotalTime = data.total_route_time_formatted || 'Н/Д';
        const newTotalTimeMinutes = parseTimeToMinutes(newTotalTime);
        animateCounter(totalTimeValueEl, previousTotalTimeMinutes, newTotalTimeMinutes, 500, '', formatMinutesToTime);
        previousTotalTimeMinutes = newTotalTimeMinutes;
    }

    // Обновляем таблицу
    if (geocoderTableBody) {
        geocoderTableBody.innerHTML = ''; // Очищаем таблицу
        // --- ДОБАВЛЕНО: Лог перед обработкой точек ---
        console.log("[step3_results.js] Attempting to render table. geocoder_output:", data.geocoder_output);
        const geocodedPoints = data.geocoder_output || [];

        if (geocodedPoints.length > 0) {
          geocodedPoints.forEach((point, index) => {
            const row = document.createElement('tr');
            // Примечание: строка изначально будет невидима из-за CSS

            // Форматируем координаты
            let coordsText = 'N/A';
            if (point.lat != null && point.lon != null) {
                const lat = parseFloat(point.lat);
                const lon = parseFloat(point.lon);
                if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
                     coordsText = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
                } else {
                    console.warn(`[step3_results.js] Invalid coordinate values for point ${index + 1}: lat=${point.lat}, lon=${point.lon}`);
                }
            } else {
                console.warn(`[step3_results.js] Missing lat/lon for point ${index + 1}:`, point);
            }

            row.innerHTML = `
              <td style="position:relative;">
                <span class="visibility-icon">${eyeSvgIcon}</span>
                <span class="row-index">${index + 1}</span>
              </td>
              <td><span class="address-text">${point.input || 'N/A'}</span><span class="edit-icon">${pencilSvgIcon}</span></td>
              <td>${(point.excel_row === 'СТАРТ' || point.excel_row === 'ФИНИШ') ? '' : (point.found || 'Н/Д')}</td>
              <td>${coordsText}</td>
              <td>${point.description || '❓ Не определено'}</td>
            `;

            // --- ДОБАВЛЕНО: Добавляем иконку видимости для скрытия точки ---
            const visibilityBtn = row.querySelector('.visibility-icon');
            if (visibilityBtn) {
                visibilityBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const clickedRow = event.currentTarget.closest('tr');
                    if (clickedRow) {
                        const rowIndex = Array.from(clickedRow.parentNode.children).indexOf(clickedRow);
                        toggleRowVisibility(rowIndex);
                    }
                });
            }

            // --- ДОБАВЛЕНО: Помечаем скрытые точки, если они есть ---
            if (point.hidden) {
                row.classList.add('row-hidden');
            }

            // --- ИСПРАВЛЕНО: Добавляем класс строке в зависимости от point.type, используя новую логику классификации ---
            const typeCategoryLower = point.type ? String(point.type).toLowerCase() : 'unknown'; // Приводим к строке

            const mediumAccuracyTypesForRow = new Set([
                'street', 'crossroad', 'road', 'adm_div.settlement', 'locality'
            ]);
             const highAccuracyTypesForRow = new Set([ // Типы, которые НЕ нужно подсвечивать
                 'building', 'gate', 'station_entrance', 'attraction', 'coordinates',
                 'coordinates_additional', 'kilometer_road_sign', 'parking',
                 'station_platform', 'adm_div.living_area', 'adm_div.place',
                 'exact', 'office'
             ]);

            if (mediumAccuracyTypesForRow.has(typeCategoryLower)) {
                row.classList.add('row-accuracy-medium');
                // console.log(`[Debug] Point Type: ${typeCategoryLower}, Class: row-accuracy-medium`); // Лог убран
            } else if (!highAccuracyTypesForRow.has(typeCategoryLower)) {
                // Если тип НЕ высокий и НЕ средний, значит он низкий (включая unknown/error)
                row.classList.add('row-accuracy-low');
                // console.log(`[Debug] Point Type: ${typeCategoryLower}, Class: row-accuracy-low`); // Лог убран
            } else {
                // console.log(`[Debug] Point Type: ${typeCategoryLower}, Class: (none - high accuracy)`); // Лог убран
            }
            // Для типов из highAccuracyTypesForRow класс не добавляем
            // --- КОНЕЦ ИСПРАВЛЕНИЯ ---

            // Добавляем кнопку добавления новой строки
            if (point.excel_row !== 'СТАРТ') { // Не добавляем кнопку только для начальной точки СТАРТ
                const addRowBtn = document.createElement('button');
                addRowBtn.className = 'add-row-btn';
                addRowBtn.title = 'Добавить точку';
                addRowBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 3C8.55228 3 9 3.44772 9 4V7H12C12.5523 7 13 7.44772 13 8C13 8.55228 12.5523 9 12 9H9V12C9 12.5523 8.55228 13 8 13C7.44772 13 7 12.5523 7 12V9H4C3.44772 9 3 8.55228 3 8C3 7.44772 3.44772 7 4 7H7V4C7 3.44772 7.44772 3 8 3Z" fill="currentColor"/>
                </svg>`;
                
                // Добавляем обработчик события для кнопки
                addRowBtn.addEventListener('click', (event) => {
                    event.stopPropagation(); // Предотвращаем всплытие события
                    // Определяем индекс строки в момент клика
                    const clickedRow = event.currentTarget.closest('tr');
                    if (clickedRow) {
                        const rowIndex = Array.from(clickedRow.parentNode.children).indexOf(clickedRow);
                        addNewAddressRow(rowIndex); // Добавляем строку перед текущей
                    }
                });
                
                row.appendChild(addRowBtn);
            }

            geocoderTableBody.appendChild(row);

            // Анимация появления строк
            const delay = index * 60;
            setTimeout(() => {
                row.classList.add('row-visible');
            }, delay);
          });

          // --- ВОЗВРАЩАЕМ ЛОГИКУ АНИМАЦИИ ВЫСОТЫ ИЗ РЕФЕРЕНСА (УДАЛЕНО) ---
          /*
          if (tableScrollWrapper) {
              // Вызываем обновление высоты после отрисовки всех строк
              // с небольшой задержкой, чтобы DOM успел обновиться
              setTimeout(() => {
                  updateTableHeight();
              }, 100);
          } else {
              console.error('[step3_results.js] #table-scroll-wrapper not found for height animation');
          }
          */
          // --- КОНЕЦ ЛОГИКИ АНИМАЦИИ ВЫСОТЫ ---

        } else {
          // --- ДОБАВЛЕНО: Лог, если точки не найдены ---
          console.log("[step3_results.js] No geocoder_output found for this route. Displaying empty message in table.");
          geocoderTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Нет данных для этого маршрута.</td></tr>';
          
          // Обновляем высоту с задержкой, чтобы DOM успел обновиться (УДАЛЕНО)
          /* 
          setTimeout(() => {
              updateTableHeight();
          }, 100);
          */
        }
    } else {
        // --- ДОБАВЛЕНО: Лог, если тело таблицы не найдено ---
        console.error("[step3_results.js] geocoderTableBody element not found. Cannot update table.");
    }

    // Обновляем активный элемент в списке
    if (routeListContainer) {
        if (currentSelectedRouteId) {
          const previousActiveElement = routeListContainer.querySelector(`[data-route-id="${currentSelectedRouteId}"]`);
          if (previousActiveElement) {
            previousActiveElement.classList.remove('active');
          }
        }
        const newActiveElement = routeListContainer.querySelector(`[data-route-id="${selectedRouteId}"]`);
        if (newActiveElement) {
          newActiveElement.classList.add('active');
        }
    }
    currentSelectedRouteId = selectedRouteId;

    // --- ДОБАВЛЕНО: Вызываем отображение карты --- 
    // --- ИЗМЕНЕНО: Удаляем старый блок вызова drawPolylineAndMarkersManually и добавляем логику для routingControl ---
    try {
        if (typeof routingControl !== 'undefined' && routingControl !== null) {
            // Проверяем, что routingControl существует
            if (data.route_points && data.route_points.length > 0) {
                console.log("[step3_results.js] Calling routingControl.setWaypoints with new points:", data.route_points);
                try {
                    // Преобразуем точки в формат Leaflet LatLng
                    const waypointsLatLng = data.route_points.map(p => {
                        if (p && typeof p.lat === 'number' && typeof p.lon === 'number') {
                           return L.latLng(p.lat, p.lon);
                        } else {
                            console.warn("[step3_results.js] Invalid point format in route_points for setWaypoints:", p);
                            return null; // Пропускаем невалидные точки
                        }
                    }).filter(p => p !== null); // Убираем null значения
                    
                    if (waypointsLatLng.length > 1) { // Нужно хотя бы 2 точки для маршрута
                        routingControl.setWaypoints(waypointsLatLng);
                        // Показываем контейнер карты
                        const mapContainer = document.getElementById('map-container');
                        if (mapContainer) mapContainer.classList.remove('hidden');
                    } else {
                         console.warn("[step3_results.js] Not enough valid points to set waypoints for Routing Machine. Hiding map.");
                         const mapContainer = document.getElementById('map-container');
                         if (mapContainer) mapContainer.classList.add('hidden');
                    }
                } catch (routingError) {
                    console.error("[step3_results.js] Error during routingControl.setWaypoints:", routingError);
                    const mapContainer = document.getElementById('map-container');
                    if (mapContainer) mapContainer.classList.add('hidden');
                }
            } else {
                 console.warn("[step3_results.js] No route points found in data to update Routing Machine. Hiding map.");
                 const mapContainer = document.getElementById('map-container');
                 if (mapContainer) mapContainer.classList.add('hidden');
            }
        } else {
            console.error("[step3_results.js] routingControl is not available. Cannot update route on map via Routing Machine.");
            const mapContainer = document.getElementById('map-container');
            if (mapContainer) mapContainer.classList.add('hidden');
        }
    } catch (mapError) { // Общий catch на случай других ошибок
         console.error(`[step3_results.js] General error during map update in updateDisplay for routeId ${selectedRouteId}:`, mapError);
         const mapContainer = document.getElementById('map-container');
         if (mapContainer) mapContainer.classList.add('hidden');
    }
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---
    
    /* --- СТАРЫЙ БЛОК (УДАЛЕН) ---
    if (typeof showMap === 'function' && data.route_points && data.route_points.length > 0) {
      console.log("[step3_results.js] Calling showMap with route_points:", data.route_points);
      try {
          if (typeof drawPolylineAndMarkersManually === 'function') {
              console.log("[step3_results.js] Calling drawPolylineAndMarkersManually with route_points:", data.route_points);
              drawPolylineAndMarkersManually(data.route_points); 
    } else {
              console.error("[step3_results.js] Function drawPolylineAndMarkersManually is not defined!");
      const mapContainer = document.getElementById('map-container');
      if (mapContainer) mapContainer.classList.add('hidden');
          }
          
          const mapContainer = document.getElementById('map-container');
          if (mapContainer) mapContainer.classList.remove('hidden');
      } catch (mapError) {
           console.error(`[step3_results.js] Error during map drawing call in updateDisplay for routeId ${selectedRouteId}:`, mapError);
           const mapContainer = document.getElementById('map-container');
           if (mapContainer) mapContainer.classList.add('hidden');
      }
    } else {
      const mapContainer = document.getElementById('map-container');
      if (mapContainer) mapContainer.classList.add('hidden');
      console.warn("[step3_results.js] No route points to display or map drawing function unavailable. Hiding map container.");
    }
    */
}

// --- Функция для инициализации списка маршрутов ---
function initializeRouteList() {
    if (!routeListContainer) return;

    routeListContainer.innerHTML = ''; // Очищаем
    const routeIds = Object.keys(currentRoutesData);

    if (routeIds.length === 0) {
        routeListContainer.innerHTML = '<li class="route-list-item"><div class="route-list-item-content"><span class="route-name">Нет доступных маршрутов</span></div></li>';
        return;
    }

    // --- ИСПРАВЛЕНО: Используем согласованную классификацию для подсчета значков ---
    const mediumAccuracyTypesForBadge = new Set([
        'street', 'crossroad', 'road', 'adm_div.settlement', 'locality'
    ]);
    const highAccuracyTypesForBadge = new Set([ // Типы, которые НЕ учитываем в значках
        'building', 'gate', 'station_entrance', 'attraction', 'coordinates',
        'coordinates_additional', 'kilometer_road_sign', 'parking',
        'station_platform', 'adm_div.living_area', 'adm_div.place',
        'exact', 'office'
    ]);

    routeIds.forEach(routeId => {
        const route = currentRoutesData[routeId];
        if (!route) return; // Пропускаем, если нет данных для ID

        const listItem = document.createElement('li');
        listItem.classList.add('route-list-item');
        listItem.setAttribute('data-route-id', routeId);

        // Подсчет точности для значков
        let mediumCount = 0;
        let lowCount = 0;
        const geocodedPoints = route.geocoder_output || [];
        if (geocodedPoints.length > 0) {
            geocodedPoints.forEach(point => {
                // Пропускаем строки старта и финиша (если они есть)
                if (point.excel_row === 'СТАРТ' || point.excel_row === 'ФИНИШ') {
                    return; // Переходим к следующей итерации
                }
                const accTypeLower = point.type ? String(point.type).toLowerCase() : 'unknown'; // Приводим к строке

                if (mediumAccuracyTypesForBadge.has(accTypeLower)) {
                    mediumCount++;
                } else if (!highAccuracyTypesForBadge.has(accTypeLower)) {
                    // Если тип НЕ высокий и НЕ средний, значит он низкий (включая unknown/error)
                    lowCount++;
                }
                // Типы из highAccuracyTypesForBadge не учитываются ни в mediumCount, ни в lowCount
            });
        }
        // --- КОНЕЦ ИСПРАВЛЕНИЯ ЛОГИКИ ПОДСЧЕТА ---

        // Формирование HTML для значков
        let badgesHtml = '';
        if (mediumCount > 0) {
            badgesHtml += `<span class="accuracy-count-badge badge-medium">${mediumCount}</span>`;
        }
        if (lowCount > 0) {
            badgesHtml += `<span class="accuracy-count-badge badge-low">${lowCount}</span>`;
        }

        // Формирование полного HTML элемента списка
        listItem.innerHTML = `
          <div class="route-list-item-content">
            <span class="route-name">${route.name || routeId}</span>
            <span class="route-badges">${badgesHtml}</span>
          </div>
        `;
        routeListContainer.appendChild(listItem);
    });
}

// --- Инициализация Lottie анимации ---
function initializeLottie() {
    if (!lottieIconContainer) return;

    // Удаляем предыдущий плеер, если он есть
    if (lottiePlayer) {
        try {
            lottiePlayer.destroy();
        } catch (e) { console.warn("Could not destroy previous Lottie player:", e); }
        lottiePlayer = null;
        lottieIconContainer.innerHTML = '';
    }

    try {
        // Используем lottie-web (bodymovin)
        lottiePlayer = bodymovin.loadAnimation({
            container: lottieIconContainer,
            renderer: 'svg',
            loop: false, // НЕ зацикливать
            autoplay: false, // НЕ запускать автоматически
            // !!! ВАЖНО: Проверить и обновить путь к файлу анимации !!!
            path: '/static/animations/Animation - 1745303963639.json'
        });

        console.log('[step3_results.js] Lottie player created.');

        // Обработчики наведения добавляются в setupEventListeners
    } catch (error) {
         console.error('[step3_results.js] Error loading Lottie animation:', error);
    }
}

// --- Инициализация Lottie для кнопки пересчета ---
function initializeRecalculateLottie() {
    const container = document.getElementById('recalculate-lottie-container');
    if (!container) {
        console.error('[step3_results.js] recalculate-lottie-container not found.');
        return;
    }

     // Удаляем предыдущий плеер, если он есть
     if (recalculateLottiePlayer) {
         try {
            recalculateLottiePlayer.destroy();
         } catch (e) { console.warn("Could not destroy previous recalculate Lottie player:", e); }
         recalculateLottiePlayer = null;
         container.innerHTML = '';
     }

    try {
         recalculateLottiePlayer = bodymovin.loadAnimation({
            container: container,
            renderer: 'svg',
            loop: false, // Не зацикливать
            autoplay: false, // Не запускать автоматически
            // !!! ВАЖНО: Проверить и обновить путь к файлу анимации !!!
            path: '/static/animations/Animation - 1745329291702.json'
        });
        console.log('[step3_results.js] Recalculate Lottie player created.');
         // Обработчики наведения/клика добавляются в setupEventListeners
    } catch (error) {
         console.error('[step3_results.js] Error loading recalculate Lottie animation:', error);
    }
}

// --- Настройка обработчиков событий ---
function setupEventListeners() {
    console.log("[step3_results.js] Setting up event listeners...");

    // --- Обработчик клика на список маршрутов (делегирование) ---
    if (routeListContainer) {
        // Удаляем старый слушатель, если он был
        routeListContainer.replaceWith(routeListContainer.cloneNode(true));
        routeListContainer = document.getElementById('route-list'); // Получаем ссылку заново

        if (routeListContainer) { // Повторная проверка после клонирования
             routeListContainer.addEventListener('click', (event) => {
                const targetItem = event.target.closest('.route-list-item');
                if (targetItem && targetItem.dataset.routeId) {
                    const selectedRouteId = targetItem.dataset.routeId;
                    if (selectedRouteId !== currentSelectedRouteId) {
                        updateDisplay(selectedRouteId);
                         // --- ДОБАВЛЕНО: Вызов showMap при клике --- 
                        const routeData = currentRoutesData[selectedRouteId];
                        if (routeData && routeData.route_points && typeof window.showMap === 'function') {
                            console.log(`[step3_results.js] Calling window.showMap for clicked routeId: ${selectedRouteId}`);
                            // --- ИЗМЕНЕНО: Добавлен try...catch --- 
                            try {
                            window.showMap(routeData.route_points);
                                // Показываем контейнер карты, если он был скрыт
                                const mapContainer = document.getElementById('map-container');
                                if (mapContainer) mapContainer.classList.remove('hidden');
                            } catch (mapError) {
                                console.error(`[step3_results.js] Error during window.showMap call from click handler for routeId ${selectedRouteId}:`, mapError);
                                // Скрываем только контейнер карты
                                const mapContainer = document.getElementById('map-container');
                                if (mapContainer) mapContainer.classList.add('hidden');
                                // Очищаем маркеры, если функция есть
                                if (typeof window.clearMapMarkers === 'function') { 
                                    window.clearMapMarkers();
                                }
                            }
                            // --- КОНЕЦ ИЗМЕНЕНИЯ --- 
                        } else {
                            console.warn(`[step3_results.js] Could not call showMap for clicked routeId: ${selectedRouteId}. Missing data, route_points, or showMap function.`);
                            // Опционально: очистить карту, если showMap недоступна или нет данных
                            // --- ИЗМЕНЕНО: Скрываем карту при ошибке/отсутствии данных --- 
                            const mapContainer = document.getElementById('map-container');
                            if (mapContainer) mapContainer.classList.add('hidden');
                            // --- КОНЕЦ ИЗМЕНЕНИЯ --- 
                            if (typeof window.clearMapMarkers === 'function') { // Предполагая, что есть функция очистки
                                window.clearMapMarkers();
                            }
                        }
                         // --- Конец добавленного кода --- 
                    }
                }
            });
            console.log("[step3_results.js] Route list click listener added.");
        } else {
             console.error("[step3_results.js] routeListContainer became null after cloning!");
        }
    } else {
         console.error("[step3_results.js] routeListContainer is null, cannot add click listener.");
    }


    // --- Обработчики наведения на селектор для Lottie ---
    if (verticalRouteSelector && lottiePlayer) {
        verticalRouteSelector.onmouseenter = () => {
            if (lottiePlayer) {
                console.log('[step3_results.js] Mouse enter selector -> Play Lottie forward');
                lottiePlayer.setDirection(1);
                lottiePlayer.play();
            }
        };
        verticalRouteSelector.onmouseleave = () => {
            if (lottiePlayer) {
                 console.log('[step3_results.js] Mouse leave selector -> Play Lottie backward');
                 lottiePlayer.setDirection(-1);
                 lottiePlayer.play();
            }
        };
         console.log("[step3_results.js] Lottie hover listeners added to selector.");
    } else {
         console.warn("[step3_results.js] Could not add Lottie hover listeners (selector or player missing).");
    }

    // --- Обработчики для кнопки пересчета ---
    if (recalculateBtn) {
        // Клик для запуска пересчета с измененными адресами
        recalculateBtn.onclick = () => {
            if (!resultsLayout || resultsLayout.classList.contains('recalculating')) {
                return;
            }

            // Собираем измененные адреса для текущего маршрута
            if (currentSelectedRouteId) {
                // Сначала проверяем валидность всех адресов (нет пустых)
                const invalidAddresses = validateAddresses();
                if (invalidAddresses.length > 0) {
                    console.error('[step3_results.js] Found invalid addresses:', invalidAddresses);
                    
                    // Заменяем alert на более информативное сообщение
                    const pluralForm = invalidAddresses.length > 1 ? 'адресов' : 'адрес';
                    const rowNumbers = invalidAddresses.map(index => index + 1).join(', ');
                    
                    alert(`Пожалуйста, заполните пустые адреса перед пересчетом маршрута.\nОбнаружено ${invalidAddresses.length} пустых ${pluralForm} в строках: ${rowNumbers}`);
                    
                    // Прокручиваем к первому пустому адресу для удобства
                    const firstInvalidRow = document.querySelector('#geocoder-table tr:nth-child(' + (invalidAddresses[0] + 1) + ')');
                    if (firstInvalidRow) {
                        firstInvalidRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    
                    return;
                }
                
                // Только после проверки валидности проверяем наличие изменений
                const hasModifications = modifiedAddresses[currentSelectedRouteId] && 
                                      Object.keys(modifiedAddresses[currentSelectedRouteId]).length > 0;
                
                if (!hasModifications) {
                    console.log('[step3_results.js] No modified addresses to recalculate.');
                    // --- УДАЛЕНО: alert об отсутствии изменений ---
                    // alert('Нет измененных адресов для пересчета маршрута.'); 
                    return;
                }

                // --- УДАЛЕНО: alert об обнаружении изменений ---
                // const modCount = Object.keys(modifiedAddresses[currentSelectedRouteId]).length;
                // alert(`Обнаружено ${modCount} измененных адресов. Пересчет маршрута будет выполнен.`);

                // Собираем данные для пересчета
                const recalculationData = collectModifiedData();
                if (!recalculationData) {
                    console.error('[step3_results.js] Failed to collect data for recalculation');
                    return;
                }

                console.log('[step3_results.js] Starting route recalculation with modified data:', JSON.stringify(recalculationData, null, 2));
                
                // Показываем индикатор загрузки
                resultsLayout.classList.add('recalculating');
                recalculateBtn.disabled = true;

                // Отправка данных на сервер для пересчета
                fetch('/api/recalculate-route', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        // Можно добавить CSRF токен, если он используется
                        // 'X-CSRFToken': getCookie('csrftoken') 
                    },
                    body: JSON.stringify(recalculationData)
                })
                .then(response => {
                    // TODO: Добавить обработку ответа сервера (успех/ошибка)
                    // Нужно проверить response.ok и response.status
                    // и распарсить JSON, если ответ успешный
                    console.log('[step3_results.js] Received response from /api/recalculate-route:', response);
                    if (!response.ok) {
                        // Если ответ не ОК, выбросить ошибку, чтобы попасть в .catch
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json(); // Парсим JSON ответа
                })
                .then(data => {
                    console.log('[step3_results.js] Recalculation successful, server response:', data);
                    
                    // --- ДОБАВЛЕНА ДЕТАЛЬНАЯ ПРОВЕРКА УСЛОВИЯ ---
                    console.log(`[Debug Check] data: ${!!data}`);
                    console.log(`[Debug Check] data.status === 'recalculated': ${data?.status === 'recalculated'}`);
                    console.log(`[Debug Check] data.route_name: ${data?.route_name}`);
                    console.log(`[Debug Check] currentSelectedRouteId: ${currentSelectedRouteId}`);
                    console.log(`[Debug Check] data.route_name === currentSelectedRouteId: ${data?.route_name === currentSelectedRouteId}`);
                    console.log(`[Debug Check] currentRoutesData[currentSelectedRouteId]: ${!!currentRoutesData[currentSelectedRouteId]}`);
                    // --- КОНЕЦ ДЕТАЛЬНОЙ ПРОВЕРКИ ---
                    
                    // Проверяем статус ответа и наличие данных
                    if (data && data.status === 'recalculated' && data.route_name === currentSelectedRouteId && currentRoutesData[currentSelectedRouteId]) {
                        console.log("[Debug Check] Condition PASSED. Proceeding with update."); // Лог, что условие пройдено
                        
                        // 1. Обновляем глобальные данные для этого маршрута
                        currentRoutesData[currentSelectedRouteId] = data; 
                        console.log(`[step3_results.js] Updated currentRoutesData for ${currentSelectedRouteId}`);

                        // 2. Очищаем флаги модификаций для этого маршрута
                        if (modifiedAddresses[currentSelectedRouteId]) {
                            modifiedAddresses[currentSelectedRouteId] = {};
                            console.log(`[step3_results.js] Cleared modifications for route: ${currentSelectedRouteId}`);
                        }
                        
                        // 3. Вызываем обновление отображения
                        console.log("[step3_results.js] ===> Calling updateDisplay NOW...", currentSelectedRouteId); // Лог ПЕРЕД вызовом
                        updateDisplay(currentSelectedRouteId); 
                        console.log(`[step3_results.js] <=== Finished updateDisplay for ${currentSelectedRouteId}`);
                        
                        // --- ДОБАВЛЕНО: Принудительно обновляем данные для Резюме ---
                        if (typeof loadSummaryData === 'function') {
                            console.log("[step3_results.js] Calling loadSummaryData() to refresh summary cache...");
                            loadSummaryData(); // Вызываем функцию из app.js
                        } else {
                            console.warn("[step3_results.js] Function loadSummaryData not found. Summary cache might be outdated.");
                        }
                        // --- КОНЕЦ ДОБАВЛЕНИЯ ---
                        
                    } else {
                        // --- ДОБАВЛЕН ЛОГ ДЛЯ НЕПРОЙДЕННОГО УСЛОВИЯ ---
                        console.error('[step3_results.js] Invalid data or condition not met after recalculation. Data:', data, 'Current Route ID:', currentSelectedRouteId);
                        throw new Error('Получены некорректные данные или не совпадает ID маршрута после пересчета.'); // Переходим в .catch
                    }
                })
                .catch(error => {
                    // TODO: Обработать ошибки сети или ошибки от сервера (статус не 2xx)
                    console.error('[step3_results.js] Error during recalculation request:', error);
                    alert(`Ошибка при пересчете маршрута: ${error.message}. Подробности в консоли.`);
                })
                .finally(() => {
                    // Скрываем индикатор загрузки в любом случае (успех или ошибка)
                    if (resultsLayout) resultsLayout.classList.remove('recalculating');
                    recalculateBtn.disabled = false;
                    console.log('[step3_results.js] Recalculation request finished.');
                });

            } else {
                console.error('[step3_results.js] No route selected for recalculation');
            }
        };

        // Наведение для анимации кнопки
        recalculateBtn.onmouseenter = () => {
            if (recalculateLottiePlayer) {
                console.log('[step3_results.js] Mouse enter recalculate button -> Play Lottie');
                recalculateLottiePlayer.stop();
                recalculateLottiePlayer.play();
            }
        };
        // recalculateBtn.onmouseleave = () => { /* Опционально */ };
        console.log("[step3_results.js] Recalculate button listeners added.");

    } else {
        console.error("[step3_results.js] #recalculate-button not found, listeners not added.");
    }

    // --- Обработчик клика на таблицу для редактирования (делегирование) ---
    if (geocoderTableBody) {
        // Удаляем старый слушатель, если он был
        geocoderTableBody.replaceWith(geocoderTableBody.cloneNode(true));
        geocoderTableBody = document.getElementById('geocoder-table'); // Получаем ссылку заново

        if (geocoderTableBody) { // Повторная проверка
            geocoderTableBody.addEventListener('click', (event) => {
                // Проверяем клик по .edit-icon
                const editIcon = event.target.closest('.edit-icon');
                if (editIcon) {
                    const td = editIcon.closest('td');
                    if (td) {
                        startEditAddress(td);
                    }
                    return; // Выходим, если обработали клик по карандашу
                }
                // Проверяем клик по .visibility-icon
                const visIcon = event.target.closest('.visibility-icon');
                if (visIcon) {
                    const row = visIcon.closest('tr');
                    if (row) {
                        const rowIndex = Array.from(row.parentNode.children).indexOf(row);
                        console.log(`[Click Delegate] Visibility icon clicked on row index: ${rowIndex}`, row);
                        toggleRowVisibility(rowIndex);
                    }
                    return; // Выходим, если обработали клик по глазу
                }
                // Можно добавить другие делегаты сюда, если нужно
            }); // Закрываем addEventListener для click на geocoderTableBody
            console.log("[step3_results.js] Geocoder table click listener delegate for edit/visibility added.");
        } else {
             console.error("[step3_results.js] geocoderTableBody became null after cloning!");
        }
        // --- Обработчик контекстного меню (ПКМ) на таблице (делегирование) ---
        geocoderTableBody.addEventListener('contextmenu', (event) => {
            event.preventDefault(); // Отменяем стандартное меню
            const targetRow = event.target.closest('tr');
            if (!targetRow) return; // Клик не по строке
            const rowIndex = Array.from(targetRow.parentNode.children).indexOf(targetRow);
            // Проверка, можно ли удалять эту строку
            const isDeletable = !isStartFinishRow(rowIndex); // Функция проверки
            // Настраиваем и показываем меню
            if (rowContextMenu) {
                const deleteMenuItem = rowContextMenu.querySelector('[data-action="delete-row"]');
                if (deleteMenuItem) {
                    deleteMenuItem.classList.toggle('disabled', !isDeletable);
                }
                // Позиционируем меню
                positionContextMenu(event.pageX, event.pageY);
                // Сохраняем индекс строки для обработчика клика по меню
                rowContextMenu.dataset.targetRowIndex = rowIndex;
            }
        });
        console.log("[step3_results.js] Geocoder table contextmenu listener added.");

    } else { // else для if (geocoderTableBody)
        console.error("[step3_results.js] #geocoder-table (tbody) not found, cannot add listeners.");
    }
    // --- Обработчики для контекстного меню (вынесены из if(geocoderTableBody)) ---
    // --- Обработчик для скрытия меню при клике вне его --- 
    document.addEventListener('click', (event) => {
        if (rowContextMenu && rowContextMenu.classList.contains('visible') && !rowContextMenu.contains(event.target)) {
            hideContextMenu();
        }
    });
    // --- Обработчик клика по пунктам контекстного меню (делегирование) ---
    if (rowContextMenu) {
        rowContextMenu.addEventListener('click', (event) => {
            const targetItem = event.target.closest('li');
            if (!targetItem || targetItem.classList.contains('disabled')) return;
            const action = targetItem.dataset.action;
            const targetRowIndex = parseInt(rowContextMenu.dataset.targetRowIndex, 10);
            if (!isNaN(targetRowIndex)) {
                if (action === 'delete-row') {
                    console.log(`[Context Menu] Delete row clicked for index: ${targetRowIndex}`);
                    removeAddressRow(targetRowIndex);
                }
                // Добавить другие actions, если нужно
            }
            hideContextMenu(); // Скрываем меню после действия
        });
        console.log("[step3_results.js] Document click listener and context menu item listener added.");
    }
} // <-- Закрывающая скобка для setupEventListeners

// --- Вспомогательные функции для контекстного меню ---
function positionContextMenu(pageX, pageY) { // Принимаем pageX, pageY
    if (!rowContextMenu) return;
    // Устанавливаем позицию относительно документа
    rowContextMenu.style.left = `${pageX}px`;
    rowContextMenu.style.top = `${pageY}px`;
    rowContextMenu.classList.add('visible');
}

function hideContextMenu() {
    if (!rowContextMenu) return;
    rowContextMenu.classList.remove('visible');
    delete rowContextMenu.dataset.targetRowIndex; // Очищаем сохраненный индекс
}

function isStartFinishRow(rowIndex) {
    if (rowIndex < 0 || !currentSelectedRouteId || !currentRoutesData[currentSelectedRouteId]) return false;
    const points = currentRoutesData[currentSelectedRouteId].geocoder_output || [];
    if (!points[rowIndex]) return false;
    return points[rowIndex].excel_row === 'СТАРТ' || points[rowIndex].excel_row === 'ФИНИШ';
}

// --- РЕДАКТИРОВАНИЕ АДРЕСА В ТАБЛИЦЕ ---
function startEditAddress(tdElement) {
    if (tdElement.classList.contains('editing')) {
        return; // Уже редактируется
    }

    const addressSpan = tdElement.querySelector('.address-text');
    const editIcon = tdElement.querySelector('.edit-icon'); // Находим и иконку
    
    // --- ИЗМЕНЕНО: Проверяем наличие обоих элементов --- 
    if (!addressSpan || !editIcon) {
        console.error("[startEditAddress] Could not find addressSpan or editIcon within the cell.");
        return;
    }
    
    const originalText = addressSpan.textContent;
    
    // Создаем input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalText;
    input.dataset.originalValue = originalText; // Сохраняем оригинал в data-атрибуте
    input.dataset.isProcessing = "false"; // Флаг для отслеживания состояния обработки
    input.dataset.isEscapePressed = "false"; // Флаг для отслеживания нажатия Escape
    
    // Маркировка для предотвращения гонки событий
    let isFinishingEdit = false;

    // --- ИЗМЕНЕНО: Скрываем существующие элементы и добавляем input, не очищая innerHTML --- 
    // // Очищаем ячейку и добавляем input (УДАЛЕНО)
    // tdElement.innerHTML = ''; 
    // tdElement.appendChild(input);
    
    tdElement.classList.add('editing');
    addressSpan.style.display = 'none'; // Скрываем текст
    editIcon.style.display = 'none'; // Скрываем иконку
    tdElement.appendChild(input); // Добавляем input
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---
    
    input.focus();

    // Обработчики для завершения редактирования
    const finishEditing = (isEscaped = false) => {
        // Если уже обрабатывается, не делаем ничего
        if (isFinishingEdit) {
            return;
        }
        
        // Устанавливаем флаг обработки
        isFinishingEdit = true;
        
        // Если нажат Escape, отмечаем это
        if (isEscaped) {
            input.dataset.isEscapePressed = "true";
            
            // Для Escape сразу восстанавливаем исходное состояние
            tdElement.innerHTML = `<span class="address-text">${originalText}</span><span class="edit-icon">${pencilSvgIcon}</span>`;
            tdElement.classList.remove('editing');
            console.log("[step3_results.js] Edit canceled by Escape key. Reverted to original value:", originalText);
        } else {
            // Для обычного завершения редактирования вызываем endEditAddress
            setTimeout(() => {
                endEditAddress(input, tdElement, isEscaped); // Передаем флаг isEscaped
            }, 10);
        }
        
        // В любом случае удаляем слушатели
        input.removeEventListener('blur', handleBlur);
        input.removeEventListener('keydown', handleKeyDown);
    };
    
    // Отдельный обработчик для blur
    const handleBlur = () => {
        // Если это не отмена по Escape
        if (input.dataset.isEscapePressed !== "true") {
            finishEditing(false);
        }
    };

    // Обработчик клавиатурных событий
    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Предотвращаем возможное стандартное поведение
            finishEditing(false);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            finishEditing(true);
        }
    };

    // Устанавливаем обработчики с оптимизированной логикой
    input.addEventListener('blur', handleBlur); // handleBlur вызовет endEditAddress(input, tdElement, false)
    input.addEventListener('keydown', handleKeyDown); // handleKeyDown вызовет endEditAddress(input, tdElement, isEscaped)
}

// --- ИЗМЕНЕНО: endEditAddress теперь принимает input, td, и isEscaped --- 
function endEditAddress(inputElement, tdElement, isEscaped = false) {
    console.log(`[endEditAddress] Called. isEscaped: ${isEscaped}`); // Лог начала
    
    // Находим нужные элементы внутри tdElement
    const addressSpan = tdElement.querySelector('.address-text');
    const editIcon = tdElement.querySelector('.edit-icon');
    
    // Проверяем, существует ли еще tdElement, inputElement, addressSpan, editIcon в DOM
    if (!tdElement || !tdElement.parentNode || !inputElement || !inputElement.parentNode || !addressSpan || !editIcon) {
        console.warn("[endEditAddress] One or more elements (td, input, span, icon) no longer exist in DOM. Aborting.");
        // Попытка безопасного восстановления, если возможно
        if (tdElement && !addressSpan) { 
            // Если ячейка есть, а спана нет, пытаемся восстановить из input (если он еще есть)
            const originalValue = inputElement?.dataset?.originalValue || '' ;
            tdElement.innerHTML = `<span class="address-text">${originalValue}</span><span class="edit-icon">${pencilSvgIcon}</span>`;
        } else if (tdElement && addressSpan && !editIcon) {
             // Если есть спан, но нет иконки
             const icon = document.createElement('span');
             icon.className = 'edit-icon';
             icon.innerHTML = pencilSvgIcon;
             tdElement.appendChild(icon);
        }
        if (tdElement) tdElement.classList.remove('editing');
        if (inputElement && inputElement.parentNode) inputElement.parentNode.removeChild(inputElement);
        return;
     }

    const newValue = inputElement.value.trim();
    const originalText = inputElement.dataset.originalValue || "";

    // --- ИЗМЕНЕНО: Сначала удаляем input и показываем скрытые элементы --- 
    // Удаляем input
    tdElement.removeChild(inputElement);
    // Показываем обратно текст и иконку
    addressSpan.style.display = ''; // Возвращаем display по умолчанию
    editIcon.style.display = ''; // Возвращаем display по умолчанию
    // Убираем класс редактирования с ячейки
    tdElement.classList.remove('editing');
    tdElement.classList.remove('invalid-address'); // Убираем подсветку ошибки на всякий случай
    // --- КОНЕЦ ИЗМЕНЕНИЯ --- 

    // Если был нажат Escape, просто восстанавливаем оригинальный текст и выходим
    if (isEscaped) {
        console.log("[endEditAddress] Edit canceled by Escape. Reverting text.");
        addressSpan.textContent = originalText;
        return; // Больше ничего не делаем
    }

    // Если не Escape, продолжаем обработку

    // Находим строку таблицы, содержащую ячейку (нужно для modifiedAddresses)
    const rowElement = tdElement.closest('tr');
    if (!rowElement) {
        console.error("[endEditAddress] Could not find parent row for edited cell. Cannot save changes.");
        addressSpan.textContent = originalText; // Возвращаем старое значение, если не нашли строку
        return;
    }
    const rowIndex = Array.from(rowElement.parentNode.children).indexOf(rowElement);
    
    // Валидация: проверяем, не пустой ли адрес
    if (newValue === '') {
        console.log("[endEditAddress] New value is empty. Marking as invalid.");
        // Подсвечиваем пустое поле адреса красным
        tdElement.classList.add('invalid-address');
        // Оставляем пустой текст
        addressSpan.textContent = '';
        // Отмечаем в modifiedAddresses, если нужно
        if (originalText !== '') { // Только если оригинал был не пустым
            if (!modifiedAddresses[currentSelectedRouteId]) modifiedAddresses[currentSelectedRouteId] = {};
            modifiedAddresses[currentSelectedRouteId][rowIndex] = { 
                originalAddress: originalText, newAddress: '', rowIndex: rowIndex, isEmpty: true 
            };
             // Также обновляем данные в currentRoutesData
             if (currentRoutesData[currentSelectedRouteId]?.geocoder_output?.[rowIndex]) {
                currentRoutesData[currentSelectedRouteId].geocoder_output[rowIndex].input = '';
                currentRoutesData[currentSelectedRouteId].geocoder_output[rowIndex].modified = true;
                currentRoutesData[currentSelectedRouteId].geocoder_output[rowIndex].isInvalid = true;
                currentRoutesData[currentSelectedRouteId].geocoder_output[rowIndex].needsRecalculation = true; 
             }
        }
        return; // Выходим после обработки пустого значения
    }

    // Если значение не пустое и изменилось
    if (newValue !== originalText) {
        console.log(`[endEditAddress] Value changed from "${originalText}" to "${newValue}". Saving.`);
        addressSpan.textContent = newValue;

        // Сохраняем измененный адрес в структуре modifiedAddresses
        if (!modifiedAddresses[currentSelectedRouteId]) {
            modifiedAddresses[currentSelectedRouteId] = {};
        }
        modifiedAddresses[currentSelectedRouteId][rowIndex] = {
            originalAddress: originalText,
            newAddress: newValue,
            rowIndex: rowIndex
        };
        console.log(`[step3_results.js] Address edited and saved. Original: "${originalText}", New: "${newValue}" at index ${rowIndex}`);

        // Плавно очищаем соседние ячейки
        const foundAddressCell = tdElement.nextElementSibling;
        const coordsCell = foundAddressCell ? foundAddressCell.nextElementSibling : null;
        const accuracyCell = coordsCell ? coordsCell.nextElementSibling : null;
        const cellsToClear = [foundAddressCell, coordsCell, accuracyCell].filter(Boolean);

        cellsToClear.forEach(cell => cell.classList.add('cell-fading-out'));

        setTimeout(() => {
            cellsToClear.forEach(cell => {
                 if (cell === foundAddressCell) cell.textContent = '-';
                 else if (cell === coordsCell) cell.textContent = '-';
                 else if (cell === accuracyCell) cell.innerHTML = '<span class="accuracy-tag tag-unknown">❓ Требуется пересчет</span>';
                 cell.classList.remove('cell-fading-out');
            });
        }, 300);

        // Обновляем данные в currentRoutesData для отслеживания изменений
        if (currentRoutesData[currentSelectedRouteId]?.geocoder_output?.[rowIndex]) {
            currentRoutesData[currentSelectedRouteId].geocoder_output[rowIndex].input = newValue;
            currentRoutesData[currentSelectedRouteId].geocoder_output[rowIndex].modified = true;
            currentRoutesData[currentSelectedRouteId].geocoder_output[rowIndex].needsRecalculation = true;
            currentRoutesData[currentSelectedRouteId].geocoder_output[rowIndex].isInvalid = false; // Снимаем флаг ошибки
            currentRoutesData[currentSelectedRouteId].geocoder_output[rowIndex].found = null;
            currentRoutesData[currentSelectedRouteId].geocoder_output[rowIndex].lat = null;
            currentRoutesData[currentSelectedRouteId].geocoder_output[rowIndex].lon = null;
            currentRoutesData[currentSelectedRouteId].geocoder_output[rowIndex].type = null;
            console.log(`[step3_results.js] Updated geocoder_output data for point ${rowIndex}`);
        } else {
            console.warn(`[step3_results.js] Could not update geocoder_output data for point ${rowIndex}. Data structure may be inconsistent.`);
        }

    } else {
        // Значение не изменилось (и не пустое)
        console.log("[endEditAddress] Value not changed. Reverting text (just in case).");
        addressSpan.textContent = originalText; // Просто оставляем как было
    }
}

// --- Функция валидации адресов ---
function validateAddresses() {
    if (!currentSelectedRouteId || !currentRoutesData[currentSelectedRouteId] || 
        !currentRoutesData[currentSelectedRouteId].geocoder_output) {
        console.error('[step3_results.js] No valid route data found for validation');
        return [];
    }

    const invalidAddresses = [];
    
    // Проверяем все ячейки с адресами на пустые значения
    const addressCells = document.querySelectorAll('#geocoder-table tr td:nth-child(2)');
    addressCells.forEach((cell, index) => {
        // Пропускаем скрытые строки
        const rowEl = cell.closest('tr');
        if (rowEl && rowEl.classList.contains('row-hidden')) {
            return;
        }
        const addressText = cell.querySelector('.address-text')?.textContent?.trim();
        
        // Пропускаем строки с офисами (они не должны редактироваться)
        const rowElement = cell.closest('tr');
        const pointData = currentRoutesData[currentSelectedRouteId].geocoder_output[index];
        if (pointData && (pointData.excel_row === 'СТАРТ' || pointData.excel_row === 'ФИНИШ')) {
            return; // Пропускаем офисные точки
        }
        
        if (!addressText) {
            // Подсвечиваем пустые адреса
            cell.classList.add('invalid-address');
            invalidAddresses.push(index);
            
            // Также отмечаем в данных
            if (currentRoutesData[currentSelectedRouteId].geocoder_output[index]) {
                currentRoutesData[currentSelectedRouteId].geocoder_output[index].isInvalid = true;
                
                // Отмечаем пустой адрес как требующий внимания
                if (!modifiedAddresses[currentSelectedRouteId]) {
                    modifiedAddresses[currentSelectedRouteId] = {};
                }
                
                // Добавляем в modifiedAddresses для отслеживания
                const originalAddress = currentRoutesData[currentSelectedRouteId].geocoder_output[index].input || '';
                if (originalAddress !== '') {
                    modifiedAddresses[currentSelectedRouteId][index] = {
                        originalAddress: originalAddress,
                        newAddress: '',
                        rowIndex: index,
                        isEmpty: true
                    };
                }
            }
        } else {
            cell.classList.remove('invalid-address');
            // Снимаем отметку invalid в данных, если она была
            if (currentRoutesData[currentSelectedRouteId].geocoder_output[index]) {
                currentRoutesData[currentSelectedRouteId].geocoder_output[index].isInvalid = false;
            }
        }
    });
    
    return invalidAddresses;
}

// --- Функция сбора модифицированных данных ---
function collectModifiedData() {
    if (!currentSelectedRouteId || !currentRoutesData[currentSelectedRouteId]) {
        console.error('[step3_results.js] No route data found for collecting modifications');
        return null;
    }
    
    const routePoints = currentRoutesData[currentSelectedRouteId].geocoder_output || [];
    const pointsToSend = []; // Собираем только видимые точки
    
    for (let i = 0; i < routePoints.length; i++) {
        const point = routePoints[i];
        
        // Пропускаем скрытые точки
        if (point.hidden) {
            continue;
        }
        
        // Определяем, является ли точка офисом
        const isOffice = point.excel_row === 'СТАРТ' || point.excel_row === 'ФИНИШ';
        
        // Определяем, была ли точка модифицирована (включая новые)
        const isModified = !!(point.modified || point.needsRecalculation || point.isNewlyAdded);
        
        pointsToSend.push({
            originalIndex: i, // Сохраняем исходный индекс для возможной отладки
            address: point.input || '', // Отправляем текущий адрес из input
            isOffice: isOffice,
            isHidden: false, // Все отправляемые точки видимы
            isModified: isModified,
            // Отправляем координаты, только если точка не офис И не модифицирована
            lat: (!isOffice && !isModified) ? point.lat : null,
            lon: (!isOffice && !isModified) ? point.lon : null
        });
    }
    
    // Возвращаем данные для отправки на сервер
    return {
        routeId: currentSelectedRouteId,
        routeName: currentRoutesData[currentSelectedRouteId].route_name,
        points: pointsToSend // Отправляем отфильтрованный и подготовленный массив
    };
}

// --- Функция переключения видимости строки ---
function toggleRowVisibility(rowIndex) {
    console.log(`[toggleRowVisibility] Called for rowIndex: ${rowIndex}`); // Лог №1
    if (!currentSelectedRouteId || !currentRoutesData[currentSelectedRouteId]) return;
    const points = currentRoutesData[currentSelectedRouteId].geocoder_output;
    if (!points || rowIndex < 0 || rowIndex >= points.length) {
         console.warn(`[toggleRowVisibility] Invalid rowIndex ${rowIndex} or points data not found.`); // Лог при ошибке
         return;
    }
    const point = points[rowIndex];
    console.log(`[toggleRowVisibility] Point data before toggle:`, JSON.parse(JSON.stringify(point || {}))); // Лог №2
    // Переключаем признак скрытия
    point.hidden = !point.hidden;
    console.log(`[toggleRowVisibility] Point data after toggle:`, JSON.parse(JSON.stringify(point))); // Лог №3
    
    // Обновляем отображение строки
    // --- ИСПРАВЛЕНО: Получаем tbody заново --- 
    const currentTbody = document.getElementById('geocoder-table');
    if (!currentTbody) {
        console.error("[toggleRowVisibility] Could not find #geocoder-table (tbody)");
        return;
    }
    const row = currentTbody.rows[rowIndex]; 
    // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
    
    if (row) {
        row.classList.toggle('row-hidden', !!point.hidden);
        console.log(`[toggleRowVisibility] Row found. Class 'row-hidden' set to: ${!!point.hidden}`, row); // Лог №4
    } else {
        console.warn(`[toggleRowVisibility] Row element not found in DOM for rowIndex: ${rowIndex}`); // Лог №5
    }
}

// --- Функция добавления новой строки в таблицу ---
function addNewAddressRow(insertBeforeIndex = -1) {
    console.log('Добавление новой строки...');

    // Проверка существования таблицы и данных о текущем маршруте
    const table = document.getElementById('geocoder-table');
    const tableContainer = document.getElementById('table-scroll-wrapper'); // Получаем контейнер
    if (!table || !tableContainer || !currentSelectedRouteId || !currentRoutesData[currentSelectedRouteId]) {
        console.error('[step3_results.js] Cannot add new row: table, container or route data not found');
        return -1;
    }

    // Определяем индекс для вставки
    let newIndex = insertBeforeIndex;

    // Создаём пустой объект для новой точки
    const newPoint = {
        input: '', found: '', lat: null, lon: null, type: null,
        modified: true, needsRecalculation: true, isNewlyAdded: true
    };

    // Добавляем новую точку в массив данных маршрута
    const routePoints = currentRoutesData[currentSelectedRouteId].geocoder_output || [];
    routePoints.splice(newIndex, 0, newPoint);

    // Создаём новую строку
    const newRow = document.createElement('tr');
    newRow.classList.add('add-point-row'); // Строка изначально скрыта CSS

    // Формируем базовый HTML для строки (без кнопки +)
    newRow.innerHTML = `
        <td class="row-number text-center" style="position:relative;">
            <span class="visibility-icon">${eyeSvgIcon}</span>
            <span class="row-index"></span>
        </td>
        <td><div class="cell-content-wrapper"><span class="address-text"></span><span class="edit-icon">${pencilSvgIcon}</span></div></td>
        <td><div class="cell-content-wrapper">-</div></td>
        <td><div class="cell-content-wrapper">-</div></td>
        <td><div class="cell-content-wrapper"><span class="accuracy-tag tag-unknown">❓ Требуется ввод адреса</span></div></td>
    `;

    // Добавляем кнопку "+" отдельно, чтобы обработчик был корректным
    const addRowBtn = document.createElement('button');
    addRowBtn.className = 'add-row-btn';
    addRowBtn.title = 'Добавить точку';
    addRowBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 3C8.55228 3 9 3.44772 9 4V7H12C12.5523 7 13 7.44772 13 8C13 8.55228 12.5523 9 12 9H9V12C9 12.5523 8.55228 13 8 13C7.44772 13 7 12.5523 7 12V9H4C3.44772 9 3 8.55228 3 8C3 7.44772 3.44772 7 4 7H7V4C7 3.44772 7.44772 3 8 3Z" fill="currentColor"/></svg>`;

    addRowBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const row = event.currentTarget.closest('tr');
        const rowIndex = Array.from(row.parentNode.children).indexOf(row);
        // Передаем rowIndex, чтобы вставить ПЕРЕД текущей строкой
        addNewAddressRow(rowIndex);
    });
    // Добавляем кнопку в последнюю ячейку (или создаем новую)
    // Важно: кнопка должна быть внутри строки `tr`, а не снаружи
    // Найдем последнюю ячейку и добавим кнопку туда или создадим новую ячейку
    
    // --- ИЗМЕНЕНО: Добавляем кнопку напрямую к <tr>, как в updateDisplay --- 
    // const lastCell = newRow.cells[newRow.cells.length - 1];
    // if (lastCell) {
    //     lastCell.appendChild(addRowBtn); // Добавляем кнопку в последнюю ячейку
    //     lastCell.style.position = 'relative'; // Позиционируем кнопку относительно ячейки
    // } else {
    //     // Если ячеек нет (маловероятно), создаем и добавляем
    //     const buttonCell = document.createElement('td');
    //     buttonCell.style.position = 'relative';
    //     buttonCell.appendChild(addRowBtn);
    //     newRow.appendChild(buttonCell);
    // }
    newRow.appendChild(addRowBtn); // Добавляем кнопку как дочерний элемент <tr>
    // --- КОНЕЦ ИЗМЕНЕНИЯ --- 


    // --- Начало НОВОЙ логики анимации (max-height) ---

    // 1. Измеряем текущую высоту и запоминаем ее
    const currentContainerHeight = tableContainer.scrollHeight;
    console.log(`[addNewAddressRow restored] Current scrollHeight before insert: ${currentContainerHeight}`);

    // 2. Устанавливаем начальную max-height и overflow: hidden ДО добавления строки
    tableContainer.style.maxHeight = `${currentContainerHeight}px`;
    tableContainer.style.overflow = 'hidden'; // Скрываем все, что выйдет за пределы
    // tableContainer.style.transition = 'max-height 0.4s ease-out'; // Убедимся, что transition правильный (он должен быть в CSS)

    // 3. Вставляем новую строку в DOM (она пока скрыта и не занимает места)
    const tbody = table.querySelector('tbody') || table;
    if (insertBeforeIndex >= 0 && insertBeforeIndex < tbody.rows.length) {
         tbody.insertBefore(newRow, tbody.rows[insertBeforeIndex]);
    } else {
         tbody.appendChild(newRow);
    }

    // 4. Обновляем нумерацию (не влияет на анимацию, но важно для данных)
    updateRowNumbers();

    // 5. Измеряем НОВУЮ высоту контента ПОСЛЕ добавления строки
    const newContainerHeight = tableContainer.scrollHeight;
    console.log(`[addNewAddressRow restored] New scrollHeight after insert: ${newContainerHeight}`);

    // 6. Запускаем анимацию max-height контейнера
    requestAnimationFrame(() => {
        console.log(`[addNewAddressRow restored] Animating container to max-height: ${newContainerHeight}px`);
        tableContainer.style.maxHeight = `${newContainerHeight}px`;
        // !!! УДАЛЕНО: Не добавляем класс .row-visible здесь !!!
        // requestAnimationFrame(() => {
        //      console.log('[addNewAddressRow restored] Adding .row-visible class to trigger row animation.');
        //      newRow.classList.add('row-visible');
        // });
    });

    // 7. Обработчик завершения анимации контейнера
    const onHeightTransitionEnd = () => {
        console.log('[addNewAddressRow restored] Container height transition finished. Removing explicit maxHeight.');
        // Убираем явную max-height и overflow, чтобы контейнер мог сжиматься
        tableContainer.style.maxHeight = '';
        tableContainer.style.overflow = '';

        // !!! ДОБАВЛЕНО: Запускаем анимацию СТРОКИ здесь !!!
        console.log('[addNewAddressRow restored] Adding .row-visible class AFTER container transition.');
        newRow.classList.add('row-visible');

        // 8. Запускаем редактирование ПОСЛЕ анимации ячеек (добавляем задержку)
        setTimeout(() => {
            const addressCell = newRow.querySelector('td:nth-child(2)');
            if (addressCell) {
                // Убедимся, что редактируем только что добавленную пустую строку
                const addressTextSpan = addressCell.querySelector('.address-text');
                if (addressTextSpan && addressTextSpan.textContent === '') { // Проверяем, что текст пустой
                    startEditAddress(addressCell);
                    const input = addressCell.querySelector('input[type="text"]'); // Ищем input, т.к. startEditAddress его создает
                    if (input) input.focus();
                }
            }
        }, 400); // Задержка = длительность анимации .cell-content-wrapper (0.4s) или CSS transition строки
    };

    // Добавляем слушатель ЗАВЕРШЕНИЯ анимации max-height контейнера
    // Важно: слушаем именно 'transitionend' и именно для свойства 'max-height'
    tableContainer.addEventListener('transitionend', function handler(event) {
        if (event.propertyName === 'max-height' && event.target === tableContainer) {
            tableContainer.removeEventListener('transitionend', handler); // Удаляем себя
            onHeightTransitionEnd();
        }
    });

    // --- Конец НОВОЙ логики анимации (max-height) ---

    console.log('Добавлена новая строка по индексу:', insertBeforeIndex);
    return insertBeforeIndex; // Возвращаем индекс для возможного использования
}

// --- Функция обновления нумерации строк ---
function updateRowNumbers() {
    const table = document.getElementById('geocoder-table');
    if (!table) return;
    
    const rows = table.querySelectorAll('tr');
    rows.forEach((row, index) => {
        const numCell = row.querySelector('td:first-child');
        if (numCell) {
            let indexSpan = numCell.querySelector('.row-index');
            if (!indexSpan) {
                // Если span не найден, создаём и добавляем после .visibility-icon (или в конец)
                indexSpan = document.createElement('span');
                indexSpan.className = 'row-index';
                const visIcon = numCell.querySelector('.visibility-icon');
                if (visIcon && visIcon.nextSibling) {
                    numCell.insertBefore(indexSpan, visIcon.nextSibling);
                } else {
                    numCell.appendChild(indexSpan);
                }
            }
            indexSpan.textContent = index + 1;
        }
    });
}

// --- Вспомогательная функция для получения индекса строки в таблице ---
function getRowIndexInTable(row) {
    if (!row) return -1;
    const tbody = row.parentNode;
    if (!tbody) return -1;
    return Array.from(tbody.children).indexOf(row);
}

// --- Функция удаления строки ---
function removeAddressRow(rowIndex) {
    if (rowIndex < 0 || !currentSelectedRouteId || !currentRoutesData[currentSelectedRouteId]) return;
    
    const table = document.getElementById('geocoder-table');
    if (!table) return;
    
    const tbody = table.querySelector('tbody') || table;
    if (rowIndex >= tbody.rows.length) return;
    
    const row = tbody.rows[rowIndex];
    if (!row) return;
    
    // Проверяем, не является ли точка офисной (СТАРТ или ФИНИШ)
    const routePoints = currentRoutesData[currentSelectedRouteId].geocoder_output || [];
    if (routePoints[rowIndex] && (routePoints[rowIndex].excel_row === 'СТАРТ' || routePoints[rowIndex].excel_row === 'ФИНИШ')) {
        alert('Точки начала и конца маршрута (офис) нельзя удалить.');
        return;
    }
    
    // Удаляем точку из данных
    routePoints.splice(rowIndex, 1);
    
    // Удаляем строку с анимацией
    row.classList.remove('row-visible');
    row.style.maxHeight = '0';
    row.style.opacity = '0';
    
    setTimeout(() => {
        tbody.removeChild(row);
        
        // Обновляем нумерацию строк
        updateRowNumbers();
    }, 300); // Задержка для завершения анимации
}

// --- Удаляем закрывающую скобку от DOMContentLoaded ---
// });