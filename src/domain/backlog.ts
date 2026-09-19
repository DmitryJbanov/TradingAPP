/** Edit this array to change the roadmap on the home page and /backlog. */
export const backlog: readonly {
  id: string;
  title: string;
  description: string;
}[] = [
  {
    id: "coinglass-parsing-period-selection",
    title: "Выбор периода парсинга карты ликвидаций",
    description:
      "Добавить возможность выбора периода получения и обработки данных карты ликвидаций CoinGlass. Помимо текущего периода 90 дней необходимо поддержать варианты: 7 дней, 30 дней и 1 год.",
  },
  {
    id: "fixed-range-volume-profile",
    title: "Добавление Fixed Range Volume Profile",
    description:
      "Реализовать индикатор Fixed Range Volume Profile с возможностью выбора анализируемого диапазона непосредственно на графике и настройкой параметров отображения по аналогии с инструментом TradingView.",
  },

  {
    id: "stochastic-rsi",
    title: "Добавление индикатора Stochastic RSI",
    description:
      "Реализовать технический индикатор Stochastic RSI с основными настраиваемыми параметрами периода, сглаживания и уровней перекупленности и перепроданности.",
  },
  {
    id: "trading-pair-icons",
    title: "Добавление полноценных иконок торговых пар",
    description:
      "Добавить отображение полноценных логотипов базовых активов торговых пар на главной странице и в интерфейсе графиков. Использовать реальные иконки активов вместо текстовых обозначений или первых символов тикера.",
  },
];
