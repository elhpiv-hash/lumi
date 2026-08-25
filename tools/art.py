"""
Иконка и обложка для карточки Яндекс Игр.

Рисуем в низком разрешении и растягиваем без сглаживания — тем же приёмом,
что и сама игра. Поэтому пиксель на обложке совпадает по духу с пикселем
в игре, а не выглядит нарисованным отдельно.

Палитра взята из биома «сумерки» и скина «Огонёк», чтобы карточка совпадала
с первым, что игрок увидит на экране.

Запуск из папки lumi:  python tools/art.py
"""
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent.parent

SKY_TOP = (44, 32, 92)
SKY_BOTTOM = (120, 76, 156)
BOKEH = (255, 240, 200)
VINE = (62, 155, 110)
VINE_LIGHT = (96, 190, 130)
VINE_CAP = (138, 205, 110)
VINE_OUTLINE = (26, 70, 50)
BERRY = (255, 214, 110)
BODY = (255, 218, 71)
BELLY = (255, 214, 133)
OUTLINE = (106, 58, 27)
EYE = (255, 255, 255)
PUPIL = (73, 40, 18)
WING = (196, 240, 250)
COIN = (255, 210, 61)
COIN_LIGHT = (255, 243, 163)
COIN_OUTLINE = (130, 77, 23)


def sky(draw, width, height):
    for y in range(height):
        t = y / max(1, height - 1)
        draw.line(
            [(0, y), (width, y)],
            fill=tuple(round(SKY_TOP[i] + (SKY_BOTTOM[i] - SKY_TOP[i]) * t) for i in range(3)),
        )


def blob(draw, cx, cy, rx, ry, fill):
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill)


def glow(image, cx, cy, radius, color, strength=0.6):
    """
    Свет складывается, а не смешивается: полупрозрачный жёлтый поверх фиолетового
    даёт грязное серое пятно, а прибавка к каналам — настоящее свечение.
    Спад квадратичный, поэтому у ореола нет видимой границы.
    """
    pixels = image.load()
    width, height = image.size
    reach = int(radius * 2.8)
    for y in range(max(0, int(cy - reach)), min(height, int(cy + reach) + 1)):
        for x in range(max(0, int(cx - reach)), min(width, int(cx + reach) + 1)):
            distance = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if distance > reach:
                continue
            k = (1 - distance / reach) ** 2 * strength
            base = pixels[x, y]
            pixels[x, y] = (
                min(255, int(base[0] + color[0] * k)),
                min(255, int(base[1] + color[1] * k)),
                min(255, int(base[2] + color[2] * k)),
                255,
            )


def firefly(draw, cx, cy, radius, wings=True):
    if wings:
        # Пропорции те же, что в игре: крылья сидят у верхних боков и заметно
        # шире, чем выше. Выше — и это уже заячьи уши.
        for side in (-1, 1):
            blob(draw, cx + side * radius * 0.85, cy - radius * 0.62,
                 radius * 0.46, radius * 0.42, WING)

    blob(draw, cx, cy, radius + 1, radius + 1, OUTLINE)
    blob(draw, cx, cy, radius, radius, BODY)
    blob(draw, cx, cy + radius * 0.42, radius * 0.5, radius * 0.4, BELLY)

    eye_x = radius * 0.33
    eye_y = -radius * 0.14
    eye_r = radius * 0.31
    for side in (-1, 1):
        blob(draw, cx + side * eye_x, cy + eye_y, eye_r, eye_r, EYE)
        blob(draw, cx + side * eye_x, cy + eye_y + radius * 0.06, radius * 0.155, radius * 0.155, PUPIL)

    # улыбка пикселями: пять точек дугой
    unit = max(1, round(radius / 8))
    mouth_y = cy + radius * 0.34
    for dx, dy in ((-2, -1), (-1, 0), (0, 0), (1, 0), (2, -1)):
        draw.rectangle(
            [cx + dx * unit, mouth_y + dy * unit, cx + dx * unit + unit - 1, mouth_y + dy * unit + unit - 1],
            fill=PUPIL,
        )


def coin(draw, cx, cy, radius):
    blob(draw, cx, cy, radius + 1, radius + 1, COIN_OUTLINE)
    blob(draw, cx, cy, radius, radius, COIN)
    blob(draw, cx, cy - radius * 0.25, radius * 0.45, radius * 0.35, COIN_LIGHT)


def vine(draw, x, width, top, bottom, cap_on_top):
    """Лиана с тёмной обводкой, светлой гранью, шляпкой и ягодами."""
    draw.rectangle([x - 1, top - 1, x + width, bottom], fill=VINE_OUTLINE)
    draw.rectangle([x, top, x + width - 1, bottom - 1], fill=VINE)
    draw.rectangle([x + 2, top + 2, x + 3, bottom - 3], fill=VINE_LIGHT)

    cap_h = max(3, width // 3)
    cap_y = top if cap_on_top else bottom - cap_h
    draw.rectangle([x - 3, cap_y - 1, x + width + 2, cap_y + cap_h], fill=VINE_OUTLINE)
    draw.rectangle([x - 2, cap_y, x + width + 1, cap_y + cap_h - 1], fill=VINE_CAP)
    for i in range(3):
        bx = x + 1 + i * (width // 3)
        draw.rectangle([bx, cap_y + 1, bx + 1, cap_y + 2], fill=BERRY)


def make_icon(size=64, scale=8):
    """Иконка: одна крупная мордочка. В каталоге она видна размером с ноготь,
    поэтому никаких сцен и мелочей — только персонаж и свечение."""
    image = Image.new('RGBA', (size, size))
    draw = ImageDraw.Draw(image)
    sky(draw, size, size)

    for x, y, r in ((8, 12, 1), (54, 18, 1), (14, 52, 1), (50, 48, 2), (32, 8, 1)):
        blob(draw, x, y, r, r, BOKEH)

    glow(image, size / 2, size * 0.47, size * 0.24, BODY)
    draw = ImageDraw.Draw(image)
    firefly(draw, size / 2, size * 0.47, size * 0.24)
    coin(draw, size * 0.82, size * 0.84, size * 0.075)

    return image.convert('RGB').resize((size * scale, size * scale), Image.NEAREST)


def make_cover(width=160, height=94, scale=5):
    """Обложка: кадр из игры. Светлячок в проходе, монета на пути, лианы по краям."""
    image = Image.new('RGBA', (width, height))
    draw = ImageDraw.Draw(image)
    sky(draw, width, height)

    for x, y, r in ((18, 14, 2), (46, 26, 1), (92, 12, 2), (128, 30, 1),
                    (150, 60, 2), (30, 70, 1), (70, 82, 2), (112, 66, 1)):
        blob(draw, x, y, r, r, BOKEH)

    # две пары лиан: слева поуже проход, справа пошире — видно, что мир движется
    vine(draw, 26, 16, -4, 30, cap_on_top=False)
    vine(draw, 26, 16, 62, height + 4, cap_on_top=True)
    vine(draw, 118, 16, -4, 44, cap_on_top=False)
    vine(draw, 118, 16, 74, height + 4, cap_on_top=True)

    coin(draw, 96, 24, 5)
    coin(draw, 100, 70, 4)

    # шлейф из искр за героем
    for i, (dx, dy, r) in enumerate(((14, 3, 2), (22, 6, 2), (30, 8, 1), (38, 11, 1))):
        blob(draw, 62 - dx, 46 + dy, r, r, BODY)

    glow(image, 66, 46, 11, BODY)
    draw = ImageDraw.Draw(image)
    firefly(draw, 66, 46, 11)

    return image.convert('RGB').resize((width * scale, height * scale), Image.NEAREST)


def main():
    icon = make_icon()
    cover = make_cover()

    icon_path = OUT / 'lumi-icon-512.png'
    cover_path = OUT / 'lumi-cover-800x470.png'
    icon.save(icon_path)
    cover.save(cover_path)

    for path, expected in ((icon_path, (512, 512)), (cover_path, (800, 470))):
        actual = Image.open(path).size
        status = 'ок' if actual == expected else f'ОЖИДАЛОСЬ {expected}'
        print(f'{path.name}: {actual[0]}x{actual[1]} {status}, {path.stat().st_size} байт')


if __name__ == '__main__':
    main()
