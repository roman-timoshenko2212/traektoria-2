document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// --- НАЧАЛО: Глобальная переменная для последнего контрола --- 
let latestRoutingControl = null;
// --- КОНЕЦ --- 

// Возвращаем переменные Leaflet
let map = null;
let markers = []; 
let polyline = null; 
let routingControl = null;
// let routeControl; // Эта переменная, кажется, не использовалась активно, можно оставить закомментированной
// let currentMarkers = []; // Эта тоже

let allRoutes = {};
let currentRouteData = null;
let routeData = null;
let route_name = null;
let corrections_step = 1;
let globalServiceTimeMinutes = 0;
let selectedFile = null;
let selectedServiceTime = '0';
let lottieAnimation = null; // Переменная для хранения экземпляра анимации
let lottieSuccessAnimation = null; // Переменная для анимации успеха
let isMouseOverUploadArea = false; // Флаг наведения курсора
let currentStep = 1;
let summaryCache = null; // Кеш для данных сводки
let isInitialLoadComplete = false; // Флаг завершения первоначальной загрузки

// --- НОВАЯ СТРУКТУРА --- 
// Обертки для начального и успешного контента
const originalUploadAreaHTML = `
  <div id="upload-initial-content">
    <div id="lottie-container"></div>
    <p class="upload-text">Перетащите файл сюда или кликните для выбора</p>
    <p class="upload-formats">Поддерживаемые форматы: .xlsx, .xls</p>
  </div>
  <div id="upload-success-content">
    <div id="lottie-success-container"></div>
    <p class="upload-success-text"></p>
  </div>
  <span class="upload-reset-btn">&times;</span>
`;

// --- Вспомогательные функции --- 

// Функция debounce для ограничения частоты вызовов
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args); // Используем apply для сохранения контекста this
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

function initApp() {
  initMapContainer(true);
  setupUploader();
  setupStepNavigation();
  setupSummaryModal();
  setupStep1NextButton();
  initLottieAnimation(); // Инициализируем Lottie при запуске
  setupMapRetryButton(); // <-- ДОБАВЛЕНО
}

// Функция инициализации Lottie анимации
function initLottieAnimation() {
    // Находим контейнер ВНУТРИ начальной обертки
    const container = document.querySelector('#upload-initial-content #lottie-container');
    const uploadArea = document.getElementById('upload-area'); // Получаем сам блок загрузки
    if (!container || !uploadArea) { // Проверяем и uploadArea
        // console.error('Lottie container or Upload area not found');
        // На старте upload-initial-content еще может не быть, это нормально при сбросе
        return;
    }
    // Удаляем предыдущую анимацию, если она была
    if (lottieAnimation) {
        lottieAnimation.destroy();
        lottieAnimation = null;
    }
    container.innerHTML = ''; // Очищаем контейнер
    container.style.display = 'block'; // Показываем контейнер

    try {
        // Используем библиотеку lottie-web (глобальная переменная bodymovin)
        // Убедитесь, что файл анимации лежит в static/animations/
        lottieAnimation = bodymovin.loadAnimation({
            container: container,
            renderer: 'svg',
            loop: true,
            autoplay: false, // Отключаем автозапуск
            path: '/static/animations/Animation - 1745256503856.json' // Путь к вашему файлу
        });
        console.log('Lottie animation loaded');

        // Убираем старые обработчики
        // uploadArea.onmouseenter = ...
        // uploadArea.onmouseleave = ...

        // Новые обработчики с флагом
        uploadArea.addEventListener('mouseenter', () => {
            isMouseOverUploadArea = true;
            // Запускаем, только если не в состоянии успеха и анимация существует/загружена
            if (lottieAnimation && !uploadArea.classList.contains('upload-area-success')) {
                 console.log('Playing Lottie on mouseenter');
                 lottieAnimation.play();
            }
        });

        uploadArea.addEventListener('mouseleave', () => {
            isMouseOverUploadArea = false;
            console.log('Mouse left upload area');
            // Паузу не вызываем здесь
        });

        // Слушатель завершения цикла анимации
        lottieAnimation.addEventListener('loopComplete', () => {
            console.log('Lottie loop complete');
            if (!isMouseOverUploadArea) {
                console.log('Pausing Lottie because mouse is not over');
                lottieAnimation.pause();
            }
        });

    } catch (error) {
        console.error('Error loading Lottie animation:', error);
        container.innerHTML = '<p style="color: red; font-size: 12px;">Ошибка загрузки анимации</p>';
    }
}

function setupUploader() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');
  const serviceTimeInput = document.getElementById('service-time-input');

  // Устанавливаем начальный HTML
  uploadArea.innerHTML = originalUploadAreaHTML;
  // Инициализируем начальную анимацию
  initLottieAnimation();

  const uploadTextElement = uploadArea.querySelector('#upload-initial-content .upload-text'); // Обновляем селектор
  const lottieContainer = uploadArea.querySelector('#upload-initial-content #lottie-container'); // Обновляем селектор

  // --- Универсальный обработчик кликов для uploadArea (Делегирование) ---
  uploadArea.addEventListener('click', (event) => {
    // 1. Проверяем клик по кнопке сброса
    if (event.target.classList.contains('upload-reset-btn')) {
      event.stopPropagation();
      console.log('[Upload Area Click] Reset button clicked.');
      selectedFile = null;
      // Просто убираем класс успеха
      uploadArea.classList.remove('upload-area-success');
      document.getElementById('step-1-next-btn')?.setAttribute('disabled', 'true');
      
      // Уничтожаем анимацию успеха
      if (lottieSuccessAnimation) {
        console.log('[Reset Logic] Destroying success Lottie');
        lottieSuccessAnimation.destroy();
        lottieSuccessAnimation = null;
      }
      // Переинициализируем начальную анимацию (на случай, если ее не было)
      initLottieAnimation(); 
      return;
    }

    // 2. Если клик НЕ по кнопке сброса и область НЕ в состоянии успеха
    if (!uploadArea.classList.contains('upload-area-success')) {
      console.log('[Upload Area Click] Area clicked, triggering file input.');
      fileInput.click();
    }
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    console.log('[drop handler] Started');
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    console.log('[drop handler] File from drop:', file);
    if (file) {
      console.log('[drop handler] File exists');
      selectedFile = file;
      selectedServiceTime = serviceTimeInput.value || '0';
      console.log('[drop handler] File and service time set');
      // Просто добавляем класс успеха
      uploadArea.classList.add('upload-area-success');
      console.log('[drop handler] Success class added');
      
      // Инициализируем анимацию успеха и текст ВНУТРИ ЕЕ КОНТЕЙНЕРА
      initSuccessLottieAnimation(file.name);
      
      document.getElementById('step-1-next-btn')?.removeAttribute('disabled');
    }
  });

  fileInput.addEventListener('change', () => {
    console.log('[change handler] Started');
    const file = fileInput.files[0];
    console.log('[change handler] File from input:', file);
    if (file) {
      console.log('[change handler] File exists');
      selectedFile = file;
      selectedServiceTime = serviceTimeInput.value || '0';
      console.log('[change handler] File and service time set');
      // Просто добавляем класс успеха
      uploadArea.classList.add('upload-area-success');
      console.log('[change handler] Success class added');

      // Инициализируем анимацию успеха и текст ВНУТРИ ЕЕ КОНТЕЙНЕРА
      initSuccessLottieAnimation(file.name);

      document.getElementById('step-1-next-btn')?.removeAttribute('disabled');
    }
  });
}

function setupStep1NextButton() {
    const nextButton = document.getElementById('step-1-next-btn');
    const serviceTimeInput = document.getElementById('service-time-input');
    const reportDateInput = document.getElementById('report-date-input'); // <-- Получаем доступ к полю даты

    if (nextButton && serviceTimeInput && reportDateInput) { // <-- Проверяем и поле даты
        nextButton.addEventListener('click', () => {
            if (selectedFile) {
                // Считываем АКТУАЛЬНОЕ значение времени и ДАТЫ ПРЯМО ПЕРЕД ОТПРАВКОЙ
                const currentServiceTime = serviceTimeInput.value || '0'; 
                const currentReportDate = reportDateInput.value || ''; // <-- Получаем дату
                console.log('Next button clicked, starting upload with file:', selectedFile.name, 
                            ', CURRENT service time:', currentServiceTime, 
                            ', CURRENT report date:', currentReportDate);
                uploadFile(selectedFile, currentServiceTime, currentReportDate); // <-- Передаем актуальное время и ДАТУ
            } else {
                console.warn('Next button clicked, but no file selected.');
                showError('Пожалуйста, сначала выберите файл.');
            }
        });
    }
}

async function uploadFile(file, serviceTime, reportDate) { // <-- Добавлен параметр reportDate
  if (!file) {
      console.error('uploadFile called without a file.');
      showError('Файл не выбран для загрузки.');
      return;
  }

  showLoading('Загрузка и обработка файла...');
  hideError();
  
  const formData = new FormData();
  formData.append('file', file);
  
  // Добавляем время
  const timeToAppend = serviceTime || '0'; 
  formData.append('service_time_per_stop_minutes', timeToAppend);
  
  // Добавляем дату
  formData.append('report_date', reportDate || ''); // <-- Добавляем дату в FormData
  
  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      let errorDetails = `Статус: ${response.status}`;
      try {
        const errorData = await response.json();
        errorDetails = errorData.details || errorData.detail || JSON.stringify(errorData);
      } catch (e) {
        errorDetails = await response.text().catch(() => 'Не удалось прочитать тело ответа');
      }
      throw new Error(`Ошибка загрузки: ${errorDetails}`);
    }
    
    let data;
    
    try {
      data = await response.json();
      console.log("[app.js uploadFile] Received data from /api/upload:", data);
      
      if (!data || typeof data !== 'object') {
        throw new Error('Неверный формат данных от сервера');
      }
    } catch (jsonError) {
      console.error("[app.js uploadFile] JSON parsing error:", jsonError);
      throw new Error(`Ошибка разбора ответа сервера: ${jsonError.message}`);
    }
    
    hideLoading();
    const routes = data.routes || [];
    console.log("[app.js uploadFile] Extracted routes:", routes);
    await updateRouteSelector(routes);

    if (data.status === 'needs_correction') {
      console.log("[app.js uploadFile] Status: needs_correction");
      const exceptions = data.exceptions || [];
      if (exceptions.length > 0) {
        showExceptions(exceptions);
        goToStep(2);
      } else {
        console.warn("[app.js uploadFile] Status needs_correction, but exceptions list is empty. Going to step 3.");
        goToStep(3);
        if (routes.length > 0) {
          console.log("[app.js uploadFile] Calling loadRouteData after needs_correction (no exceptions) for route:", routes[0]);
          await loadRouteData(routes[0]);
        } else {
          console.warn("[app.js uploadFile] No routes found after needs_correction (no exceptions).");
          showRouteError("Маршруты не найдены.");
          document.getElementById('route-selector').classList.add('hidden');
          document.getElementById('route-info').classList.add('hidden');
          document.getElementById('results-container').classList.add('hidden');
          document.getElementById('map-container').classList.add('hidden');
        }
      }
    } else if (data.status === 'processed') {
      console.log("[app.js uploadFile] Status: processed");
      goToStep(3); // <-- Оставляем вызов здесь, он вызовет loadAll... внутри себя
      // ИЗМЕНЕНО: Вызываем загрузку ВСЕХ данных и инициализацию Шага 3
      console.log("[app.js uploadFile] Status processed. Calling loadAllRouteDataAndInitStep3...");
      // await loadAllRouteDataAndInitStep3(); // <-- КОММЕНТИРУЕМ этот избыточный прямой вызов
    } else {
      console.error("[app.js uploadFile] Unknown status received:", data.status);
      throw new Error(data.error || data.details || 'Неизвестный статус ответа от сервера');
    }
  } catch (error) {
    console.error('Ошибка загрузки файла:', error);
    hideLoading();
    showError(`Не удалось обработать файл: ${error.message}`);
    goToStep(1);
    document.getElementById('upload-success').classList.add('hidden');
    document.getElementById('file-input').value = '';
  }
}

function showExceptions(exceptions) {
  const exceptionsContainer = document.getElementById('exceptions-container');
  const exceptionsTable = document.getElementById('exceptions-table');
  exceptionsTable.innerHTML = '';
  
  if (exceptions.length === 0) {
    exceptionsContainer.classList.add('hidden');
    return;
  }
  
  exceptions.forEach((exception, index) => {
    const row = document.createElement('tr');
    
    const routeCell = document.createElement('td');
    routeCell.textContent = exception.route || "—";
    
    const addressCell = document.createElement('td');
    addressCell.textContent = `${exception.row}: ${exception.address}`;
    
    const correctionCell = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input';
    input.name = `correction-${index}`;
    input.dataset.row = exception.row;
    input.dataset.route = exception.route || "";
    input.placeholder = 'Введите исправленный адрес';
    
    correctionCell.appendChild(input);
    row.appendChild(routeCell);
    row.appendChild(addressCell);
    row.appendChild(correctionCell);
    
    exceptionsTable.appendChild(row);
  });
  
  exceptionsContainer.classList.remove('hidden');
  
  const correctionsForm = document.getElementById('corrections-form');
  correctionsForm.onsubmit = (e) => {
    e.preventDefault();
    const corrections = [];
    
    document.querySelectorAll('#exceptions-table input').forEach(input => {
      if (input.value.trim()) {
        corrections.push({
          row: parseInt(input.dataset.row),
          route: input.dataset.route || "",
          corrected: input.value.trim()
        });
      }
    });
    
    submitCorrections(corrections);
  };
}

async function submitCorrections(corrections) {
  showLoading('Применение исправлений и пересчет...');
  hideError();
  
  try {
    const response = await fetch('/api/submit-corrections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ corrections }),
    });
    
    if (!response.ok) {
      let errorDetails = `Статус: ${response.status}`;
      try {
        const errorData = await response.json();
        errorDetails = errorData.details || errorData.detail || JSON.stringify(errorData);
      } catch (e) {
        errorDetails = await response.text().catch(() => 'Не удалось прочитать тело ответа');
      }
      throw new Error(`Ошибка сервера: ${errorDetails}`);
    }
    
    let data;
    try {
      data = await response.json();
      if (!data || typeof data !== 'object') {
        throw new Error('Неверный формат данных от сервера');
      }
      console.log('Ответ сервера после отправки исправлений:', data);
    } catch (jsonError) {
      throw new Error(`Ошибка разбора ответа сервера: ${jsonError.message}`);
    }
    
    if (data && data.status === 'saved') {
      console.log('Статус сохранения: saved, переходим к шагу 3');
      hideLoading();

      updateCorrectionStep(corrections.length);

      const routes = data.routes || [];
      await updateRouteSelector(routes);
      console.log('Обновлен селектор маршрутов');

      goToStep(3);
      console.log('Выполнен переход к шагу 3');

/*       if (routes.length > 0) {
        console.log('Загружаем данные для маршрута:', routes[0]);
        await loadRouteData(routes[0]);
      } else {
        console.log('Нет маршрутов для загрузки после исправлений.');
        showRouteError("Нет доступных маршрутов после исправлений.");
        document.getElementById('route-selector').classList.add('hidden');
        document.getElementById('route-info').classList.add('hidden');
        document.getElementById('results-container').classList.add('hidden');
        document.getElementById('map-container').classList.add('hidden');
      } */
    } else {
      const errorMessage = data.error || data.details || 'Неизвестная ошибка при сохранении маршрута';
      throw new Error(errorMessage);
    }
  } catch (error) {
    console.error('Ошибка отправки корректировок:', error);
    hideLoading();
    showError(`Ошибка обработки маршрута: ${error.message}`);
  }
}

async function loadRoutes() {
  try {
    showLoading('Загрузка списка маршрутов...');
    
    const response = await fetch('/api/routes');
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Неизвестная ошибка');
      throw new Error(`Ошибка загрузки списка маршрутов: ${response.status} - ${errorText}`);
    }
    
    let data;
    
    try {
      data = await response.json();
      
      if (!data || typeof data !== 'object') {
        throw new Error('Неверный формат данных');
      }
      
      if (!data.routes || !Array.isArray(data.routes)) {
        throw new Error('Отсутствуют или неверные данные маршрутов');
      }
    } catch (jsonError) {
      throw new Error(`Ошибка парсинга JSON: ${jsonError.message}`);
    }
    
    hideLoading();
    return data.routes;
  } catch (error) {
    console.error('Ошибка загрузки списка маршрутов:', error);
    hideLoading();
    showError(`Не удалось загрузить список маршрутов: ${error.message}`);
    return [];
  }
}

async function updateRouteSelector(routes = null) {
  const routeSelect = document.getElementById('route-select');
  const routeSelectorDiv = document.getElementById('route-selector');
  if (!routeSelect || !routeSelectorDiv) return;
  
  const currentSelectedValue = routeSelect.value;
  routeSelect.innerHTML = '';

  let routeList = routes;

  if (!routeList) {
    console.warn("updateRouteSelector вызван без списка маршрутов, загрузка...");
    try {
      routeList = await loadRoutes();
    } catch (error) {
      console.error('Ошибка загрузки списка маршрутов:', error);
      showError('Не удалось загрузить список маршрутов.');
      routeSelectorDiv.classList.add('hidden');
      return;
    }
  }

  if (!Array.isArray(routeList)) {
    console.error('Список маршрутов не является массивом:', routeList);
    routeList = [];
  }

  if (routeList.length === 0) {
    routeSelectorDiv.classList.add('hidden');
    document.getElementById('route-info').classList.add('hidden');
    document.getElementById('results-container').classList.add('hidden');
    document.getElementById('map-container').classList.add('hidden');
    return;
  }

  routeSelectorDiv.classList.remove('hidden');

  routeList.forEach(routeName => {
    const option = document.createElement('option');
    option.value = routeName;
    option.textContent = routeName;
    routeSelect.appendChild(option);
  });

  if (currentSelectedValue && routeList.includes(currentSelectedValue)) {
    routeSelect.value = currentSelectedValue;
  } else if (routeList.length > 0) {
    routeSelect.value = routeList[0];
  }

  if (!routeSelect.dataset.listenerAttached) {
    routeSelect.addEventListener('change', (event) => {
      const selectedRoute = event.target.value;
      if (selectedRoute) {
        loadRouteData(selectedRoute);
      }
    });
    routeSelect.dataset.listenerAttached = 'true';
  }
}

// Возвращаем исходную функцию initMapContainer (или близкую к ней)
function initMapContainer(preInit = false) {
  console.log("Инициализация контейнера карты (Leaflet), preInit =", preInit);
  
  if (!document.getElementById('map')) {
    console.log("Создаем элемент div#map");
    const mapElement = document.createElement('div');
    mapElement.id = 'map';
    // mapElement.className = 'map-container'; // Класс лучше задавать для родителя #map-container
    mapElement.style.height = '500px';  // Явно задаем высоту карты
    mapElement.style.width = '100%';    // И ширину
    
    const mapContainerParent = document.getElementById('map-container');
    if (mapContainerParent) {
      console.log("Добавляем элемент div#map в родительский контейнер #map-container");
      mapContainerParent.appendChild(mapElement);
      mapContainerParent.classList.add('hidden'); // Скрываем родителя изначально
      
      // Предварительная инициализация, если нужно (может быть полезно)
      if (preInit && !map) { 
        console.log("Предварительная инициализация карты Leaflet");
        try {
          map = L.map('map', {
            center: [55.7558, 37.6173], // Центр по умолчанию (Москва)
            zoom: 5,
            zoomControl: true,
            attributionControl: true
          });
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
          }).addTo(map);
          console.log("Карта Leaflet успешно создана (preInit)");
          // Не скрываем mapContainerParent здесь снова, уже скрыли выше
        } catch (e) {
          console.error("Ошибка при предварительном создании карты Leaflet:", e);
        }
      }
    } else {
      console.error("Не найден родительский контейнер #map-container");
    }
  } else {
    console.log("Элемент div#map уже существует.");
    // Можно добавить проверку на скрытие родителя и здесь, если нужно
    const mapContainerParent = document.getElementById('map-container');
     if (mapContainerParent && !mapContainerParent.classList.contains('hidden')) {
         // mapContainerParent.classList.add('hidden'); // Скрывать ли, если уже есть? Зависит от логики
     }
  }
}

// --- Новые вспомогательные функции для управления оверлеями карты ---
function showMapLoadingIndicator() {
    const indicator = document.getElementById('map-loading-indicator');
    const errorOverlay = document.getElementById('map-error-overlay');
    if (indicator) indicator.classList.remove('hidden');
    if (errorOverlay) errorOverlay.classList.add('hidden'); // Скрываем ошибку, если она была
}

function hideMapLoadingIndicator() {
    const indicator = document.getElementById('map-loading-indicator');
    if (indicator) indicator.classList.add('hidden');
}

function showMapErrorOverlay(message) {
    console.log("[showMapErrorOverlay] Called with message:", message); // <-- ЛОГ 1
    const errorOverlay = document.getElementById('map-error-overlay');
    const errorMessageEl = document.getElementById('map-error-message');
    const indicator = document.getElementById('map-loading-indicator');
    
    // --- ДОБАВЛЕН ЛОГ ПОИСКА ЭЛЕМЕНТОВ ---
    console.log("[showMapErrorOverlay] Found elements:", {
         errorOverlay: !!errorOverlay,
         errorMessageEl: !!errorMessageEl,
         indicator: !!indicator
    });
    // --- КОНЕЦ ЛОГА ---
    
    if (errorOverlay && errorMessageEl) {
        errorMessageEl.textContent = message || 'Не удалось построить маршрут на карте.';
        errorOverlay.classList.remove('hidden');
        console.log("[showMapErrorOverlay] Removed 'hidden' class from errorOverlay."); // <-- ЛОГ 2
    } else {
        console.error("[showMapErrorOverlay] Could not find error overlay or message element."); // <-- ЛОГ 3
    }
    if (indicator) indicator.classList.add('hidden'); // Скрываем загрузку, если она была
}

function hideMapErrorOverlay() {
    const errorOverlay = document.getElementById('map-error-overlay');
    if (errorOverlay) errorOverlay.classList.add('hidden');
}
// --- Конец новых функций ---

// Возвращаем исходную функцию showMap (или близкую к ней)
// ИЗМЕНЕНО: делаем функцию глобальной
window.showMap = function(points) {
    console.log("Вызвана функция showMap (Leaflet) с точками:", points);
    const mapContainerParent = document.getElementById('map-container');

    // --- ДОБАВЛЕНО: Показываем индикатор загрузки и скрываем ошибку в начале ---
    showMapLoadingIndicator(); 
    // --- КОНЕЦ ДОБАВЛЕНИЯ ---

    if (!mapContainerParent) {
       console.error("Не найден контейнер #map-container для карты.");
       hideMapLoadingIndicator(); // Скрываем загрузку при ошибке
       return; 
    }
  
  if (!points || points.length < 2) {
    console.warn("Недостаточно точек для отображения маршрута на карте.");
    mapContainerParent.classList.add('hidden'); // Скрываем контейнер
    if (map) { // Проверяем, есть ли карта, перед очисткой
        clearMapMarkers(); // Очищаем карту, если она была
        // Убираем старый контрол, если он был
        if (routingControl && map.hasControl(routingControl)) {
             map.removeControl(routingControl);
        }
        routingControl = null;
    }
    return;
  }

  // Проверяем, существует ли div#map и карта
  if (!document.getElementById('map')) {
      console.log("Элемент div#map не существует, создаем его...");
      initMapContainer(false); // Вызываем без preInit, т.к. сейчас будем инициализировать
    }

  if (!map) {
    console.log("Инициализация карты Leaflet в showMap");
    try {
        map = L.map('map', {
            zoomControl: true,
            attributionControl: true
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);
    } catch (e) {
        console.error("Ошибка инициализации карты Leaflet в showMap:", e);
        showRouteError("Не удалось инициализировать карту.");
        mapContainerParent.classList.add('hidden');
    return;
  }
  } else {
    console.log("Карта Leaflet уже инициализирована.");
    }

  // Очищаем предыдущие маркеры и маршрут
  clearMapMarkers(); // Эта функция теперь проверяет map внутри
  // --- ИЗМЕНЕНИЕ: Более безопасное удаление старого контрола --- 
  if (routingControl) {
       // --- ДОБАВЛЕНО: Сбрасываем ссылку на последний контрол ПЕРЕД удалением старого ---
       latestRoutingControl = null;
       // --- КОНЕЦ --- 

       // --- ЛОГИ ОСТАВЛЯЕМ ПОКА --- 
       console.log('[showMap Cleanup] Attempting to remove routingControl. Map object:', map);
       console.log('[showMap Cleanup] routingControl object before removal:', routingControl);
       // --- КОНЕЦ ЛОГОВ --- 

       // --- УДАЛЯЕМ ПРОВЕРКУ hasControl, УДАЛЯЕМ НАПРЯМУЮ В try...catch ---
       try {
           if (map) { // Проверяем только наличие map
                map.removeControl(routingControl);
                console.log("Старый routingControl удален с карты (без hasControl проверки)");
           } else {
               console.warn("Объект map не найден при попытке удаления routingControl.");
           }
       } catch (removeError) {
           console.error("Ошибка при удалении старого routingControl:", removeError);
           // Продолжаем выполнение, просто сбрасываем переменную
       }
       // --- КОНЕЦ ПРЯМОГО УДАЛЕНИЯ ---

       routingControl = null; // Всегда сбрасываем переменную
       console.log('[showMap Cleanup] routingControl variable set to null.');
  } else { // <-- ДОБАВЛЯЕМ ЛОГ ЕСЛИ НЕ БЫЛО КОНТРОЛА
      console.log('[showMap Cleanup] routingControl was already null or undefined. No removal needed.');
  }
  // --- КОНЕЦ ИЗМЕНЕНИЯ ---
  
  // Создаем waypoints для Leaflet Routing Machine
  const waypoints = points.map(point => L.latLng(parseFloat(point.lat), parseFloat(point.lon))); // Возвращаем как было
  console.log("Созданы waypoints для Leaflet Routing Machine:", waypoints.length); // <--- ДОБАВЛЯЕМ ЛОГ КОЛИЧЕСТВА ТОЧЕК
  // Убираем фильтрацию и логи, связанные с ней
  /* --- ФИЛЬТРАЦИЯ ПОДРЯД ИДУЩИХ ДУБЛИКАТОВ ---
  const waypointsRaw = points.map(point => L.latLng(parseFloat(point.lat), parseFloat(point.lon)));
  console.log("Созданы waypoints (raw):", waypointsRaw.length);
  const waypoints = waypointsRaw.filter((wp, index, arr) => { // Используем const здесь
      if (index === 0) return true; // Всегда оставляем первую точку
      // Сравниваем текущую точку с предыдущей
      const prevWp = arr[index - 1];
      return !(wp.lat === prevWp.lat && wp.lng === prevWp.lng);
  });
  console.log("Waypoints после фильтрации дубликатов:", waypoints.length);

  // Проверяем, остались ли точки после фильтрации
  if (waypoints.length < 2) {
      console.warn("После фильтрации дубликатов осталось меньше 2 точек. Маршрут не может быть построен.");
      // Показываем только маркеры (если они есть) или скрываем карту
      drawPolylineAndMarkersManually(waypoints); // Попытка нарисовать то, что есть (может быть 1 точка)
       if (waypoints.length > 0) {
           // Центрируем карту на единственной точке
           map.setView(waypoints[0], 15); // Устанавливаем вид на точку с зумом
       } else {
           mapContainerParent.classList.add('hidden'); // Скрываем, если точек нет совсем
       }
      mapContainerParent.classList.remove('hidden'); // Показываем контейнер
      setTimeout(() => { if (map) map.invalidateSize(); }, 150);
      return; // Выходим из функции showMap
  }
   --- КОНЕЦ ФИЛЬТРАЦИИ --- */

  // --- ДИАГНОСТИКА Waypoints УДАЛЕНА ---
  // console.log("Проверка содержимого waypoints ПЕРЕД L.Routing.control:", JSON.stringify(waypoints));
  // --- КОНЕЦ ДИАГНОСТИКИ ---
  
  // Используем Leaflet Routing Machine для построения и отображения маршрута
  // Используем отфильтрованный массив 'waypoints'
  if (typeof L.Routing !== 'undefined') {
    console.log("Используем L.Routing.control для маршрута");
    // --- ИЗМЕНЕНИЕ: Проверяем map перед добавлением --- 
    if (!map) {
        console.error("Объект карты не существует перед добавлением L.Routing.control");
        showRouteError("Ошибка: Карта не инициализирована перед построением маршрута.");
        mapContainerParent.classList.add('hidden');
        return; // Выходим, если карты нет
    }
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---
    try {
        // --- НАЧАЛО: Явное создание и настройка роутера (с routingOptions) ---
        const osrmRouter = L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1', // Стандартный URL OSRM
            profile: 'driving',                                  // Профиль вождения
            routingOptions: { // <-- Вкладываем опции для URL сюда
                 steps: false,                                         // НЕ запрашивать шаги
                 alternatives: false,                                  // НЕ запрашивать альтернативы
                 overview: 'simplified'                                // Упрощенная геометрия
            }
            // Можно добавить и другие опции OSRMv1, если нужно (например, requestParameters для кастомных параметров)
        });
        // --- КОНЕЦ ---

        routingControl = L.Routing.control({
            waypoints: waypoints, // Используем исходный массив
            router: osrmRouter, // <-- Используем наш настроенный роутер
            // --- УБИРАЕМ эти опции отсюда, т.к. они теперь в роутере ---
            // steps: false,
            // alternatives: false,
            // overview: 'simplified',
            // --- КОНЕЦ УБРАННЫХ ОПЦИЙ ---
            routeWhileDragging: false, 
            showAlternatives: false,   // Эта опция LRM для ОТОБРАЖЕНИЯ, не для запроса
            fitSelectedRoutes: false, // Не масштабировать карту под маршрут автоматически (сделаем вручную)
            show: false,             // Не показывать панель инструкций маршрута
            lineOptions: {
                styles: [{ color: '#4a6bef', opacity: 0.8, weight: 5 }] // Стиль линии
            },
            createMarker: function(i, wp, n) {
                // i - индекс точки (0-based)
                // wp - объект waypoint
                // n - общее количество waypoints
                let type = 'waypoint';
                if (i === 0) type = 'start';
                else if (i === n - 1) type = 'end';
                // Передаем индекс + 1 для отображения номеров промежуточных точек
                return createMarker(wp.latLng, type, i + 1); 
            },
            addWaypoints: false,       // Запретить добавление точек кликом
            draggableWaypoints: false, // Запретить перетаскивание точек
            useZoomParameter: false,
            autoRoute: false // <-- ДОБАВЛЯЕМ эту опцию, чтобы отключить авто-пересчет
        }).addTo(map);
        console.log("L.Routing.control успешно добавлен на карту");
        latestRoutingControl = routingControl; // <-- Запоминаем самый свежий контрол

        // --- НАЧАЛО: Запускаем маршрутизацию вручную --- 
        if (routingControl) {
             routingControl.route();
             console.log("Ручной запуск routingControl.route() выполнен.");
        }
        // --- КОНЕЦ --- 

        // Флаг для отслеживания успешного 'routesfound'
        routingControl._routesFoundSuccessfully = false;

        // Ждем, пока маршрут будет построен, чтобы получить границы
        routingControl.on('routesfound', function(e) {
            // --- НАЧАЛО: Проверка на устаревшее событие --- 
            if (this !== latestRoutingControl) {
                console.warn("[routesfound handler] Событие от старого routingControl проигнорировано.");
                return; 
            }
            // --- КОНЕЦ --- 

            console.log("[app.js] Event: routesfound");
            routingControl._routesFoundSuccessfully = true; // Устанавливаем флаг
            // --- ДОБАВЛЕНО: Скрываем индикатор загрузки --- 
            hideMapLoadingIndicator();
            // Скрываем оверлей ошибки, если он был показан ранее
            hideMapErrorOverlay(); 
            // --- Конец добавления --- 

            const routes = e.routes;
            if (routes.length > 0 && routes[0].coordinates) { // <-- Проверяем наличие координат
              console.log('[app.js] Route found, summary:', routes[0].summary);
              
              // --- НАЧАЛО: Рисуем линию маршрута вручную --- 
              // Сначала удаляем старую линию, если она была (на всякий случай)
              if (polyline && map) {
                  map.removeLayer(polyline);
                  polyline = null;
              }
              // Создаем новую полилинию
              polyline = L.polyline(routes[0].coordinates, {
                  color: '#4a6bef', 
                  opacity: 0.8, 
                  weight: 5 
              }).addTo(map);
              console.log('[app.js] Route polyline drawn manually.');
              // --- КОНЕЦ: Рисуем линию маршрута вручную --- 

              // --- ИЗМЕНЕНИЕ: Убираем повторное масштабирование карты --- 
              /* 
              // Пытаемся подогнать карту под маршрут (можно и не делать, т.к. уже подогнали по маркерам)
              try {
                console.log('[app.js] Attempting map.fitBounds to route');
                // Используем waypoints для масштабирования
                const routeBounds = L.latLngBounds(waypoints); 
                if (routeBounds.isValid()) { // Проверяем валидность границ
                     map.fitBounds(routeBounds, { padding: [50, 50], maxZoom: 15 }); 
                     console.log('[app.js] map.fitBounds to route executed.');
                } else {
                     console.warn('[app.js] Bounds calculated from waypoints for route are invalid. Skipping fitBounds.');
                }
              } catch (fitBoundsError) {
                 console.error('[app.js] Error during map.fitBounds to route:', fitBoundsError);
              }
              */
             // --- Конец изменения --- 

            } else {
               console.warn('[app.js] routesfound event fired, but no routes array found.');
               // --- ИЗМЕНЕНО: Показываем ошибку через оверлей --- 
               showMapErrorOverlay("Маршрут не найден сервисом маршрутизации.");
               // showRouteError("Маршрут не найден сервисом маршрутизации."); // Старый вызов убираем
            }
             // hideError(); // Старый вызов общего сообщения об ошибке убираем
        });
        routingControl.on('routingerror', function(e) {
            console.error("Ошибка маршрутизации Leaflet Routing Machine:", e);

            // Проверяем флаг: если маршрут уже был найден, просто логируем и выходим
            if (routingControl._routesFoundSuccessfully) {
                console.warn("[routingerror handler] Ошибка возникла ПОСЛЕ успешного события 'routesfound'. Маршрут НЕ будет очищен.");
                return; // Ничего не делаем, чтобы не стирать маршрут
            }

            // --- ЭТОТ КОД ВЫПОЛНИТСЯ, ТОЛЬКО ЕСЛИ 'routesfound' НЕ БЫЛО --- 
            const errorMsg = e.error?.message || 'Неизвестная ошибка OSRM';
            // Формируем более детальное сообщение
            let displayError = `Не удалось построить маршрут на карте.`;
            if (errorMsg.includes('timeout')) {
                 displayError += ' (Таймаут запроса к OSRM)';
            } else if (e.error?.status) {
                 displayError += ` (Ошибка ${e.error.status})`;
            }
            
            // --- ДОБАВЛЕНЫ ЛОГИ ДО/ПОСЛЕ ВЫЗОВА --- 
            console.log("[routingerror handler] Before calling showMapErrorOverlay. Error message:", displayError); // <-- ЛОГ 4
            showMapErrorOverlay(displayError); // Вызываем функцию показа оверлея
            console.log("[routingerror handler] After calling showMapErrorOverlay."); // <-- ЛОГ 5
            // --- КОНЕЦ ДОБАВЛЕНИЯ ЛОГОВ ---
            
            // Попытка очистить контрол для предотвращения TypeError
            try {
                if (routingControl) {
                    console.log("[routingerror handler] Попытка очистить маршрут через setWaypoints(null)...");
                    routingControl.setWaypoints(null);
                }
            } catch (clearError) {
                console.error("[routingerror handler] Ошибка при попытке очистки routingControl:", clearError);
            }
            // --- КОНЕЦ ДОБАВЛЕНИЯ ---
        });

  } catch (e) {
        console.error("Ошибка при создании L.Routing.control:", e);
        showRouteError("Не удалось создать контрол маршрутизации.");
        // Попробуем хотя бы нарисовать линию и маркеры вручную
        drawPolylineAndMarkersManually(waypoints); // Используем исходный массив
        // Убираем fitBounds и здесь на случай ошибки
        /*
        if (markers.length > 0) {
             map.fitBounds(L.featureGroup(markers).getBounds(), {padding: [60, 60], maxZoom: 15});
        } else if (waypoints && waypoints.length > 0) { 
             map.fitBounds(L.latLngBounds(waypoints), {padding: [60, 60], maxZoom: 15});
        }
        */
    }
  } else {
    // Если Leaflet Routing Machine не загружен (маловероятно, но возможно)
    console.warn("L.Routing не определен. Рисуем линию и маркеры вручную.");
    drawPolylineAndMarkersManually(waypoints); // Используем исходный массив
    // Масштабируем карту по маркерам или точкам
    if (markers.length > 0) {
        map.fitBounds(L.featureGroup(markers).getBounds(), {padding: [60, 60], maxZoom: 15});
    } else if (waypoints && waypoints.length > 0) { // Добавим проверку
        map.fitBounds(L.latLngBounds(waypoints), {padding: [60, 60], maxZoom: 15});
    }
  }
  
  // Показываем контейнер карты
  mapContainerParent.classList.remove('hidden');
  
  // Обновляем размер карты на случай, если контейнер изменил размер
  setTimeout(() => {
    if (map) {
        console.log("Обновляем размер карты Leaflet (invalidateSize)");
        map.invalidateSize();
    }
  }, 150); // Небольшая задержка

  // --- ДОБАВЛЕНО: Масштабируем карту по маркерам сразу --- 
  if (markers.length > 0) {
    try {
      const bounds = L.featureGroup(markers).getBounds(); 
      if (bounds.isValid()) { // Проверяем валидность границ
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 }); // Добавляем отступы и ограничиваем макс. зум
        console.log('[app.js] Map fitted to markers immediately.');
      } else {
         console.warn('[app.js] Bounds calculated from markers are invalid. Setting view to first marker.');
         // Запасной вариант: центрируем по первой точке
         if (waypoints.length > 0 && map) map.setView(waypoints[0], 13);
      }
    } catch (e) {
      console.error("[app.js] Error fitting bounds for markers:", e);
      // Запасной вариант: центрируем по первой точке
       if (waypoints.length > 0 && map) map.setView(waypoints[0], 13);
    }
  }
  // --- Конец добавления масштабирования по маркерам --- 

  // --- ИЗМЕНЕНО: Масштабируем карту по маркерам С НЕБОЛЬШОЙ ЗАДЕРЖКОЙ --- 
  if (markers.length > 0) {
    // Даем браузеру немного времени на отрисовку контейнера после снятия .hidden
    setTimeout(() => { 
      try {
        // Перепроверяем размер карты перед масштабированием
        if (map) map.invalidateSize(); 

        const bounds = L.featureGroup(markers).getBounds(); 
        if (bounds.isValid()) { // Проверяем валидность границ
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 }); // Используем прежние padding/maxZoom
          console.log('[app.js] Map fitted to markers immediately (after timeout).');
        } else {
           console.warn('[app.js] Bounds calculated from markers are invalid (after timeout). Setting view to first marker.');
           // Запасной вариант: центрируем по первой точке
           if (waypoints.length > 0 && map) map.setView(waypoints[0], 13);
        }
      } catch (e) {
        console.error("[app.js] Error fitting bounds for markers (after timeout):", e);
        // Запасной вариант: центрируем по первой точке
         if (waypoints.length > 0 && map) map.setView(waypoints[0], 13);
      }
    }, 150); // Небольшая задержка, например 150 мс
  }
  // --- Конец изменения --- 

  // Проверяем, что после фильтрации осталось достаточно точек для МАРШРУТА
  if (waypoints.length < 2) {
      console.warn("После фильтрации дубликатов осталось меньше 2 точек. Маршрут не может быть построен.");
      // Показываем только маркеры (если они есть) или скрываем карту
      drawPolylineAndMarkersManually(waypoints); // Попытка нарисовать то, что есть (может быть 1 точка)
       if (waypoints.length > 0) {
           // Центрируем карту на единственной точке
           map.setView(waypoints[0], 15); // Устанавливаем вид на точку с зумом
       } else {
           mapContainerParent.classList.add('hidden'); // Скрываем, если точек нет совсем
       }
      mapContainerParent.classList.remove('hidden'); // Показываем контейнер
      setTimeout(() => { if (map) map.invalidateSize(); }, 150);
      return; // Выходим из функции showMap
  }
}

// Вспомогательная функция для ручной отрисовки (если LRM недоступен)
// Принимает массив waypoints
function drawPolylineAndMarkersManually(waypointsToDraw) { 
    if (!map || !waypointsToDraw) return; // Проверяем waypointsToDraw

    clearMapMarkers(); // Убедимся, что все чисто

    // Рисуем линию, только если есть хотя бы 2 точки
    if (waypointsToDraw.length >= 2) {
        polyline = L.polyline(waypointsToDraw, {
            color: '#4a6bef',
            weight: 5,
            opacity: 0.8
        }).addTo(map);
    }

    // Добавляем маркеры для всех точек (даже если одна)
    waypointsToDraw.forEach((latlng, index) => {
        let type = 'waypoint';
        if (waypointsToDraw.length === 1) { // Если точка всего одна
            type = 'single'; // Можно задать особый тип или использовать 'start'
        } else if (index === 0) {
            type = 'start';
        } else if (index === waypointsToDraw.length - 1) {
            type = 'end';
        }
        // Передаем index + 1, чтобы нумерация была с 1
        const marker = createMarker(latlng, type, index + 1);
        // createMarker сам добавляет маркер в массив markers и на карту
        // markers.push(marker); // Это больше не нужно здесь
    });
    console.log(`Нарисовано вручную: ${markers.length} маркеров.` + (polyline ? " и полилиния." : ""));
}

// Возвращаем исходную функцию createMarker
function createMarker(latlng, type, index) {
  if (!map) return null; // Не создавать маркер, если карты нет

  let html, iconSize, iconAnchor;
  let zIndexOffset = 500;
  
  // Используем кастомные HTML маркеры
  if (type === 'start') {
    html = `<div style="display: flex; align-items: center; justify-content: center; background-color: #e74c3c; color: white; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; font-weight: bold; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">A</div>`;
    iconSize = [32, 32];
    iconAnchor = [16, 16];
    zIndexOffset = 1000; // Стартовый маркер поверх других
  } else if (type === 'end') {
    html = `<div style="display: flex; align-items: center; justify-content: center; background-color: #2ecc71; color: white; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; font-weight: bold; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">B</div>`;
    iconSize = [32, 32];
    iconAnchor = [16, 16];
    zIndexOffset = 1000; // Конечный маркер поверх других
  } else { // Промежуточные точки
    // Отображаем номер точки (index приходит как 1-based из LRM или ручной отрисовки)
    html = `<div style="display: flex; align-items: center; justify-content: center; background-color: #3498db; color: white; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; font-weight: bold; font-size: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">${index}</div>`;
    iconSize = [24, 24];
    iconAnchor = [12, 12];
  }
  
  const icon = L.divIcon({
    html: html,
    className: 'custom-div-icon', // Можно добавить класс для CSS стилизации, если нужно
    iconSize: iconSize,
    iconAnchor: iconAnchor
  });
  
  const marker = L.marker(latlng, { 
      icon: icon,
      zIndexOffset: zIndexOffset // Управляем Z-индексом
  });

  // Добавляем маркер на карту и в массив
  marker.addTo(map);
  markers.push(marker); // Добавляем в глобальный массив markers
  
  return marker; // Возвращаем созданный маркер
}

// Возвращаем исходную функцию clearMapMarkers
function clearMapMarkers() {
  // Удаляем маркеры из массива markers
  markers.forEach(marker => {
    if (map) map.removeLayer(marker);
  });
  markers = []; // Очищаем массив
  
  // Удаляем полилинию, если она есть (используем глобальную переменную polyline)
  if (polyline && map) {
        map.removeLayer(polyline);
        polyline = null;
    }

  // Routing control удаляется отдельно в showMap перед созданием нового
  console.log("Маркеры и полилиния очищены");
}

function updateCorrectionStep(count) {
  const correctionCountElement = document.getElementById('correction-count');
  if (correctionCountElement) {
    correctionCountElement.textContent = count;
    document.getElementById('correction-success').classList.remove('hidden');
  }
}

function setupStepNavigation() {
  const stepButtons = document.querySelectorAll('[data-step]');
  
  stepButtons.forEach(button => {
    button.addEventListener('click', () => {
      const step = button.getAttribute('data-step');
      goToStep(parseInt(step));
    });
  });
}

function goToStep(stepNum) {
  console.log(`[goToStep] Called with stepNum: ${stepNum}`);

  currentStep = stepNum;

  // Обновляем отображение основного контента шага
  document.querySelectorAll('.step-content').forEach(content => {
    content.classList.add('hidden');
  });
  
  const targetContent = document.getElementById(`step-${stepNum}-content`);
  if (targetContent) {
    targetContent.classList.remove('hidden');
  }
  
  // Обновляем состояние панелей шагов (НОВЫЙ КОД)
  const panels = document.querySelectorAll('.step-panel');
  panels.forEach(panel => {
      const stepPanelNum = parseInt(panel.dataset.step);
      panel.classList.remove('active', 'completed', 'upcoming');
      const icon = panel.querySelector('.step-panel-icon');
      const status = panel.querySelector('.step-panel-status');

      if (stepPanelNum < stepNum) {
          panel.classList.add('completed');
          if (icon) icon.textContent = '✓'; // Галочка для завершенных
          if (status) status.textContent = ''; // Убрали текст "Завершено"
      } else if (stepPanelNum === stepNum) {
          panel.classList.add('active');
          if (icon) icon.textContent = stepPanelNum; // Номер для активного
          if (status) status.textContent = ''; // Нет статуса у активного
      } else {
          panel.classList.add('upcoming');
          if (icon) icon.textContent = stepPanelNum; // Номер для будущего
          if (status) status.textContent = ''; // Нет статуса у будущего
      }
  });

  // Сброс состояния Шага 1 при переходе на него
  if (stepNum === 1) {
      selectedFile = null;
      const uploadArea = document.getElementById('upload-area');
      if (uploadArea) {
          uploadArea.classList.remove('upload-area-success');
          if (lottieSuccessAnimation) {
              console.log('[goToStep 1] Destroying success Lottie');
              lottieSuccessAnimation.destroy();
              lottieSuccessAnimation = null;
          }
          uploadArea.innerHTML = originalUploadAreaHTML;
          initLottieAnimation(); 
      }
      const fileInputElement = document.getElementById('file-input');
      if (fileInputElement) fileInputElement.value = '';
      const dateInputElement = document.getElementById('report-date-input');
      if (dateInputElement) dateInputElement.value = '';
      document.getElementById('step-1-next-btn')?.setAttribute('disabled', 'true');
      hideError(); 
  } 
  // --- ДОБАВЛЕНО: Загрузка данных при переходе на Шаг 3 ---
  else if (stepNum === 3) {
      console.log("[goToStep] Transitioning to Step 3, calling loadAllRouteDataAndInitStep3().");
      loadAllRouteDataAndInitStep3();
  }
  // --- КОНЕЦ ДОБАВЛЕНИЯ ---
}

function showLoading(message) {
  const loadingElement = document.getElementById('loading');
  const loadingMessageElement = document.getElementById('loading-message');
  
  if (loadingMessageElement) {
    loadingMessageElement.textContent = message || 'Загрузка...';
  }
  
  if (loadingElement) {
    loadingElement.classList.remove('hidden');
  }
}

function hideLoading() {
  const loadingElement = document.getElementById('loading');
  
  if (loadingElement) {
    loadingElement.classList.add('hidden');
  }
}

function showError(message) {
  const errorElement = document.getElementById('error-message');
  
  if (errorElement) {
    errorElement.textContent = message;
    document.getElementById('error-container').classList.remove('hidden');
  }
}

function hideError() {
  document.getElementById('error-container').classList.add('hidden');
}

function setupSummaryModal() {
  const modal = document.getElementById('summary-modal');
  const showButton = document.getElementById('show-summary-btn');
  const closeButton = document.getElementById('close-modal');

  if (!modal || !showButton || !closeButton) return;

  showButton.addEventListener('click', async () => {
    showLoading('Загрузка сводки...');
    hideError();
    const persistentLog = document.getElementById('persistent-error-log');
    if(persistentLog) persistentLog.style.display = 'none';
    
    try {
        await loadSummaryData();
        modal.classList.remove('hidden');
    } catch (error) {
        console.error("Ошибка при загрузке данных для сводки, модальное окно не показано:", error);
        if (persistentLog) {
            persistentLog.textContent = `Последняя ошибка (Резюме): ${error.message || error}\nСтек: ${error.stack || 'Нет стека'}`;
            persistentLog.style.display = 'block';
        }
    } finally {
        hideLoading();
    }
  });

  closeButton.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.classList.add('hidden');
    }
  });

  // ---> НАЧАЛО: Добавляем обработчик для кнопки Экспорта
  const exportButton = document.getElementById('export-summary-btn');
  if (exportButton) {
    exportButton.addEventListener('click', exportSummaryToXLSX);
  }
  // ---> КОНЕЦ: Добавляем обработчик для кнопки Экспорта
}

async function loadSummaryData() {
  showLoading('Загрузка сводки...');
  hideError();
  try {
    const response = await fetch('/api/summary');
    if (!response.ok) {
      let errorDetails = `Статус: ${response.status}`;
      try {
        const errorData = await response.json();
        errorDetails = errorData.details || errorData.detail || JSON.stringify(errorData);
   } catch (e) {
        errorDetails = await response.text().catch(() => 'Не удалось прочитать тело ответа');
      }
      throw new Error(`Ошибка загрузки сводки: ${errorDetails}`);
    }
    const data = await response.json();
    if (!data || !data.summary) {
      throw new Error('Некорректный формат данных сводки от сервера.');
    }

    globalServiceTimeMinutes = data.global_service_time_minutes !== undefined 
                                 ? parseInt(data.global_service_time_minutes) || 0 
                                 : 0;
    const serviceTimeInput = document.getElementById('service-time-input');
    if (serviceTimeInput) serviceTimeInput.value = globalServiceTimeMinutes;

    renderSummaryTable(data.summary || []);
    hideLoading();
    return data.summary || [];
  } catch (error) {
    console.error('Ошибка загрузки сводки:', error);
    hideLoading();
    showError(`Не удалось загрузить сводку: ${error.message}`);
    renderSummaryTable([]);
    return [];
  }
}

function calculateAndUpdateDifferences(rowElement) {
    if (!rowElement) return;

    const reportDistanceInput = rowElement.querySelector('.distance-input');
    const reportHoursInput = rowElement.querySelector('.hours-input');
    const reportMinutesInput = rowElement.querySelector('.minutes-input');
    const distanceDiffCell = rowElement.querySelector('.distance-diff');
    const timeDiffCell = rowElement.querySelector('.time-diff');

    const baseDistance = parseFloat(rowElement.dataset.baseDistance);
    const totalDurationSeconds = parseInt(rowElement.dataset.totalDurationSeconds, 10);

    let distDiffFormatted = '-';
    let distDiff = null;
    if (!isNaN(baseDistance)) {
        const reportDistVal = reportDistanceInput ? reportDistanceInput.value.trim() : '';
        if (reportDistVal !== '') {
            const reportDistFloat = parseFloat(reportDistVal.replace(',', '.'));
            if (!isNaN(reportDistFloat) && reportDistFloat >= 0) {
                distDiff = baseDistance - reportDistFloat; 
                distDiffFormatted = distDiff.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                distDiffFormatted = `${distDiff >= 0 ? '+' : ''}${distDiffFormatted}`;
            }
        }
    }
    if (distanceDiffCell) {
        distanceDiffCell.textContent = distDiffFormatted;
        distanceDiffCell.classList.remove('positive', 'negative', 'neutral');
        if (distDiff !== null) {
            if (distDiff <= -40) {
                distanceDiffCell.classList.add('negative');
            } else if (distDiff === 0) {
                distanceDiffCell.classList.add('neutral');
            }
        }
    }

    let timeDiffFormatted = '-';
    let timeDiffSeconds = null;
    if (!isNaN(totalDurationSeconds)) {
        const reportHoursVal = reportHoursInput ? reportHoursInput.value.trim() : '';
        const reportMinutesVal = reportMinutesInput ? reportMinutesInput.value.trim() : '';
        
        if (reportHoursVal !== '' || reportMinutesVal !== '') {
            const reportH_int = reportHoursVal !== '' ? parseInt(reportHoursVal, 10) : 0;
            const reportM_int = reportMinutesVal !== '' ? parseInt(reportMinutesVal, 10) : 0;

            const h_valid = !isNaN(reportH_int) && reportH_int >= 0;
            const m_valid = !isNaN(reportM_int) && reportM_int >= 0 && reportM_int < 60;

            if (h_valid && m_valid) {
                const reportTotalSeconds = reportH_int * 3600 + reportM_int * 60;
                timeDiffSeconds = totalDurationSeconds - reportTotalSeconds;
                const sign = timeDiffSeconds >= 0 ? '+' : '-';
                const absDiffSeconds = Math.abs(timeDiffSeconds);
                const diffHours = Math.floor(absDiffSeconds / 3600);
                const diffMinutes = Math.floor((absDiffSeconds % 3600) / 60);
                timeDiffFormatted = `${sign}${diffHours} ч ${diffMinutes} мин`;
            }
        }
    }
    if (timeDiffCell) {
        timeDiffCell.textContent = timeDiffFormatted;
        timeDiffCell.classList.remove('positive', 'negative', 'neutral');
        if (timeDiffSeconds !== null) {
            const timeThresholdSeconds = -5400;
            if (timeDiffSeconds <= timeThresholdSeconds) {
                timeDiffCell.classList.add('negative');
            } else if (timeDiffSeconds === 0) {
                timeDiffCell.classList.add('neutral');
            }
        }
    }
}

function renderSummaryTable(summaryData) {
  const tableBody = document.querySelector('#summary-table tbody');
  const tableHead = document.querySelector('#summary-table thead');
  if (!tableBody || !tableHead) return;

  console.log("Data received by renderSummaryTable:", summaryData);

  tableBody.innerHTML = '';
  tableHead.innerHTML = '';

  const headerRow = document.createElement('tr');
  const headers = [
      "Маршрут", 
      "ФИО водителя",
      "Расстояние (км)", 
      "Время на маршруте",
      "Расстояние (отчет)", 
      "Время (отчет)", 
      "Разница (км)",
      "Разница (время)",
      "Кол-во точек",
      "Комментарий"
  ];
  headers.forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      headerRow.appendChild(th);
  });
  tableHead.appendChild(headerRow);

  if (!Array.isArray(summaryData) || summaryData.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="' + headers.length + '" style="text-align: center;">Нет данных для отображения.</td></tr>';
    return;
  }

  summaryData.forEach(item => {
    const row = document.createElement('tr');
    row.dataset.baseDistance = item.distance !== null && item.distance !== undefined ? item.distance : NaN;
    row.dataset.totalDurationSeconds = item.total_route_time_seconds !== null && item.total_route_time_seconds !== undefined ? item.total_route_time_seconds : NaN;

    const nameCell = document.createElement('td');
    nameCell.textContent = item.route_name || 'Н/Д';
    row.appendChild(nameCell);

    const driverCell = document.createElement('td');
    driverCell.textContent = item.driver_name || '—';
    row.appendChild(driverCell);

    const distanceCell = document.createElement('td');
    distanceCell.textContent = item.distance !== null && item.distance !== undefined ? item.distance : 'Н/Д';
    row.appendChild(distanceCell);

    const totalTimeCell = document.createElement('td');
    totalTimeCell.textContent = item.total_route_time_formatted || 'Н/Д';
    row.appendChild(totalTimeCell);

    const reportDistanceCell = document.createElement('td');
    reportDistanceCell.classList.add('input-cell');
    const distanceInput = document.createElement('input');
    distanceInput.type = 'number';
    distanceInput.step = '0.1';
    distanceInput.min = '0';
    distanceInput.className = 'input distance-input';
    distanceInput.dataset.routeName = item.route_name;
    distanceInput.dataset.field = 'report_distance';
    distanceInput.value = item.report_distance !== null && item.report_distance !== undefined ? item.report_distance : '';
    distanceInput.placeholder = 'км';
    distanceInput.addEventListener('input', handleSummaryInputChange);
    reportDistanceCell.appendChild(distanceInput);
    row.appendChild(reportDistanceCell);

    const reportDurationCell = document.createElement('td');
    reportDurationCell.classList.add('input-cell', 'report-duration-cell');

    const hoursInput = document.createElement('input');
    hoursInput.type = 'number';
    hoursInput.min = '0';
    hoursInput.className = 'input hours-input';
    hoursInput.dataset.routeName = item.route_name;
    hoursInput.dataset.field = 'report_duration_hours';
    hoursInput.value = item.report_duration_hours !== null && item.report_duration_hours !== undefined ? item.report_duration_hours : '';
    hoursInput.placeholder = 'ч';
    hoursInput.addEventListener('input', handleSummaryInputChange);

    const minutesInput = document.createElement('input');
    minutesInput.type = 'number';
    minutesInput.min = '0';
    minutesInput.max = '59';
    minutesInput.className = 'input minutes-input';
    minutesInput.dataset.routeName = item.route_name;
    minutesInput.dataset.field = 'report_duration_minutes';
    minutesInput.value = item.report_duration_minutes !== null && item.report_duration_minutes !== undefined ? item.report_duration_minutes : '';
    minutesInput.placeholder = 'мин';
    minutesInput.addEventListener('input', handleSummaryInputChange);

    const hoursLabel = document.createElement('span');
    hoursLabel.className = 'duration-label';
    hoursLabel.textContent = 'ч';
    const minutesLabel = document.createElement('span');
    minutesLabel.className = 'duration-label';
    minutesLabel.textContent = 'мин';

    reportDurationCell.appendChild(hoursInput);
    reportDurationCell.appendChild(hoursLabel);
    reportDurationCell.appendChild(minutesInput);
    reportDurationCell.appendChild(minutesLabel);
    row.appendChild(reportDurationCell);

    const distanceDiffCell = document.createElement('td');
    distanceDiffCell.classList.add('difference-cell', 'distance-diff');
    distanceDiffCell.textContent = 'Н/Д';
    row.appendChild(distanceDiffCell);

    const timeDiffCell = document.createElement('td');
    timeDiffCell.classList.add('difference-cell', 'time-diff');
    timeDiffCell.textContent = 'Н/Д';
    row.appendChild(timeDiffCell);

    // Убираем создание ячейки комментария 
    // (оставляем только ячейку с количеством точек)
    const stopsCell = document.createElement('td');
    stopsCell.textContent = item.number_of_stops !== null && item.number_of_stops !== undefined ? item.number_of_stops : 'Н/Д';
    row.appendChild(stopsCell);
    
    // Добавляем ячейку для комментария
    const commentCell = document.createElement('td');
    commentCell.classList.add('input-cell');
    const commentInput = document.createElement('textarea');
    commentInput.className = 'input comment-input';
    commentInput.dataset.routeName = item.route_name;
    commentInput.dataset.field = 'comment';
    commentInput.value = item.comment || '';
    commentInput.placeholder = 'Комментарий...';
    commentInput.rows = 1;
    commentInput.addEventListener('input', handleCommentInput);
    
    // Инициализируем правильный размер при первой загрузке
    setTimeout(() => autoResizeTextarea(commentInput), 0);
    
    commentCell.appendChild(commentInput);
    row.appendChild(commentCell);

    tableBody.appendChild(row);
    calculateAndUpdateDifferences(row);
  });
}

const saveSummaryDataBackend = async (inputElement) => {
    const routeName = inputElement.dataset.routeName;
    const field = inputElement.dataset.field;
    let value = inputElement.value.trim();

    const tableRow = inputElement.closest('tr');
    if (!tableRow) return;
    
    const hoursInput = tableRow.querySelector('input[data-field="report_duration_hours"]');
    const minutesInput = tableRow.querySelector('input[data-field="report_duration_minutes"]');
    const distanceInput = tableRow.querySelector('input[data-field="report_distance"]');
    const commentInput = tableRow.querySelector('textarea[data-field="comment"]');

    const dataToSend = {
        route_name: routeName,
        report_distance: distanceInput?.value?.trim() || null,
        report_duration_hours: hoursInput?.value?.trim() || null,
        report_duration_minutes: minutesInput?.value?.trim() || null,
        comment: commentInput?.value || null,
    };

    for (const key in dataToSend) {
       if (dataToSend[key] === "") {
           dataToSend[key] = null;
       }
    }
    if (dataToSend.report_distance !== null) {
        const distFloat = parseFloat(dataToSend.report_distance.replace(',', '.'));
        if (!isNaN(distFloat) && distFloat >= 0) {
            dataToSend.report_distance = distFloat;
     } else {
             dataToSend.report_distance = null;
        }
    }
    if (dataToSend.report_duration_hours !== null) {
       const hoursInt = parseInt(dataToSend.report_duration_hours);
       if (!isNaN(hoursInt) && hoursInt >= 0) {
            dataToSend.report_duration_hours = hoursInt;
       } else {
            dataToSend.report_duration_hours = null;
       }
    }
    if (dataToSend.report_duration_minutes !== null) {
       const minInt = parseInt(dataToSend.report_duration_minutes);
       if (!isNaN(minInt) && minInt >= 0 && minInt < 60) {
            dataToSend.report_duration_minutes = minInt;
       } else {
            dataToSend.report_duration_minutes = null;
       }
    }

    console.log(`[Backend Save] Triggered for ${routeName}:`, JSON.stringify(dataToSend));

    try {
        const response = await fetch('/api/summary/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend)
        });
              
        if (!response.ok) {
             let errorDetails = `Статус: ${response.status}`;
             try {
                 const errorData = await response.json();
                 errorDetails = errorData.details || errorData.detail || JSON.stringify(errorData);
             } catch (e) {
                 errorDetails = await response.text().catch(() => 'Не удалось прочитать тело ответа');
             }
             throw new Error(`Ошибка сохранения: ${errorDetails}`);
        }
        
        const result = await response.json();
        if (result.status === 'ok') {
             console.log('[Backend Save] Данные для', routeName, 'успешно сохранены.');
        } else {
            throw new Error('Некорректный ответ от сервера после обновления.');
        }
    } catch (error) {
        console.error('Ошибка сохранения данных для', routeName, ':', error);
        showError(`Ошибка сохранения: ${error.message}`);
    }
};

const debouncedSaveBackend = debounce((inputElement) => saveSummaryDataBackend(inputElement), 750);

function handleSummaryInputChange(event) {
    const inputElement = event.target;
    const tableRow = inputElement.closest('tr');
    if (tableRow) {
        calculateAndUpdateDifferences(tableRow);
        debouncedSaveBackend(inputElement);
    }
}

async function loadRouteData(routeName) {
  if (!routeName) {
    console.warn("Попытка загрузить данные без имени маршрута.");
    return;
  }
  showLoading(`Загрузка данных для маршрута "${routeName}"...`);
  hideError();

  // Очистка перед загрузкой (можно оставить или убрать, т.к. initStep3UI тоже будет это делать)
  /*
  document.getElementById('distance-value').textContent = '-';
  document.getElementById('duration-value').textContent = '-';
  document.getElementById('total-route-time-value').textContent = '-';
  document.getElementById('geocoder-table').innerHTML = '<tr><td colspan="6">Загрузка...</td></tr>';
  clearMapMarkers();
  */

  try {
    const response = await fetch(`/api/route-data/${encodeURIComponent(routeName)}`);

    if (!response.ok) {
      let errorDetails = `Статус: ${response.status}`;
      try {
        const errorData = await response.json();
        errorDetails = errorData.message || errorData.detail || JSON.stringify(errorData);
      } catch (e) {
        errorDetails = await response.text().catch(() => 'Не удалось прочитать тело ответа');
      }
      throw new Error(`${errorDetails}`);
    }

    const data = await response.json();
    console.log("Received route data:", data);

    if (data.error) {
      throw new Error(data.message || 'Неизвестная ошибка при получении данных маршрута');
    }

    // --- ИЗМЕНЕНИЕ: Вызываем initStep3UI ПЕРЕД рендерингом --- 
    if (typeof initStep3UI === 'function') {
        // Передаем весь объект data, так как step3_results.js теперь ожидает объект
        // где ключи - ID маршрутов, а значения - объекты с данными маршрута
        // Адаптируем структуру данных, если нужно. Предполагаем, что `data` уже содержит
        // объект `routes` в нужном формате или сам является этим объектом.
        // Если `data` содержит один маршрут, создадим объект:
        let routesDataForStep3 = {};
        if (data.route_name) { // Проверяем, есть ли имя маршрута в корне объекта
             // Собираем данные для одного маршрута.
             // Важно: step3_results ожидает структуру { routeId: { name: ..., distance: ..., points: [...], geocoder_output: [...] } }
             routesDataForStep3[data.route_name] = {
                 name: data.route_name,
                 distance: data.distance_data?.formatted_distance || '-', // Берем отформатированные значения
                 duration: data.distance_data?.formatted_duration || '-',
                 totalTime: data.total_route_time_formatted || '-',
                 geocoder_output: data.geocoder_output || [],
                 points: data.route_points || [] // Предполагаем, что route_points нужны для других целей (например, карта или кол-во)
             };
        } else if (data.routes && typeof data.routes === 'object') {
             // Если сервер возвращает объект с маршрутами (как в step3_results.js)
             routesDataForStep3 = data.routes;
                    } else {
             console.warn("[app.js] Data format from /api/route-data not as expected for initStep3UI");
             // Попытаемся создать пустой объект, чтобы избежать ошибки
             routesDataForStep3 = {}; 
        }
        
        console.log("[app.js] Calling initStep3UI with processed data:", routesDataForStep3);
        initStep3UI(routesDataForStep3);
    } else {
        console.error("[app.js] initStep3UI function is not defined!");
        // Возможно, здесь стоит показать ошибку пользователю
    }
    // ---------------------------------------------------------

    // --- УДАЛЯЕМ СТАРЫЙ РЕНДЕРИНГ (теперь он внутри initStep3UI/updateDisplay) ---
    // currentRouteData = data; // Сохранение данных теперь не нужно здесь
    // renderRouteData(data); // Вызов старой функции рендеринга удален
    // --------------------------------------------------------------------------

    // Отображаем контейнеры (если они были скрыты)
    const routeInfoDiv = document.getElementById('route-info');
    const resultsContainerDiv = document.getElementById('results-container');
    const mapContainerDiv = document.getElementById('map-container');

    if(routeInfoDiv) routeInfoDiv.classList.remove('hidden');
    if(resultsContainerDiv) resultsContainerDiv.classList.remove('hidden');
    // Отображение карты управляется внутри showMap, вызываемой из step3_results.js
    // if(mapContainerDiv) mapContainerDiv.classList.remove('hidden');

    // Обновление глобального времени на точку (если пришло с данными маршрута)
    if (data.global_service_time_minutes !== undefined) {
      globalServiceTimeMinutes = parseInt(data.global_service_time_minutes) || 0;
      const serviceTimeInput = document.getElementById('service-time-input');
      if (serviceTimeInput) serviceTimeInput.value = globalServiceTimeMinutes;
      console.log(`[app.js] Global service time set from route data response: ${globalServiceTimeMinutes} min`);
    }

  } catch (error) {
    console.error(`[app.js] Ошибка загрузки данных для маршрута ${routeName}:`, error);
    showRouteError(`Не удалось загрузить данные: ${error.message}`);
    // Скрываем контейнеры при ошибке
    const routeInfoDiv = document.getElementById('route-info');
    const resultsContainerDiv = document.getElementById('results-container');
    const mapContainerDiv = document.getElementById('map-container');
    if(routeInfoDiv) routeInfoDiv.classList.add('hidden');
    if(resultsContainerDiv) resultsContainerDiv.classList.add('hidden');
    if(mapContainerDiv) mapContainerDiv.classList.add('hidden');

  } finally {
    hideLoading();
  }
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds)) {
    return '-';
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} ч ${minutes} мин`;
}

function formatDistance(meters) {
  if (typeof meters !== 'number' || isNaN(meters)) {
    return '-';
  }
  const kilometers = meters / 1000;
  return `${kilometers.toFixed(1)} км`;
}

function showRouteError(message) {
  // Убираем поиск и модификацию resultsContainer и geocoderTable
  // const resultsContainer = document.getElementById('results-container');
  // const geocoderTable = document.getElementById('geocoder-table');
  // if (geocoderTable) geocoderTable.innerHTML = ''; // НЕ ОЧИЩАЕМ ТАБЛИЦУ

  const errorDiv = document.createElement('div');
  errorDiv.className = 'map-error-message'; // Новый класс для стилизации, если нужно
  errorDiv.style.color = 'var(--danger)';
  errorDiv.style.padding = '20px'; // Увеличим отступ
  errorDiv.style.border = '1px solid var(--danger)';
  errorDiv.style.borderRadius = 'var(--border-radius)';
  errorDiv.style.backgroundColor = 'rgba(220, 53, 69, 0.05)'; // Слегка красный фон
  errorDiv.style.textAlign = 'center';
  errorDiv.style.margin = 'auto'; // Центрируем в контейнере карты
  errorDiv.textContent = message;

  // Скрываем блок с основной информацией о маршруте (расстояние, время)
  const routeInfo = document.getElementById('route-info');
  if (routeInfo) {
      routeInfo.classList.add('hidden');
  } else {
      console.error("[showRouteError] Element with ID 'route-info' not found.");
  }

  // Отображаем ошибку ВНУТРИ контейнера карты
  const mapContainer = document.getElementById('map-container');
  if (mapContainer) {
      // Удаляем старые ошибки/плейсхолдеры из контейнера карты
      const oldError = mapContainer.querySelector('.map-error-message');
      const mapElement = mapContainer.querySelector('#map');
      if (oldError) oldError.remove();
      // Если есть сам div карты, его тоже можно скрыть или удалить
      if (mapElement) mapElement.style.display = 'none';
      
      // Добавляем новое сообщение об ошибке
      mapContainer.appendChild(errorDiv);
      mapContainer.classList.remove('hidden'); // Убедимся, что контейнер карты виден
  } else {
      console.error("[showRouteError] Element with ID 'map-container' not found. Cannot display error message inside map.");
      // Как запасной вариант, можно показать общую ошибку
      // showError(message); // Используем существующую функцию общей ошибки
  }
}

// ---> НАЧАЛО: Новая функция для экспорта
async function exportSummaryToXLSX() {
  showLoading('Экспорт данных в XLSX...');
  hideError();
  const persistentLog = document.getElementById('persistent-error-log');
  if(persistentLog) persistentLog.style.display = 'none';

  try {
    // Получаем текущие данные из таблицы (или можно снова запросить с /api/summary)
    // Пока что будем просто вызывать endpoint экспорта без передачи данных с клиента
    const response = await fetch('/api/export-summary', {
      method: 'POST', // Используем POST, если будем передавать параметры фильтрации/сортировки в будущем
      headers: {
        // Возможно, понадобится CSRF токен или другие заголовки в реальном приложении
      }
      // body: JSON.stringify({}), // Пока тело пустое
    });

    if (!response.ok) {
      let errorDetails = `Статус: ${response.status}`;
      try {
        const errorData = await response.json();
        errorDetails = errorData.details || errorData.detail || JSON.stringify(errorData);
      } catch (e) {
        errorDetails = await response.text().catch(() => 'Не удалось прочитать тело ответа');
      }
      throw new Error(`Ошибка экспорта: ${errorDetails}`);
    }

    // Обработка успешного ответа - скачивание файла
    const blob = await response.blob();
    const contentDisposition = response.headers.get('content-disposition');
    let filename = 'summary.xlsx'; // Имя файла по умолчанию
    if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/i);
        if (filenameMatch && filenameMatch.length > 1) {
            filename = filenameMatch[1];
        }
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

  } catch (error) {
    console.error('Ошибка экспорта в XLSX:', error);
    if (persistentLog) {
        persistentLog.textContent = `Последняя ошибка (Экспорт): ${error.message || error}\nСтек: ${error.stack || 'Нет стека'}`;
        persistentLog.style.display = 'block';
    }
  } finally {
    hideLoading();
  }
}
// ---> КОНЕЦ: Новая функция для экспорта

// Вспомогательная функция для экранирования HTML, чтобы избежать XSS
function escapeHTML(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// --- Новая функция для инициализации Lottie анимации УСПЕХА ---
function initSuccessLottieAnimation(filename) {
    // Находим контейнер ВНУТРИ обертки успеха
    const container = document.querySelector('#upload-success-content #lottie-success-container');
    const textElement = document.querySelector('#upload-success-content .upload-success-text'); // Находим элемент текста внутри обертки
    if (!container || !textElement) {
        console.error('Lottie success container or text element not found');
        return;
    }

    // Уничтожаем предыдущую анимацию успеха, если она была
    if (lottieSuccessAnimation) {
        lottieSuccessAnimation.destroy();
        lottieSuccessAnimation = null;
    }
    container.innerHTML = ''; // Очищаем контейнер

    try {
        lottieSuccessAnimation = bodymovin.loadAnimation({
            container: container,
            renderer: 'svg',
            loop: false, // Не зацикливать
            autoplay: true, // Автозапуск
            path: '/static/animations/Animation - 1745262149194.json' // <<< НОВЫЙ ПУТЬ К АНИМАЦИИ
        });
        console.log('Success Lottie animation loaded');
        
        // Устанавливаем текст успеха
        textElement.innerHTML = `Файл: <strong>${escapeHTML(filename)}</strong> успешно загружен!`;

    } catch (error) {
        console.error('Error loading success Lottie animation:', error);
        container.innerHTML = '<p style="color: red; font-size: 12px;">Ошибка загрузки анимации</p>';
        textElement.textContent = 'Файл загружен (ошибка анимации)'; // Запасной текст
    }
}

// --- Добавление обработчика для поля времени на точку ---
const serviceTimeInput = document.getElementById('service-time-input');

if (serviceTimeInput) {
    serviceTimeInput.addEventListener('input', async (event) => {
        console.log('[Service Time Input] Event fired!');
        console.log(`[Service Time Input] Current step variable is: ${currentStep}`);

        // Выполняем только если пользователь находится на шаге 3 (результаты)
        if (currentStep === 3) {
            const newTime = parseInt(event.target.value);
            // Проверяем, что значение - валидное неотрицательное число
            if (!isNaN(newTime) && newTime >= 0) {
                console.log(`[Service Time Input] Condition met (step 3, valid number). Preparing fetch...`);
                try {
                    showLoading('Обновление времени на точку...'); // Показываем индикатор
                    const response = await fetch('/api/update-service-time', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ service_time: newTime })
                    });

                    if (!response.ok) {
                        let errorDetails = `Статус: ${response.status}`;
                        try {
                            const errorData = await response.json();
                            errorDetails = errorData.details || errorData.detail || JSON.stringify(errorData);
                        } catch (e) {
                            errorDetails = await response.text().catch(() => 'Не удалось прочитать тело ответа');
                        }
                        throw new Error(`Ошибка обновления: ${errorDetails}`);
                    }

                    const result = await response.json();
                    if (result.status === 'ok' && result.summary) {
                        console.log('[Service Time Update] Success. Rendering new summary.');
                        summaryCache = result.summary; // Обновляем кэш
                        globalServiceTimeMinutes = result.global_service_time_minutes; // Обновляем глобальное время
                        renderSummaryTable(summaryCache); // Перерисовываем таблицу (на случай, если модальное окно открыто)
                        // Обновляем значение в поле (на случай, если бэкенд его скорректировал, например, < 0)
                        event.target.value = globalServiceTimeMinutes;
                        // !!! Обновляем данные текущего маршрута, отображаемые на шаге 3
                        if (currentRouteData && currentRouteData.route_name) {
                             // Ищем обновленные данные этого маршрута в новой сводке
                             const updatedRouteSummary = summaryCache.find(item => item.route_name === currentRouteData.route_name);
                             if (updatedRouteSummary && updatedRouteSummary.total_route_time_formatted) {
                                 document.getElementById('total-route-time-value').textContent = updatedRouteSummary.total_route_time_formatted;
                                 // Возможно, нужно обновить и другие поля (distance, duration), если они зависят от времени
                    }
                }
            } else {
                        throw new Error('Некорректный ответ от сервера после обновления времени.');
                    }
                } // <-- Добавляем пропущенную скобку try
                catch (error) {
                    console.error('Ошибка обновления времени на точку:', error);
                    showError(`Ошибка обновления времени: ${error.message}`);
                } finally {
                    hideLoading(); // Скрываем индикатор
                }
            } else {
                 console.log(`[Service Time Input] Step is 3, but input value '${event.target.value}' is not a valid non-negative number.`);
            }
        } else {
             console.log(`[Service Time Input] Condition NOT met (currentStep is ${currentStep}, expected 3). Skipping fetch.`);
        }
    });
}

// --- НОВАЯ ФУНКЦИЯ: Загрузка всех данных и инициализация Шага 3 ---
async function loadAllRouteDataAndInitStep3() {
    console.log("[app.js] loadAllRouteDataAndInitStep3 started.");
    showLoading('Загрузка данных всех маршрутов...');
    hideError();

    try {
        const response = await fetch('/api/all-route-data');
        if (!response.ok) {
            let errorDetails = `Статус: ${response.status}`;
            try {
                const errorData = await response.json();
                errorDetails = errorData.message || errorData.detail || JSON.stringify(errorData);
            } catch (e) {
                errorDetails = await response.text().catch(() => 'Не удалось прочитать тело ответа');
            }
            throw new Error(`Ошибка загрузки всех данных: ${errorDetails}`);
        }

        const allRoutesData = await response.json();
        console.log("[app.js] Received all route data:", allRoutesData);

        if (!allRoutesData || typeof allRoutesData !== 'object') {
            throw new Error('Получены некорректные данные для всех маршрутов.');
        }
        
        // Проверяем, есть ли хоть один маршрут
        if (Object.keys(allRoutesData).length === 0) {
            console.warn("[app.js] No route data received from /api/all-route-data. Showing empty state for Step 3.");
            // Можно показать сообщение об ошибке или просто пустое состояние
             if (typeof initStep3UI === 'function') {
                 initStep3UI({}); // Вызов с пустым объектом для отображения пустого состояния
             } else {
                 console.error("[app.js] initStep3UI function not defined when trying to show empty state.");
             }
             // Скрываем ненужные контейнеры, если они были видны
             document.getElementById('route-info')?.classList.add('hidden');
             document.getElementById('results-container')?.classList.add('hidden');
             document.getElementById('map-container')?.classList.add('hidden');
             showRouteError("Нет данных для отображения."); // Показываем сообщение об ошибке в зоне результатов
        } else {
             // Передаем все полученные данные в initStep3UI
             if (typeof initStep3UI === 'function') {
                 console.log("[app.js] Calling initStep3UI with ALL processed data...");
                 initStep3UI(allRoutesData);
                 // Показываем контейнеры, если они были скрыты
                 document.getElementById('route-info')?.classList.remove('hidden');
                 document.getElementById('results-container')?.classList.remove('hidden');
                 // Карта будет показана внутри updateDisplay/updateMapForRoute
             } else {
                 console.error("[app.js] initStep3UI function is not defined!");
                 showError("Ошибка инициализации интерфейса результатов.");
             }
        }

  } catch (error) {
        console.error('[app.js] Ошибка в loadAllRouteDataAndInitStep3:', error);
        showError(`Не удалось загрузить данные маршрутов: ${error.message}`);
        // Возможно, стоит скрыть элементы Шага 3 или показать сообщение об ошибке
        goToStep(1); // Или вернуть на шаг 1
    } finally {
        hideLoading();
    }
}
// --- КОНЕЦ НОВОЙ ФУНКЦИИ ---

function autoResizeTextarea(textarea) {
  // Сначала сбрасываем высоту в автоматический режим
  textarea.style.height = 'auto';
  // Устанавливаем высоту по содержимому
  textarea.style.height = textarea.scrollHeight + 'px';
}

function handleCommentInput(event) {
  autoResizeTextarea(event.target);
  handleSummaryInputChange(event); // Вызываем стандартный обработчик изменений
}

// --- Обработчик кнопки Повторить --- 
function setupMapRetryButton() {
    const retryButton = document.getElementById('map-retry-button');
    if (retryButton) {
        retryButton.addEventListener('click', () => {
            console.log("Map Retry button clicked.");
            // Получаем ID текущего выбранного маршрута
            const currentRouteId = window.currentSelectedRouteId; // Используем глобальную переменную из step3_results
            if (!currentRouteId) {
                console.error("Cannot retry map route: current route ID not found.");
                showMapErrorOverlay("Не удалось определить текущий маршрут для повтора.");
                return;
            }
            // Получаем данные для этого маршрута
            const routeData = window.currentRoutesData[currentRouteId]; // Используем глобальные данные
            if (!routeData || !routeData.route_points) {
                console.error("Cannot retry map route: route data or points not found for", currentRouteId);
                showMapErrorOverlay("Не найдены точки маршрута для повтора.");
                return;
            }
            
            console.log(`Retrying map for routeId: ${currentRouteId} with ${routeData.route_points.length} points.`);
            // Скрываем оверлей ошибки, показываем загрузку и вызываем showMap
            hideMapErrorOverlay();
            showMapLoadingIndicator();
            // Передаем точки в showMap для повторной попытки
            // Оборачиваем в try...catch на всякий случай
            try {
                 window.showMap(routeData.route_points);
            } catch (retryMapError) {
                 console.error("Error during map retry attempt:", retryMapError);
                 showMapErrorOverlay(`Ошибка при повторной попытке построения маршрута: ${retryMapError.message || 'Неизвестная ошибка'}`);
            }
        });
    } else {
         console.warn("Map retry button (#map-retry-button) not found.");
    }
}
// --- КОНЕЦ ОБРАБОТЧИКА --- 