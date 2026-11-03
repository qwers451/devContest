// Обязательная отсылка о поддержке Фонда содействия инновациям (требование гранта).
// Формулировка — дословно по требованию Фонда; логотип — официальный файл с fasie.ru/press
// и по требованию не должен быть кликабельной ссылкой.
export const FASIE_SUPPORT_TEXT =
  "Проект реализован при поддержке Фонда содействия инновациям в рамках программы «Студенческий стартап» мероприятия «Платформа университетского технологического предпринимательства» федерального проекта «Технологии»";

const AboutPage = () => (
  <div className="min-h-screen bg-gray-950 py-6">
    <div className="mx-auto max-w-4xl space-y-4 px-4">
      <div>
        <h1 className="text-[20px] font-semibold text-gray-100">О проекте</h1>
        <p className="mt-1 text-[13px] text-gray-400">
          DevContest — платформа конкурсов для разработчиков: заказчики публикуют задачи, исполнители
          присылают решения, лучшие получают призы.
        </p>
      </div>

      <section className="flex flex-col items-center gap-6 rounded-lg border border-gray-700 bg-gray-900 p-6 sm:flex-row sm:items-center">
        <img
          src="/fasie-logo-white.png"
          alt="Логотип Фонда содействия инновациям"
          className="h-auto w-48 shrink-0 select-none"
          draggable={false}
        />
        <p className="text-[14px] leading-relaxed text-gray-200">{FASIE_SUPPORT_TEXT}</p>
      </section>
    </div>
  </div>
);

export default AboutPage;
