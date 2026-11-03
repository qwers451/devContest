import React, { useState } from "react";
import { BsInfoCircle } from "react-icons/bs";
import { LEVELS } from "../utils/rating";

/** Раскрывающийся блок «Как считается рейтинг» — прозрачная формула для пользователей. */
const RatingInfo = ({ defaultOpen = false }: { defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-medium text-gray-300 hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 rounded-lg"
      >
        <BsInfoCircle className="h-3.5 w-3.5 text-violet-400" />
        Как считается рейтинг
        <span className="ml-auto text-gray-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-gray-700 px-4 py-3 text-[13px] leading-relaxed text-gray-400">
          <p>
            Рейтинг от 0 до 5 считается автоматически по открытым данным платформы. Формула одинакова для
            всех исполнителей:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <span className="font-medium text-gray-200">Отзывы заказчиков, 40%.</span> Средняя оценка
              решений. Сглаживается: пять «виртуальных» отзывов со средним 6 из 10 не дают одной оценке
              10 из 10 обогнать десятки стабильных высоких оценок.
            </li>
            <li>
              <span className="font-medium text-gray-200">Соответствие ТЗ по оценке ИИ, 20%.</span> Средний
              балл автоматической проверки, тоже со сглаживанием.
            </li>
            <li>
              <span className="font-medium text-gray-200">Достижения, 40%.</span> Победа даёт 3 очка,
              другое призовое место — 1 очко. Чем больше очков, тем выше вклад, но он растёт всё медленнее.
            </li>
          </ul>
          <p>
            Без решений рейтинг равен 0. Уровни: {LEVELS.map((l) => `${l.label} (от ${l.min.toFixed(1)})`).join(", ")}.
          </p>
        </div>
      )}
    </div>
  );
};

export default RatingInfo;
