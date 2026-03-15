import React, {useContext, useEffect} from 'react';
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
        <Routes>
            {user.isAuth && authRoutes.map(({ path, element }) =>
                <Route key={path} path={path} element={element} exact />
            )}
            {publicRoutes.map(({ path, element }) =>
                <Route key={path} path={path} element={element} exact />
            )}
            {/*перенаправление по умолчанию*/}
            <Route path="*" element={<Navigate to={CONTESTS_ROUTE} />} />
        </Routes>
    );
};

export default observer(AppRouter);
