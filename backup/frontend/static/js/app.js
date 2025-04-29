document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

let map = null;
let markers = [];
let polyline = null;
let routingControl = null;
let allRoutes = {};
let currentRouteData = null;
let routeData = null;
let route_name = null;
let corrections_step = 1;
let globalServiceTimeMinutes = 0;

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
  setupUploader();
  setupStepNavigation();
  setupSummaryModal();
  initMapContainer(true);
}

function setupUploader() {
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');
  const serviceTimeInput = document.getElementById('service-time-input');

  uploadArea.addEventListener('click', () => {
    fileInput.click();
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
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
      console.log('Value from serviceTimeInput on drop:', serviceTimeInput.value);
      uploadFile(file, serviceTimeInput.value);
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) {
      console.log('Value from serviceTimeInput on change:', serviceTimeInput.value);
      uploadFile(file, serviceTimeInput.value);
    }
  });

}

async function uploadFile(file, serviceTime) {
  console.log('uploadFile called with serviceTime:', serviceTime, typeof serviceTime);

  showLoading('Загрузка и обработка файла...');
  hideError();
  
  const formData = new FormData();
  formData.append('file', file);
  
  const timeToAppend = serviceTime || '0';
  console.log('Value being appended to FormData:', timeToAppend);
  formData.append('service_time_per_stop_minutes', timeToAppend);
  
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
      
      if (!data || typeof data !== 'object') {
        throw new Error('Неверный формат данных от сервера');
      }
    } catch (jsonError) {
      throw new Error(`Ошибка разбора ответа сервера: ${jsonError.message}`);
    }
    
    hideLoading();
    updateUploadStep(file.name);
    const routes = data.routes || [];
    await updateRouteSelector(routes);

    if (data.status === 'needs_correction') {
      console.log("Получен статус needs_correction");
      const exceptions = data.exceptions || [];
      if (exceptions.length > 0) {
        showExceptions(exceptions);
        goToStep(2);
      } else {
        console.warn("Статус needs_correction, но список exceptions пуст. Переход к шагу 3.");
        goToStep(3);
        if (routes.length > 0) {
          await loadRouteData(routes[0]);
        } else {
          showRouteError("Маршруты не найдены.");
          document.getElementById('route-selector').classList.add('hidden');
          document.getElementById('route-info').classList.add('hidden');
          document.getElementById('results-container').classList.add('hidden');
          document.getElementById('map-container').classList.add('hidden');
        }
      }
    } else if (data.status === 'processed') {
      console.log("Получен статус processed");
      goToStep(3);
      if (routes.length > 0) {
        await loadRouteData(routes[0]);
      } else {
        showRouteError("Маршруты успешно обработаны, но не найдено данных для отображения.");
        document.getElementById('route-selector').classList.add('hidden');
        document.getElementById('route-info').classList.add('hidden');
        document.getElementById('results-container').classList.add('hidden');
        document.getElementById('map-container').classList.add('hidden');
      }
    } else {
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

      if (routes.length > 0) {
        console.log('Загружаем данные для маршрута:', routes[0]);
        await loadRouteData(routes[0]);
      } else {
        console.log('Нет маршрутов для загрузки после исправлений.');
        showRouteError("Нет доступных маршрутов после исправлений.");
        document.getElementById('route-selector').classList.add('hidden');
        document.getElementById('route-info').classList.add('hidden');
        document.getElementById('results-container').classList.add('hidden');
        document.getElementById('map-container').classList.add('hidden');
      }
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

function initMapContainer(preInit = false) {
  console.log("Инициализация контейнера карты, preInit =", preInit);
  
  if (!document.getElementById('map')) {
    console.log("Создаем элемент map");
    const mapContainer = document.createElement('div');
    mapContainer.id = 'map';
    mapContainer.className = 'map-container';
    mapContainer.style.height = '500px';  // Явно задаем высоту карты
    mapContainer.style.width = '100%';    // И ширину
    
    const resultsContainer = document.getElementById('map-container');
    if (resultsContainer) {
      console.log("Добавляем элемент map в контейнер");
      resultsContainer.appendChild(mapContainer);
      
      if (preInit && !map) {
        console.log("Предварительная инициализация карты");
        try {
          map = L.map('map', {
            center: [55.7558, 37.6173],
            zoom: 5,
            zoomControl: true,
            attributionControl: true
          });
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
            updateWhenIdle: true,
            updateWhenZooming: false,
            updateInterval: 500
          }).addTo(map);
          
          document.getElementById('map-container').classList.add('hidden');
          console.log("Карта успешно создана");
        } catch (e) {
          console.error("Ошибка при создании карты:", e);
        }
      }
    } else {
      console.error("Не найден контейнер map-container");
    }
  } else {
    console.log("Элемент map уже существует");
  }
}

function showMap(points) {
  console.log("Вызвана функция showMap с точками:", points);
  if (!points || points.length === 0) {
    console.error("Нет точек для отображения на карте");
    return;
  }
  
  // Проверяем, существует ли div для карты
  if (!document.getElementById('map')) {
    console.log("Элемент карты не существует, создаем его");
    initMapContainer();
  }
  
  if (!map) {
    console.log("Инициализация карты");
    map = L.map('map', {
      zoomControl: true,
      attributionControl: true
    });
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);
  } else {
    console.log("Карта уже инициализирована, очищаем маркеры");
  }
  
  clearMapMarkers();
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
  
  const waypoints = points.map(point => L.latLng(point.lat, point.lon));
  console.log("Созданы waypoints для карты:", waypoints.length);
  
  const markerGroup = L.featureGroup();
  
  if (typeof L.Routing !== 'undefined') {
    console.log("Используем L.Routing для маршрута");
    const routeWaypoints = waypoints.map(wp => L.Routing.waypoint(wp));
    
    routingControl = L.Routing.control({
      waypoints: routeWaypoints,
      routeWhileDragging: false,
      showAlternatives: false,
      fitSelectedRoutes: false,
      show: false,
      lineOptions: {
        styles: [{ color: '#4a6bef', opacity: 0.8, weight: 5 }]
      },
      createMarker: function(i, wp) {
        // Создаем маркеры для начальной и конечной точек
        if (i === 0) {
          return createMarker(wp.latLng, 'start');
        } else if (i === routeWaypoints.length - 1) {
          return createMarker(wp.latLng, 'end');
        }
        return createMarker(wp.latLng, 'waypoint', i);
      },
      addWaypoints: false,
      draggableWaypoints: false,
      useZoomParameter: false
    }).addTo(map);
  } else {
    console.log("L.Routing не определен, используем стандартный polyline");
    if (polyline) {
      map.removeLayer(polyline);
      polyline = null;
    }
    
    polyline = L.polyline(waypoints, {
      color: '#4a6bef',
      weight: 5,
      opacity: 0.8,
      lineJoin: 'round'
    }).addTo(map);
    
    // Добавляем маркеры отдельно, так как не используем L.Routing
    console.log("Создаем маркеры");
    const startMarker = createMarker(waypoints[0], 'start');
    const endMarker = createMarker(waypoints[waypoints.length - 1], 'end');
    markerGroup.addLayer(startMarker);
    markerGroup.addLayer(endMarker);
    markers.push(startMarker, endMarker);
    
    waypoints.slice(1, waypoints.length - 1).forEach((waypoint, index) => {
      const marker = createMarker(waypoint, 'waypoint', index + 1);
      markerGroup.addLayer(marker);
      markers.push(marker);
    });
    
    markerGroup.addTo(map);
  }
  
  console.log("Настраиваем границы карты");
  
  // Используем все маркеры для фитирования карты
  if (markers.length > 0) {
    const markersGroup = L.featureGroup(markers);
    map.fitBounds(markersGroup.getBounds(), { 
      padding: [50, 50],
      maxZoom: 14
    });
  } else {
    // Если нет маркеров, используем все точки маршрута
    map.fitBounds(L.latLngBounds(waypoints), { 
      padding: [50, 50],
      maxZoom: 14
    });
  }
  
  document.getElementById('map-container').classList.remove('hidden');
  
  setTimeout(() => {
    console.log("Обновляем размер карты");
    map.invalidateSize();
  }, 100);
}

function createMarker(latlng, type, index) {
  let html, iconSize, iconAnchor;
  
  if (type === 'start') {
    html = `<div style="display: flex; align-items: center; justify-content: center; background-color: #e74c3c; color: white; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; font-weight: bold; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">A</div>`;
    iconSize = [32, 32];
    iconAnchor = [16, 16];
  } else if (type === 'end') {
    html = `<div style="display: flex; align-items: center; justify-content: center; background-color: #2ecc71; color: white; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; font-weight: bold; font-size: 16px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">B</div>`;
    iconSize = [32, 32];
    iconAnchor = [16, 16];
  } else {
    html = `<div style="display: flex; align-items: center; justify-content: center; background-color: #3498db; color: white; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; font-weight: bold; font-size: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">${index}</div>`;
    iconSize = [24, 24];
    iconAnchor = [12, 12];
  }
  
  const icon = L.divIcon({
    html: html,
    className: 'custom-div-icon',
    iconSize: iconSize,
    iconAnchor: iconAnchor
  });
  
  return L.marker(latlng, { 
    icon: icon,
    zIndexOffset: type === 'start' || type === 'end' ? 1000 : 500
  }).addTo(map);
}

function clearMapMarkers() {
  markers.forEach(marker => {
    if (map) map.removeLayer(marker);
  });
  markers = [];
  
  if (polyline && map) {
    map.removeLayer(polyline);
    polyline = null;
  }
}

function updateUploadStep(filename) {
  const fileNameElement = document.getElementById('uploaded-filename');
  if (fileNameElement) {
    fileNameElement.textContent = filename;
    document.getElementById('upload-success').classList.remove('hidden');
  }
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
      "Кол-во точек"
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

    const stopsCell = document.createElement('td');
    stopsCell.textContent = item.number_of_stops !== null && item.number_of_stops !== undefined ? item.number_of_stops : 'Н/Д';
    row.appendChild(stopsCell);

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

    const dataToSend = {
        route_name: routeName,
        report_distance: distanceInput?.value?.trim() || null,
        report_duration_hours: hoursInput?.value?.trim() || null,
        report_duration_minutes: minutesInput?.value?.trim() || null,
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

  document.getElementById('distance-value').textContent = '-';
  document.getElementById('duration-value').textContent = '-';
  document.getElementById('total-route-time-value').textContent = '-';
  document.getElementById('geocoder-table').innerHTML = '<tr><td colspan="6">Загрузка...</td></tr>';
  clearMapMarkers();

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
    console.log("Rendering route data:", data);

    if (data.error) {
      throw new Error(data.message || 'Неизвестная ошибка при получении данных маршрута');
    }

    currentRouteData = data;

    if (data.global_service_time_minutes !== undefined) {
      globalServiceTimeMinutes = parseInt(data.global_service_time_minutes) || 0;
      const serviceTimeInput = document.getElementById('service-time-input');
      if (serviceTimeInput) serviceTimeInput.value = globalServiceTimeMinutes;
      console.log(`Global service time set from route data response: ${globalServiceTimeMinutes} min`);
    }

    renderRouteData(data);

    document.getElementById('route-info').classList.remove('hidden');
    document.getElementById('results-container').classList.remove('hidden');
    document.getElementById('map-container').classList.remove('hidden');

  } catch (error) {
    console.error(`Ошибка загрузки данных для маршрута ${routeName}:`, error);
    showRouteError(`Не удалось загрузить данные: ${error.message}`);
    document.getElementById('route-info').classList.add('hidden');
    document.getElementById('results-container').classList.add('hidden');
    document.getElementById('map-container').classList.add('hidden');

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

function renderRouteData(routeData) {
  if (!routeData) {
    console.warn("renderRouteData вызван без данных.");
    return;
  }

  const distanceData = routeData.distance_data || {};
  document.getElementById('distance-value').textContent = distanceData.formatted_distance || 'Н/Д';
  document.getElementById('duration-value').textContent = distanceData.formatted_duration || 'Н/Д';
  document.getElementById('total-route-time-value').textContent = routeData.total_route_time_formatted || 'Н/Д';

  const routePoints = routeData.route_points || [];
  if (routePoints.length > 0) {
    const mapContainer = document.getElementById('map-container');
    const placeholder = mapContainer.querySelector('.map-placeholder');
    if(placeholder) placeholder.remove();
    showMap(routePoints);
  } else {
    clearMapMarkers(); 
    console.warn("Нет точек для отображения на карте для маршрута:", routeData.route_name);
    const mapContainer = document.getElementById('map-container');
    const oldPlaceholder = mapContainer.querySelector('.map-placeholder');
    if(oldPlaceholder) oldPlaceholder.remove();
    const placeholder = document.createElement('div');
    placeholder.className = 'map-placeholder';
    placeholder.textContent = 'Нет геокодированных точек для построения маршрута.';
    placeholder.style.padding = '20px';
    placeholder.style.textAlign = 'center';
    placeholder.style.color = '#666';
    mapContainer.appendChild(placeholder);
    if (!map) {
      initMapContainer();
    }
  }

  renderGeocodingResults(routeData.geocoder_output || []);
}

function showRouteError(message) {
  const resultsContainer = document.getElementById('results-container');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.style.color = 'var(--danger)';
  errorDiv.style.padding = '10px';
  errorDiv.style.border = '1px solid var(--danger)';
  errorDiv.style.borderRadius = 'var(--border-radius)';
  errorDiv.style.marginTop = '15px';
  errorDiv.textContent = message;
  
  const geocoderTable = document.getElementById('geocoder-table');
  if (geocoderTable) geocoderTable.innerHTML = '';
  if (resultsContainer) {
    const oldError = resultsContainer.querySelector('.error-message');
    if (oldError) oldError.remove();
    resultsContainer.prepend(errorDiv);
  }
  document.getElementById('route-info').classList.add('hidden');
  document.getElementById('map-container').classList.add('hidden');
}

function renderGeocodingResults(geocoderOutput) {
  const tableBody = document.getElementById('geocoder-table');
  const resultsContainer = document.getElementById('results-container');
  if (!tableBody || !resultsContainer) return;

  const oldError = resultsContainer.querySelector('.error-message');
  if (oldError) oldError.remove();

  tableBody.innerHTML = '';

  if (!Array.isArray(geocoderOutput) || geocoderOutput.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Нет данных геокодирования для отображения.</td></tr>';
    return;
  }

  let addressIndex = 1; // <-- Счетчик для порядкового номера адресов

  geocoderOutput.forEach((result, index) => {
    const row = document.createElement('tr');

    const numCell = document.createElement('td');
    const routeCell = document.createElement('td');
    const inputCell = document.createElement('td');
    const foundCell = document.createElement('td');
    const coordsCell = document.createElement('td');
    const statusCell = document.createElement('td'); // Ячейка для точности

    // Проверяем, является ли точка офисом (по типу или по excel_row)
    const isOffice = result.type === 'office' || result.excel_row === 'СТАРТ' || result.excel_row === 'ФИНИШ';
    
    if (isOffice) {
      // --- Настройка для строк Офиса --- 
      numCell.textContent = '-'; 
      if (result.excel_row === 'СТАРТ') {
          routeCell.textContent = 'СТАРТ 🏁';
      } else if (result.excel_row === 'ФИНИШ') {
          routeCell.textContent = 'ФИНИШ 🏁';
      } else {
          routeCell.textContent = 'Офис'; // Резервный вариант
      }
      inputCell.textContent = `🏢 ${result.input || 'Офис РТК'}`;
      foundCell.textContent = ''; // Найденный адрес пустой
      if (result.lat && result.lon) {
        coordsCell.textContent = `${parseFloat(result.lat).toFixed(6)}, ${parseFloat(result.lon).toFixed(6)}`;
      } else {
        coordsCell.textContent = '-';
      }
      statusCell.textContent = ''; // Точность пустая

    } else {
      // --- Настройка для обычных адресов --- 
      numCell.textContent = addressIndex;
      addressIndex++; // Увеличиваем счетчик только для обычных адресов
      
      routeCell.textContent = result.route_name || '-';
      inputCell.textContent = result.input || '-'; // Исходный адрес
      
      // "Найденный адрес" теперь берется из поля 'found' CSV
      foundCell.textContent = result.found || '-'; 

      if (result.lat && result.lon) {
        coordsCell.textContent = `${parseFloat(result.lat).toFixed(6)}, ${parseFloat(result.lon).toFixed(6)}`;
      } else {
        coordsCell.textContent = '-';
      }

      // "Точность" теперь берется из поля 'description' CSV
      statusCell.textContent = result.description || '-'; 
      
      // Комментарии про badge остаются, т.к. он не используется
      /*
      const badge = document.createElement('span');
      badge.classList.add('badge');
      if (result.error) {
        badge.classList.add('badge-danger');
        badge.textContent = 'Ошибка';
      } else if (result.found) {
        badge.classList.add('badge-success');
        badge.textContent = result.type ? result.type.charAt(0).toUpperCase() + result.type.slice(1) : 'Найдено'; 
      } else {
        badge.classList.add('badge-warning');
        badge.textContent = 'Не найдено';
      }
      statusCell.appendChild(badge); 
      */
    }

    row.appendChild(numCell);
    row.appendChild(routeCell);
    row.appendChild(inputCell);
    row.appendChild(foundCell);
    row.appendChild(coordsCell);
    row.appendChild(statusCell);

    tableBody.appendChild(row);
  });
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