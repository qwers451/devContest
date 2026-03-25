import React, { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Context } from "../context";
import { CONTEST_ROUTE } from "../utils/consts.js";

const statusConfig = {
  draft: { label: "Черновик", dot: "bg-gray-400 dark:bg-gray-500" },
  active: { label: "Активный", dot: "bg-emerald-500 dark:bg-emerald-400" },
  finished: { label: "Завершённый", dot: "bg-violet-500 dark:bg-violet-400" },
  cancelled: { label: "Отменённый", dot: "bg-red-400 dark:bg-red-500" },
};

function daysLeft(endsAt) {
  const diff = Math.ceil((new Date(endsAt) - Date.now()) / 86400000);
  if (diff < 0) return null;
  if (diff === 0) return "последний день";
  return `${diff} ${diff === 1 ? "день" : diff < 5 ? "дня" : "дней"}`;
}

const ContestCard = observer(({ contest: item }) => {
  const { contest, user } = useContext(Context);
  const navigate = useNavigate();

  const creator = user.getById(item.customer_id);
  const status = statusConfig[item.status] || statusConfig.draft;
  const typeName = contest.getTypeNameById(item.type_id);
  const remaining = item.status === "active" ? daysLeft(item.ends_at) : null;

  return (
    <div
      onClick={() => {
        if (window.getSelection()?.toString().length > 0) return;
        contest.setCurrentContest(item);
        navigate(CONTEST_ROUTE + "/" + item.number);
      }}
      className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-500 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden animate-fade-in"
    >
      <div className="flex items-stretch">
        <div className="flex-1 px-5 py-4 min-w-0">
          <div className="flex items-center gap-2 mb-2.5">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${status.dot}`}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              {status.label}
            </span>
            {typeName && (
              <>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {typeName}
                </span>
              </>
            )}
            {remaining && (
              <span className="ml-auto text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full flex-shrink-0">
                {remaining}
              </span>
            )}
          </div>

          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-snug line-clamp-1 mb-1.5 group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors">
            {item.title}
          </h3>

          {item.annotation && (
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2">
              {item.annotation}
            </p>
          )}
        </div>

        <div className="flex-shrink-0 w-40 border-l border-gray-100 dark:border-gray-700 px-4 py-4 flex flex-col items-end justify-between">
          <div className="text-right">
            <div>
              <span className="text-2xl font-black text-gray-900 dark:text-gray-100">
                {Number(item.prizepool).toLocaleString("ru")}
              </span>
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 ml-0.5">
                ₽
              </span>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              призовой фонд
            </span>
          </div>
          <div className="text-right">
            {creator && (
              <div className="text-xs text-violet-600 dark:text-violet-400 font-medium mb-1 truncate max-w-[140px]">
                @{creator.login}
              </div>
            )}
            <div className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(item.ends_at).toLocaleDateString("ru-RU", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ContestCard;
