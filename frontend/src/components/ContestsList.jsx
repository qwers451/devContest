import React, { useEffect, useContext, useState } from 'react';
import { Context } from "../main.jsx";
import { Row, Spinner, Pagination } from "react-bootstrap";
import ContestCard from "./ContestCard.jsx";
import { observer } from "mobx-react-lite";

const ContestsList = observer(() => {
    const { contest } = useContext(Context);

    const [showLoader, setShowLoader] = useState(false); // Изначально лоадер скрыт

    useEffect(() => {
        contest.fetchContestsFiltered(contest.currentPage);
    }, []);

    const handlePageChange = (pageNumber) => {
        contest.fetchContestsFiltered(pageNumber);
    }

    useEffect(() => {
        if (contest.isLoading) {
            setShowLoader(true);
        } else {
            // Плавное скрытие лоадера с минимальной задержкой
            const timer = setTimeout(() => {
                setShowLoader(false);
            }, 100); // Минимальная задержка 100 мс для плавности
            return () => clearTimeout(timer);
        }
    }, [contest.isLoading]);

    if (showLoader) {
        return (
            <div className="d-flex justify-content-center my-5">
                <Spinner animation="border" style={{ color: '#543787' }} />
            </div>
        );
    }

    if (contest.contests.length === 0) {
        return (
            <div className="text-center my-5">
                Нет конкурсов по выбранным фильтрам
            </div>
        );
    }

    return (
        <>
            <Row className="d-flex justify-content-center">
                {contest.contests.map((contestItem) => (
                    <ContestCard
                        key={contestItem.id}
                        contest={contestItem}
                        type={contest.getTypeNameById(contestItem.type)}
                    />
                ))}
            </Row>
            <Pagination className="justify-content-center my-4">
                {[...Array(contest.totalPages)].map((_, idx) => (
                    <Pagination.Item
                        key={idx + 1}
                        active={contest.currentPage === idx + 1}
                        onClick={() => handlePageChange(idx + 1)}
                    >
                        {idx + 1}
                    </Pagination.Item>
                ))}
            </Pagination>
        </>
    );
});

export default ContestsList;
