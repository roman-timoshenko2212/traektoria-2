import sys
import zipfile
import tempfile
import os
import shutil
import pandas as pd

# --- Утилита для исправления регистра sharedStrings.xml ---
def fix_xlsx_casing(original_path):
    """Создает временную копию XLSX, если sharedStrings.xml имеет неправильный регистр.
    Возвращает путь к исправленной копии или исходный путь. None при ошибке.
    """
    expected = 'xl/sharedStrings.xml'
    incorrect_candidate = 'xl/SharedStrings.xml'
    fixed_path = original_path
    
    try:
        with zipfile.ZipFile(original_path, 'r') as zin:
            archive_files = zin.namelist()
            if expected in archive_files:
                return original_path # Исправление не нужно
            
            if incorrect_candidate not in archive_files:
                 print(f"ERROR: Не найден {expected} или {incorrect_candidate} в {original_path}.")
                 return None
            
            # --- Исправление требуется ---
            print(f"INFO: Исправление регистра {incorrect_candidate}...")
            temp_fd, fixed_path = tempfile.mkstemp(suffix='.xlsx')
            os.close(temp_fd)

            with zipfile.ZipFile(fixed_path, 'w', zipfile.ZIP_DEFLATED) as zout:
                for item in zin.infolist():
                    buffer = zin.read(item.filename)
                    # Переименовываем при копировании
                    target_name = expected if item.filename == incorrect_candidate else item.filename
                    # Создаем ZipInfo с правильным именем/исходными атрибутами
                    target_info = zipfile.ZipInfo(target_name, date_time=item.date_time)
                    target_info.compress_type = item.compress_type
                    target_info.external_attr = item.external_attr 
                    target_info.internal_attr = item.internal_attr
                    zout.writestr(target_info, buffer)
            print(f"INFO: Создан временный файл {fixed_path}")
            return fixed_path

    except zipfile.BadZipFile:
        print(f"ERROR: Недопустимый ZIP/XLSX файл: {original_path}")
    except Exception as e:
        print(f"ERROR: Ошибка обработки {original_path}: {e}")
        # Удаляем временный файл при ошибке
        if fixed_path != original_path and os.path.exists(fixed_path):
             # Исправляем синтаксис try/except
             try: 
                 os.remove(fixed_path)
             except Exception: # Ловим любое исключение при удалении
                 pass
    return None # В случае любой ошибки

# --- Основная логика --- 
default_wsl_path = "/mnt/c/Users/Пользователь/Desktop/ртк/2025/Журналы доставки/Маршруты 15.04.2025.xlsx"
original_file_path = sys.argv[1] if len(sys.argv) > 1 else default_wsl_path

print(f"Используемый файл: {original_file_path}")

if not os.path.exists(original_file_path):
    print(f"ОШИБКА: Файл не найден. Укажите путь как аргумент:")
    print(f"python3 {os.path.basename(__file__)} \"/путь/к/файлу.xlsx\"")
    sys.exit(1)

# --- Исправление и чтение --- 
print("\n--- Исправление файла (при необходимости) ---")
path_to_read = fix_xlsx_casing(original_file_path)
temp_file_to_delete = path_to_read if path_to_read != original_file_path else None
df = None

try:
    if path_to_read:
        print(f"\n--- Чтение файла: {path_to_read} ---")
        # Оставляем только openpyxl
        engine_to_use = 'openpyxl'
        print(f"Пробуем движок: '{engine_to_use}'...")
        try:
            df = pd.read_excel(path_to_read, engine=engine_to_use)
            print(f"✅ УСПЕХ с '{engine_to_use}'!")
        except ImportError: # Ошибка импорта для openpyxl
             print(f"   ❌ Движок '{engine_to_use}' недоступен (ImportError). Установите: pip install openpyxl")
        except Exception as e: # Другие ошибки чтения
             print(f"   ❌ Ошибка с '{engine_to_use}': {type(e).__name__} - {e}")
        
        if df is not None:
            print(f"\nРезультат ({len(df)} строк):")
            try:
                print(df.head().to_markdown(index=False))
            except ImportError:
                print(df.head())
        else:
            print("\n❌ Не удалось прочитать файл ни одним из движков.")
    else:
         print("❌ Не удалось обработать/исправить файл. Чтение невозможно.")

# --- Очистка --- 
finally:
    if temp_file_to_delete:
        print(f"\n--- Удаление временного файла: {temp_file_to_delete} ---")
        try:
            os.remove(temp_file_to_delete)
            print("Временный файл удален.")
        except OSError as e:
            print(f"WARNING: Не удалось удалить временный файл: {e}")

print("\n--- Тест завершен ---") 