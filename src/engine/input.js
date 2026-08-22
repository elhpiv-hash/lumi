/**
 * Ввод. Три источника — палец, пробел, мышь — сводятся к одной команде «взмах».
 *
 * Тонкость мобилок: после касания браузер досылает совместимостные события
 * мыши, и один тап превратился бы в два взмаха. Лечится preventDefault на
 * touchstart, а на случай браузеров, которые досылают их всё равно, стоит
 * второй заслон по времени.
 *
 * Наружу отдаём и координаты нажатия: в углу поля живёт кнопка звука, и решать,
 * попал ли тап по ней, должен тот, кто знает про интерфейс. С клавиатуры
 * координат нет, поэтому туда уходит NaN.
 */

/** Совместимостный mousedown прилетает вплотную за касанием; такие игнорируем. */
const MOUSE_AFTER_TOUCH_MS = 500;

export function createInput(target, { onFlap, onToggleSound }) {
  let lastTouchAt = -Infinity;

  function report(clientX, clientY) {
    const bounds = target.getBoundingClientRect();
    onFlap(clientX - bounds.left, clientY - bounds.top);
  }

  function onTouchStart(event) {
    // Гасит и прокрутку с двойным тап-зумом, и эмуляцию мыши.
    event.preventDefault();
    // Намеренно performance.now(), а не event.timeStamp: у touch- и mouse-событий
    // отсчёт метки исторически расходится (эпоха против старта страницы), и на
    // ноутбуке с тачскрином одно касание навсегда заблокировало бы мышь.
    lastTouchAt = performance.now();
    const touch = event.changedTouches[0];
    if (touch) report(touch.clientX, touch.clientY);
    else onFlap(NaN, NaN);
  }

  function onMouseDown(event) {
    if (performance.now() - lastTouchAt < MOUSE_AFTER_TOUCH_MS) return;
    event.preventDefault();
    report(event.clientX, event.clientY);
  }

  function onKeyDown(event) {
    if (event.code === 'KeyM') {
      onToggleSound();
      return;
    }
    // event.repeat: зажатый пробел не должен сыпать взмахами по автоповтору.
    if (event.code !== 'Space' || event.repeat) return;
    // Пробел иначе прокручивает страницу и жмёт сфокусированную кнопку.
    event.preventDefault();
    onFlap(NaN, NaN);
  }

  // Долгое нажатие иначе открывает системное меню поверх игры.
  function onContextMenu(event) {
    event.preventDefault();
  }

  // passive: false обязателен — иначе preventDefault на touchstart игнорируется.
  target.addEventListener('touchstart', onTouchStart, { passive: false });
  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);

  function dispose() {
    target.removeEventListener('touchstart', onTouchStart);
    target.removeEventListener('mousedown', onMouseDown);
    target.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('keydown', onKeyDown);
  }

  return { dispose };
}
