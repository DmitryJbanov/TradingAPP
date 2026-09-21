/** Edit this array to change the roadmap on the home page and /backlog. */
export const backlog: readonly {
  id: string;
  title: string;
  description: string;
}[] = [
  {
    id: "fixed-range-volume-profile",
    title: "Добавление Fixed Range Volume Profile",
    description:
      "Реализовать индикатор Fixed Range Volume Profile с возможностью выбора анализируемого диапазона непосредственно на графике и настройкой параметров отображения по аналогии с инструментом TradingView.",
  },

  {
    id: "trading-pair-icons",
    title: "Добавление полноценных иконок торговых пар",
    description:
      "Добавить отображение полноценных логотипов базовых активов торговых пар на главной странице и в интерфейсе графиков. Использовать реальные иконки активов вместо текстовых обозначений или первых символов тикера.",
  },
];
