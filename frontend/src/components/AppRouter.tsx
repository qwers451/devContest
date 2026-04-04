import React, {useContext, useEffect, Suspense} from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { authRoutes, publicRoutes } from "../routes";
import {CONTESTS_ROUTE} from "../utils/consts.js";
import {Context} from "../context";
import { observer } from "mobx-react-lite";

const AppRouter = () => {
    const {contest, user} = useContext(Context)

    useEffect(() => {
        if (user.isAuth && (user.user as { role?: string }).role === 'admin') {
            user.fetchUsers();
        }
    }, [user, user.isAuth]);

    useEffect(() => {
        contest.fetchTypes();
    }, []);

    useEffect(() => {
        if (!contest.contests || contest.contests.length === 0) {
            contest.setLoading(true);
        }
    }, [contest]);

    return (
        <Suspense fallback={<div className="flex justify-center items-center h-32 text-gray-400">Загрузка...</div>}>
            <Routes>
                {user.isAuth && authRoutes.map(({ path, element }) =>
                    <Route key={path} path={path} element={element} exact />
                )}
                {publicRoutes.map(({ path, element }) =>
                    <Route key={path} path={path} element={element} exact />
                )}
                <Route path="*" element={<Navigate to={CONTESTS_ROUTE} />} />
            </Routes>
        </Suspense>
    );
};

export default observer(AppRouter);
