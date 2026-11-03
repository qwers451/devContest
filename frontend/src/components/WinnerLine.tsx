import React, { useContext, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Context } from "../context";
import UserLink from "./UserLink";

/** «Победитель: @login» со ссылкой на профиль; логин подгружается по id. */
const WinnerLine = ({ executorId }: { executorId: number }) => {
  const { rating } = useContext(Context)!;
  useEffect(() => {
    rating.ensureUser(executorId);
  }, [executorId]);
  const login = rating.users[executorId]?.login;
  if (!login) return null;
  return (
    <p className="mt-0.5 text-[13px] text-emerald-700 dark:text-emerald-300">
      Победитель: <UserLink id={executorId} login={login} className="font-medium" />
    </p>
  );
};

export default observer(WinnerLine);
