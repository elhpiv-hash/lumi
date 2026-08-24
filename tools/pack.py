"""
Сборка архива для Консоли разработчика Яндекс Игр.

В архив кладём только то, что нужно игре: index.html в корне и src. Всё
остальное — README, настройки git, исходники спрайтов — площадке не нужно
и только раздувает загрузку.

Запуск из папки lumi:  python tools/pack.py
"""
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT.parent / "lumi-yandex.zip"


def collect():
    files = [ROOT / "index.html"]
    files += sorted(ROOT.glob("src/**/*.js"))
    return files


def main():
    files = collect()
    missing = [f for f in files if not f.exists()]
    if missing:
        raise SystemExit(f"не найдено: {', '.join(str(f) for f in missing)}")

    if OUTPUT.exists():
        OUTPUT.unlink()

    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            archive.write(path, path.relative_to(ROOT).as_posix())

    size = OUTPUT.stat().st_size
    print(f"{OUTPUT}")
    print(f"файлов {len(files)}, {size} байт ({size / 1024:.1f} КБ)")

    with zipfile.ZipFile(OUTPUT) as archive:
        names = archive.namelist()
    if "index.html" not in names:
        raise SystemExit("index.html обязан лежать в корне архива")
    print("index.html в корне: да")


if __name__ == "__main__":
    main()
