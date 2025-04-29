#!/usr/bin/env python3
"""
Скрипт для автоматической организации файлов проекта по новой структуре.
"""
import os
import shutil
import re
import argparse
from utils import sanitize_filename

def move_files_by_pattern(pattern, source_dir, target_dir, dry_run=False, verbose=False):
    """Перемещает файлы, соответствующие паттерну, из исходной директории в целевую."""
    if not os.path.exists(target_dir):
        if not dry_run:
            os.makedirs(target_dir, exist_ok=True)
        if verbose:
            print(f"✅ Создана директория {target_dir}")
    
    moved_files = []
    
    # Находим все файлы в исходной директории, соответствующие паттерну
    for file_name in os.listdir(source_dir):
        if re.match(pattern, file_name):
            source_path = os.path.join(source_dir, file_name)
            target_path = os.path.join(target_dir, file_name)
            
            if not os.path.isfile(source_path):
                continue
                
            # Проверяем, существует ли уже файл с таким именем в целевой директории
            if os.path.exists(target_path):
                if verbose:
                    print(f"⚠️ Файл {file_name} уже существует в {target_dir}")
                continue
            
            if not dry_run:
                shutil.move(source_path, target_path)
            
            moved_files.append((source_path, target_path))
            
            if verbose:
                print(f"✅ Перемещен файл {source_path} в {target_path}")
    
    return moved_files

def organize_files(dry_run=False, verbose=False):
    """Основная функция для организации файлов проекта."""
    # Определяем директории для разных типов файлов
    root_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(root_dir, "data")
    geocoded_dir = os.path.join(data_dir, "geocoded_results")
    parsed_dir = os.path.join(data_dir, "parsed_addresses")
    route_results_dir = os.path.join(data_dir, "route_results")
    distance_matrix_dir = os.path.join(data_dir, "distance_matrix")
    
    # Создаем директории, если они не существуют
    for directory in [data_dir, geocoded_dir, parsed_dir, route_results_dir, distance_matrix_dir]:
        if not os.path.exists(directory) and not dry_run:
            os.makedirs(directory, exist_ok=True)
            if verbose:
                print(f"✅ Создана директория {directory}")
    
    # Перемещаем файлы по типам
    # 1. Геокодированные результаты
    moved = move_files_by_pattern(r"geocoded_results.*\.csv", root_dir, geocoded_dir, dry_run, verbose)
    if verbose:
        print(f"📊 Перемещено {len(moved)} файлов с геокодированными результатами")
    
    # 2. Разобранные адреса
    moved = move_files_by_pattern(r"parsed_addresses.*\.csv", root_dir, parsed_dir, dry_run, verbose)
    if verbose:
        print(f"📊 Перемещено {len(moved)} файлов с разобранными адресами")
    
    # 3. Результаты маршрутов
    moved = move_files_by_pattern(r"route_results.*\.json", root_dir, route_results_dir, dry_run, verbose)
    if verbose:
        print(f"📊 Перемещено {len(moved)} файлов с результатами маршрутов")
    
    # 4. Матрицы расстояний
    moved = move_files_by_pattern(r"distance_matrix.*\.(csv|json)", root_dir, distance_matrix_dir, dry_run, verbose)
    if verbose:
        print(f"📊 Перемещено {len(moved)} файлов с матрицами расстояний")
    
    # 5. Кэш расстояний
    if os.path.exists(os.path.join(root_dir, "distance_cache.json")) and not dry_run:
        shutil.move(
            os.path.join(root_dir, "distance_cache.json"),
            os.path.join(data_dir, "distance_cache.json")
        )
        if verbose:
            print(f"✅ Перемещен файл кэша расстояний")

def check_duplicate_files(verbose=False):
    """Проверяет наличие дублирующихся файлов результатов и предлагает правильные имена."""
    # Функция для нормализации имен файлов
    def normalize_name(filename):
        # Получаем часть имени после префикса (route_results_, geocoded_results_ и т.д.)
        name_parts = filename.split('_', 2)
        if len(name_parts) < 3:
            return filename
        
        # Берем часть имени после префикса и до расширения
        name_part = name_parts[2]
        if '.' in name_part:
            name_part = name_part.rsplit('.', 1)[0]
        
        # Нормализуем - заменяем множественные подчеркивания и удаляем запятые
        normalized = re.sub(r'_+', '_', name_part)
        normalized = normalized.replace(',', '')
        return normalized
    
    # Находим все файлы результатов в корневой директории
    root_dir = os.path.dirname(os.path.abspath(__file__))
    pattern = r'(route_results|geocoded_results|parsed_addresses|distance_matrix).*\.(json|csv)'
    
    # Группируем файлы по нормализованным именам
    duplicates = {}
    
    for filename in os.listdir(root_dir):
        if re.match(pattern, filename):
            normalized_name = normalize_name(filename)
            if normalized_name not in duplicates:
                duplicates[normalized_name] = []
            duplicates[normalized_name].append(filename)
    
    # Выводим информацию о дубликатах
    has_duplicates = False
    for name, files in duplicates.items():
        if len(files) > 1:
            has_duplicates = True
            if verbose:
                print(f"\n📂 Найдены дубликаты для {name}:")
                for i, file in enumerate(files):
                    print(f"  {i+1}. {file}")
                
                # Определяем корректное имя файла
                prefix = files[0].split('_', 2)[0] + '_' + files[0].split('_', 2)[1]
                extension = files[0].split('.')[-1]
                correct_name = f"{prefix}_{sanitize_filename(name)}.{extension}"
                
                print(f"✅ Рекомендуемое имя: {correct_name}")
    
    if not has_duplicates and verbose:
        print("✅ Дубликатов файлов не найдено!")
    
    return has_duplicates

def main():
    parser = argparse.ArgumentParser(description="Организация файлов проекта по новой структуре")
    parser.add_argument("--dry-run", action="store_true", help="Только показать, какие файлы будут перемещены, без фактического перемещения")
    parser.add_argument("--check-duplicates", action="store_true", help="Проверить наличие дублирующихся файлов и предложить правильные имена")
    parser.add_argument("--verbose", action="store_true", help="Показать подробную информацию о перемещении файлов")
    
    args = parser.parse_args()
    
    if args.check_duplicates:
        check_duplicate_files(verbose=True)
    else:
        organize_files(dry_run=args.dry_run, verbose=args.verbose)
        
        if not args.dry_run:
            print("\n✅ Файлы проекта успешно организованы!")
        else:
            print("\n📝 Это был пробный запуск. Используйте команду без --dry-run для фактического перемещения файлов.")

if __name__ == "__main__":
    main() 