# 1. Использовать официальный образ Python
FROM python:3.9-slim

# 2. Установить рабочую директорию
WORKDIR /app

# 3. Скопировать requirements.txt и установить зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Скопировать весь остальной код проекта
COPY . .

# 5. Указать команду для запуска Uvicorn
# Мы предполагаем, что экземпляр FastAPI в файле frontend/main.py называется "app"
# EXPOSE 8000 - можно добавить, если нужно явно указать порт, но Uvicorn сам его слушает
CMD ["uvicorn", "frontend.main:app", "--host", "0.0.0.0", "--port", "8000"] 