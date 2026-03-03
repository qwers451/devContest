import React, { useContext } from 'react';
import { Card, Col } from "react-bootstrap";
import { useNavigate } from 'react-router-dom';
import { Context } from "../main.jsx";
import { SOLUTION_ROUTE } from "../utils/consts.js";

const SolutionCard = ({ solution, contestTitle, freelancerLogin, employerLogin, showContestTitle, showFreelancerLogin  }) => {
    const { solution: solutionContext } = useContext(Context);
    const navigate = useNavigate();

    const status = solutionContext.getStatus(solution.status);

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const isCreated = solution.updatedAt === solution.createdAt;
    const dateLabel = isCreated ? "Создано" : "Обновлено";
    const formattedDate = formatDate(isCreated ? solution.createdAt : solution.updatedAt);

    return (<Col
        xs={12}
        className="my-2"
        onClick={(e) => {
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) return;
    
            solutionContext.setCurrentSolution(solution);
            navigate(SOLUTION_ROUTE + '/' + solution.number);
        }}
    >
        <Card
            border="light"
            className="shadow-lg rounded-lg"
            style={{
                cursor: 'pointer',
                minHeight: '220px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '1rem',
            }}
        >
            {/* Верхняя часть */}
            <div>
                {/* Заголовок */}
                <h4 className="mb-2 text-dark fw-bold text-truncate">
                    {solution.title || "Неизвестное название"}
                </h4>
    
                {/* Аннотация */}
                <p className="mb-3 text-muted" style={{ fontSize: '1rem', lineHeight: '1.4' }}>
                    {solution.annotation || "Неизвестная аннотация"}
                </p>
            </div>
    
            {/* Нижняя часть */}
            <div className="d-flex justify-content-between align-items-end mt-3">
                {/* Левая часть: конкурс, фрилансер, статус */}
                <div className="d-flex flex-column align-items-start">
                    {/* Конкурс */}
                    {showContestTitle && (
                        <div className="text-muted mb-1" style={{ fontSize: '1rem' }}>
                            Конкурс «{contestTitle || "Неизвестный конкурс"}» от {employerLogin}
                        </div>
                    )}
    
                    {/* Фрилансер */}
                    {showFreelancerLogin && (
                        <div className="text-muted mb-1" style={{ fontSize: '1rem' }}>
                            {freelancerLogin || "Неизвестный фрилансер"}
                        </div>
                    )}
    
                    {/* Статус */}
                    <span
                        style={{
                            fontSize: '0.9rem',
                            color: status.textColor,
                            fontWeight: '500',
                            background: status.color,
                            padding: '4px 10px',
                            borderRadius: '8px'
                        }}
                    >
                        {status.label}
                    </span>
                </div>
    
                {/* Правая часть: дата */}
                <div>
                    <span style={{ fontSize: '1rem', color: '#666' }}>
                        {dateLabel}: {formattedDate}
                    </span>
                </div>
            </div>
        </Card>
    </Col>
    );
};

export default SolutionCard;
