import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { Context } from "../context";
import { CONTEST_ROUTE } from "../utils/consts.js";

const statusConfig = {
  draft: { label: "Черновик", dot: "bg-gray-500" },
  active: { label: "Активный", dot: "bg-emerald-400" },
  finished: { label: "Завершён", dot: "bg-violet-400" },
  cancelled: { label: "Отменён", dot: "bg-red-400" },
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

  const openContest = () => {
    contest.setCurrentContest(item);
    navigate(CONTEST_ROUTE + "/" + item.number);
  };

  return (
    <div
      onClick={() => {
        if (window.getSelection()?.toString().length > 0) return;
        openContest();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") openContest();
      }}
      tabIndex={0}
      className="group cursor-pointer rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 transition-colors hover:border-gray-600 hover:bg-gray-900 focus:outline-none focus-visible:border-violet-500"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {/* Строка метаданных: статус, тип, номер конкурса. */}
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
            <span className="inline-flex items-center gap-1.5 text-gray-400">
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            {typeName && (
              <>
                <span className="text-gray-600">·</span>
                <span>{typeName}</span>
              </>
            )}
            <span className="text-gray-600">·</span>
            <span className="tabular-nums">DC-{item.number}</span>
          </div>

          <h3 className="mb-1 truncate text-[14px] font-medium text-gray-100">
            {item.title}
          </h3>

          {item.annotation && (
            <p className="line-clamp-1 text-[13px] text-gray-400">{item.annotation}</p>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <div className="text-[14px] font-medium tabular-nums text-gray-100">
            {Number(item.prizepool).toLocaleString("ru")} ₽
          </div>

          <div className="flex items-center gap-2 text-[12px] text-gray-500">
            {creator && <span className="truncate max-w-[120px]">@{creator.login}</span>}
            {remaining ? (
              <span className="rounded border border-gray-700 px-1.5 py-0.5 text-amber-400">
                {remaining}
              </span>
            ) : (
              <span className="tabular-nums">
                {new Date(item.ends_at).toLocaleDateString("ru-RU", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default ContestCard;
