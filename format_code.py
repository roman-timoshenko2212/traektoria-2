#!/usr/bin/env python3
"""
Скрипт для автоматического форматирования и проверки кода проекта по стандартам PEP8.
"""
import os
import argparse
import subprocess

def format_python_file(file_path, check_only=False):
    """Форматирует один Python файл с помощью black и isort."""
    print(f"Обработка файла: {file_path}")
    
    # Проверяем, существует ли файл
    if not os.path.exists(file_path):
        print(f"❌ Файл не существует: {file_path}")
        return False
    
    # Команды для форматирования
    black_args = ["black", "--line-length", "100", file_path]
    isort_args = ["isort", file_path]
    
    if check_only:
        black_args.append("--check")
        isort_args.append("--check")
    
    # Запускаем black
    try:
        result = subprocess.run(black_args, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"⚠️ Black обнаружил проблемы: {result.stderr}")
            formatted = False
        else:
            formatted = True
    except Exception as e:
        print(f"❌ Ошибка при запуске black: {e}")
        return False
    
    # Запускаем isort
    try:
        result = subprocess.run(isort_args, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"⚠️ Isort обнаружил проблемы: {result.stderr}")
            formatted = False
    except Exception as e:
        print(f"❌ Ошибка при запуске isort: {e}")
        return False
    
    if check_only and formatted:
        print(f"✅ Файл {file_path} соответствует стандартам!")
    elif not check_only:
        print(f"✅ Файл {file_path} отформатирован!")
    
    return formatted

def format_directory(directory, check_only=False, exclude=None):
    """Рекурсивно форматирует все Python файлы в указанной директории."""
    exclude = exclude or []
    all_formatted = True
    
    for root, dirs, files in os.walk(directory):
        # Пропускаем исключенные директории
        dirs[:] = [d for d in dirs if os.path.join(root, d) not in exclude]
        
        for file in files:
            if file.endswith(".py"):
                file_path = os.path.join(root, file)
                if not format_python_file(file_path, check_only):
                    all_formatted = False
    
    return all_formatted

def main():
    parser = argparse.ArgumentParser(description="Форматирование Python-кода с помощью black и isort")
    parser.add_argument("path", nargs="?", default=".", help="Путь к файлу или директории для форматирования")
    parser.add_argument("--check", action="store_true", help="Только проверка, без форматирования")
    parser.add_argument("--exclude", nargs="*", default=[], help="Список директорий для исключения")
    
    args = parser.parse_args()
    
    # Проверяем установлены ли black и isort
    try:
        subprocess.run(["black", "--version"], capture_output=True)
        subprocess.run(["isort", "--version"], capture_output=True)
    except FileNotFoundError:
        print("❌ Необходимо установить black и isort:")
        print("pip install black isort")
        return 1
    
    # Определяем абсолютные пути для исключений
    exclude = [os.path.abspath(path) for path in args.exclude]
    
    path = os.path.abspath(args.path)
    
    # Форматируем файл или директорию
    if os.path.isfile(path):
        success = format_python_file(path, args.check)
    else:
        success = format_directory(path, args.check, exclude)
    
    if args.check:
        if success:
            print("✅ Все файлы соответствуют стандартам форматирования!")
            return 0
        else:
            print("❌ Некоторые файлы не соответствуют стандартам форматирования!")
            return 1
    else:
        print("✅ Форматирование завершено!")
        return 0

if __name__ == "__main__":
    exit(main()) 