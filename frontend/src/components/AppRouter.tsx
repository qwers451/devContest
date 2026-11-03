import React, {useContext, useEffect, useRef, Suspense} from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { authRoutes, publicRoutes } from "../routes";
import {LANDING_ROUTE} from "../utils/consts.js";
import {Context} from "../context";
import { observer } from "mobx-react-lite";

const AppRouter = () => {
    const {contest, user} = useContext(Context)
    const { pathname } = useLocation();
    const pageRef = useRef<HTMLDivElement>(null);

    // Мягкий вход страницы при смене маршрута: WAAPI на обёртке, без перемонтирования.
    // У лендинга своя хореография, при reduced motion движения нет.
    useEffect(() => {
        const el = pageRef.current;
        if (!el || pathname === LANDING_ROUTE || !el.animate) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        el.animate(
            [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
            { duration: 260, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
        );
    }, [pathname]);

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
        <div ref={pageRef}>
            <Suspense fallback={<div className="flex justify-center items-center h-32 text-gray-400">Загрузка...</div>}>
                <Routes>
                    {user.isAuth && authRoutes.map(({ path, element }) =>
                        <Route key={path} path={path} element={element} exact />
                    )}
                    {publicRoutes.map(({ path, element }) =>
                        <Route key={path} path={path} element={element} exact />
                    )}
                    <Route path="*" element={<Navigate to={LANDING_ROUTE} />} />
                </Routes>
            </Suspense>
        </div>
    );
};

export default observer(AppRouter);
