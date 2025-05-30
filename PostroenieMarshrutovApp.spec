# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['frontend/main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('frontend/templates', 'frontend/templates'),
        ('frontend/static', 'frontend/static')
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=True,
    optimize=0,
)

# --- ИЗМЕНЕНО: Фильтруем .so файлы из binaries И datas ---
filtered_binaries = []
for name, path, typecode in a.binaries:
    if '.so.' not in name and not name.endswith('.so'): # Оставляем, если НЕ .so файл
        filtered_binaries.append((name, path, typecode))
a.binaries = filtered_binaries

filtered_datas = []
# Элементы в a.datas могут быть кортежами с разным количеством элементов,
# но первый элемент всегда имя целевого файла.
for item in a.datas:
    dest_name = item[0]  # Первый элемент - имя целевого файла
    if '.so.' not in dest_name and not dest_name.endswith('.so'): # Оставляем, если НЕ .so файл
        filtered_datas.append(item) # Добавляем исходный элемент целиком
a.datas = filtered_datas
# --- КОНЕЦ ИЗМЕНЕННОГО БЛОКА ---

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    # [('v', None, 'OPTION')], # Эта строка выглядит подозрительно, возможно, ее стоит убрать если возникнут проблемы
    exclude_binaries=True,
    name='PostroenieMarshrutovApp',
    debug=True,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries, # Теперь здесь будут отфильтрованные бинарники
    a.datas,    # Теперь здесь будут отфильтрованные данные
    strip=False,
    upx=False,
    upx_exclude=[],
    name='PostroenieMarshrutovApp',
)
