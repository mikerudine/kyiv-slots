/* Shared game list + UA/EN handling for menu concept prototypes.
   Mirrors /menu/ — keep in sync if the live menu changes. */
(function (global) {
  const G = [
    { id: 'slots', h: '../../', img: '../assets/slots.webp', e: '🎰',
      ua: ['Слоти', 'Тривога, світла нема, дощ — крути барабани'],
      en: ['Slots', 'Air raid, blackout, rain — spin the reels'] },
    { id: 'dogwalk', h: '../../dogwalk/', img: '../assets/dogwalk.webp', e: '🐕',
      ua: ['Прогулянка', 'Вигуляй собаку вечірнім Києвом'],
      en: ['Dog walk', 'Walk the dog through evening Kyiv'] },
    { id: 'scooter', h: '../../scooter/', img: '../assets/scooter.webp', e: '🛴',
      ua: ['Самокат', 'Їдь крізь блекаути з фарою'],
      en: ['Scooter', 'Ride through blackouts with a headlight'] },
    { id: 'laundry', h: '../../laundry/', img: '../assets/laundry.webp', e: '🫧',
      ua: ['Стирка', 'Шкарпетки за кольором у кошики, поки є світло'],
      en: ['Laundry', 'Match socks by colour into baskets while the power lasts'] },
    { id: 'dice', h: '../../dice/', img: '../assets/dice.webp', e: '🎲',
      ua: ['Кості світла', 'Вгадай, скільки годин світла сьогодні'],
      en: ['Power dice', 'Guess how many hours of power today'] },
    { id: 'commute', h: '../../commute/', img: '../assets/commute.webp', e: '🚇',
      ua: ['Дорога на Осокорки', 'Доїдь з Оболоні до комендантської'],
      en: ['Road to Osokorky', 'Cross Kyiv before curfew'] },
    { id: 'findit', h: '../../findit/', img: '../assets/findit.webp', e: '🔦',
      ua: ['Знайди річ', 'Бардак, блекаут і ліхтарик'],
      en: ['Find it', 'Mess, blackout and a flashlight'] },
    { id: 'minesweeper', h: '../../minesweeper/', img: '../assets/minesweeper.webp', e: '⚡',
      ua: ['Графік світла', 'Сапер: світло й темрява по годинах і чергах'],
      en: ['Power schedule', 'Minesweeper: light and darkness by hour and queue'] },
    { id: 'tetris', h: '../../tetris/', img: '../assets/tetris.webp', e: '▦',
      ua: ['Тетріс відключень', 'Тетріс на графіку черг 1.1–5.2'],
      en: ['Outage Tetris', 'Tetris on outage queues 1.1–5.2'] },
  ];

  const T = {
    ua: {
      brand: 'Один день у Києві',
      sub: 'Усі міні-ігри',
      arch: 'Архів: raycaster-прототип',
      back: '← Концепти',
      pick: 'Обери гру',
    },
    en: {
      brand: 'One Day in Kyiv',
      sub: 'All mini-games',
      arch: 'Archive: raycaster prototype',
      back: '← Concepts',
      pick: 'Pick a game',
    },
  };

  function createLang(onChange) {
    let lang = localStorage.getItem('menu-lang') || 'ua';
    function get() { return lang; }
    function set(next) {
      lang = next;
      localStorage.setItem('menu-lang', lang);
      document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
      onChange(lang);
    }
    document.documentElement.lang = lang === 'ua' ? 'uk' : 'en';
    return {
      get,
      toggle() { set(lang === 'ua' ? 'en' : 'ua'); },
      apply() { onChange(lang); },
      label() { return lang.toUpperCase(); },
    };
  }

  global.MenuConcepts = { G, T, createLang, archHref: '../../raycaster/' };
})(window);
