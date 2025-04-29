document.addEventListener('DOMContentLoaded', () => {
    const panels = document.querySelectorAll('.step-panel');
    const prevBtn = document.getElementById('prev-step-btn');
    const nextBtn = document.getElementById('next-step-btn');
    const totalSteps = panels.length;
    let currentStep = 1;

    function updateStepDisplay() {
        console.log(`Updating display for step: ${currentStep}`);
        panels.forEach(panel => {
            const stepNum = parseInt(panel.dataset.step);
            panel.classList.remove('active', 'completed', 'upcoming');

            if (stepNum < currentStep) {
                panel.classList.add('completed');
                // Обновляем иконку для завершенных
                const icon = panel.querySelector('.step-panel-icon');
                if (icon) icon.textContent = '✓';
                const status = panel.querySelector('.step-panel-status');
            } else if (stepNum === currentStep) {
                panel.classList.add('active');
                 // Возвращаем номер для активного/будущего
                const icon = panel.querySelector('.step-panel-icon');
                if (icon) icon.textContent = stepNum;
                const status = panel.querySelector('.step-panel-status');
                if (status) status.textContent = ''; // Очищаем статус у активного
            } else {
                panel.classList.add('upcoming');
                 // Возвращаем номер для активного/будущего
                const icon = panel.querySelector('.step-panel-icon');
                if (icon) icon.textContent = stepNum;
                 const status = panel.querySelector('.step-panel-status');
                if (status) status.textContent = ''; // Очищаем статус у будущего
            }
        });

        // Обновляем состояние кнопок
        prevBtn.disabled = currentStep === 1;
        nextBtn.disabled = currentStep === totalSteps;
    }

    prevBtn.addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            updateStepDisplay();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentStep < totalSteps) {
            currentStep++;
            updateStepDisplay();
        }
    });

    // Инициализация отображения при загрузке
    // Найдем активный шаг из HTML и установим currentStep
    const activePanel = document.querySelector('.step-panel.active');
    if (activePanel) {
        currentStep = parseInt(activePanel.dataset.step);
    } else {
        currentStep = 1; // По умолчанию первый шаг
    }
    updateStepDisplay(); 
}); 