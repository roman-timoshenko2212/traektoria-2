// @ts-check

import eslint from '@eslint/js';
import globals from 'globals';

export default [
  eslint.configs.recommended, // Используем рекомендуемые правила ESLint
  {
    languageOptions: {
      ecmaVersion: 'latest', // Поддержка последнего стандарта ECMAScript
      sourceType: 'module', // Указываем, что код использует модули (import/export)
      globals: {
        ...globals.browser, // Добавляем глобальные переменные браузера (document, window, fetch и т.д.)
        ...globals.jquery, // Добавляем глобальные переменные jQuery ($)
        L: 'readonly', // Добавляем глобальную переменную Leaflet (L)
        bodymovin: 'readonly' // Добавляем глобальную переменную Lottie (bodymovin)
      }
    },
    rules: {
      // Здесь можно добавить/переопределить правила ESLint по необходимости
      'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }], // Предупреждать о неиспользуемых переменных (кроме тех, что начинаются с _)
      'no-console': 'off', // Разрешаем использовать console.log
      // Добавь другие правила при необходимости
    }
  }
]; 