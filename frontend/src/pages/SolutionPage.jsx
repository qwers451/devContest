import React, { useEffect, useContext, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Context } from '../main.jsx';
import { Container, Card, Button } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import Markdown from 'markdown-to-jsx';
import ConfirmationModal from '../components/ConfirmationModal';
import ChangeSolutionStatusModal from '../components/ChangeSolutionStatusModal';
import { downloadFileOrZip } from '../services/apiService.js';

const SolutionPage = () => {
    const { solution, contest, user } = useContext(Context);
    const { number } = useParams();
    const [currentSolution, setCurrentSolution] = useState(null);
    const [currentContest, setCurrentContest] = useState(null);
    const [freelancer, setFreelancer] = useState(null);
    const [error, setError] = useState(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [showWinnerModal, setShowWinnerModal] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {
        const fetchData = async () => {
            try {
                let sol;

                if (solution.currentSolution && solution.currentSolution.number == number) {
                    sol = solution.currentSolution;
                } else {
                    sol = await solution.fetchSolutionByNumber(number);
                    if (!sol) {
                        setError("Решение не найдено.");
                        return;
                    }
                }

                setCurrentSolution(sol);

                const fetchedContest = await contest.fetchOneContestById(sol.contest_id);
                setCurrentContest(fetchedContest);

                const [execUser] = await Promise.all([
                    user.fetchUserById(sol.executor_id),
                    fetchedContest?.customer_id ? user.fetchUserById(fetchedContest.customer_id) : Promise.resolve(null),
                ]);
                setFreelancer(execUser);
            } catch (err) {
                console.error(err);
                setError(err.message);
            }
        };
        fetchData();
    }, [number]);

    if (error) {
        return <Container>{error}</Container>;
    }

    if (!currentSolution || !currentContest) {
        return <Container>Загрузка...</Container>;
    }

    const isAdmin = user.user?.role === 'admin';
    const isOwner = user.user?.id === currentSolution.executor_id;
    const isEmployer = user.user?.role === 'customer';
    const isContestOwner = user.user?.id === currentContest?.customer_id;
    const isContestActive = currentContest?.status === 'active';
    const isCreated = currentSolution.created_at === currentSolution.updated_at;

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleDelete = async () => {
        try {
            navigate('/');
            await solution.deleteSolutionById(currentSolution.id);
        } catch (error) {
            console.error("Ошибка удаления:", error);
        }
    };

    const handleStatusChange = async (newStatus) => {
        try {
            if (solution.currentSolution.status === newStatus) return;
            const updatedSolution = await solution.updateSolutionStatus(currentSolution.id, newStatus);
            setCurrentSolution(updatedSolution);
        } catch (error) {
            console.error('Ошибка изменения статуса:', error);
        }
    };

    const handleSelectWinner = async () => {
        try {
            await solution.selectWinner(
                currentContest.id,
                currentSolution.id,
                currentSolution.executor_id
            );
            navigate(`/contest/${currentContest.number}`);
        } catch (error) {
            console.error('Ошибка выбора победителя:', error);
            alert('Не удалось выбрать победителя: ' + (error?.response?.data?.detail || error.message));
        }
    };

    const handleGoToContest = () => {
        if (currentContest?.number) navigate(`/contest/${currentContest.number}`);
    };

    const handleGoToMySolutions = () => navigate(`/my-solutions`);

    const handleGoToSolutions = () => navigate(`/contest/${currentContest.number}/solutions`);

    const handleEditSolution = () => {
        navigate(`/solution/${currentSolution.number}/edit`, { state: JSON.parse(JSON.stringify(currentSolution)) });
    };

    const handleDownloadArchive = () => {
        const firstFile = currentSolution.files[0];
        const relativePath = firstFile.replace('/static/', '');
        const folderPath = relativePath.split('/').slice(0, -1).join('/');
        downloadFileOrZip(`/download-folder/${folderPath}`, `solution_${currentSolution.number}`);
    };

    const handleGoToReviews = () => navigate(`/solution/${currentSolution.number}/reviews`);

    const handleLeaveReview = () => navigate(`/solution/${currentSolution.number}/create-review`);

    return (
        <Container>
            <Card className="mb-4 shadow-sm">
                <Card.Header className="position-relative">
                    <div className="d-flex justify-content-between align-items-start flex-wrap">
                        <div>
                            <Card.Title className="mb-2">
                                <h1>{currentSolution.title || "Без названия"}</h1>
                            </Card.Title>
                            <h5 className="text-muted mb-2">
                                Конкурс «{currentContest.title}»
                                от {user.getById(currentContest.customer_id)?.login || "Неизвестно"}
                            </h5>
                            <div className="d-inline-block">
                                <span
                                    style={{
                                        display: 'inline-block',
                                        fontSize: '1.4rem',
                                        fontWeight: '700',
                                        lineHeight: '1',
                                        color: solution.getStatus(solution.currentSolution.status).textColor,
                                        backgroundColor: solution.getStatus(solution.currentSolution.status).color,
                                        padding: '0.35em 0.65em',
                                        borderRadius: '0.375rem',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {solution.getStatus(solution.currentSolution.status).label}
                                </span>
                            </div>
                        </div>

                        <div className="text-end d-flex flex-column justify-content-center align-items-end ms-auto mt-2">
                            <h5 className="text-muted">
                                {freelancer?.login || "Неизвестный фрилансер"}
                            </h5>
                        </div>
                    </div>

                    <div
                        style={{
                            position: 'absolute',
                            bottom: '0.5rem',
                            right: '1rem',
                            textAlign: 'right'
                        }}
                    >
                        <h5 className="mb-1">
                            <strong>Создано:</strong> {formatDate(currentSolution.created_at)}
                        </h5>
                        {!isCreated && (
                            <h5 className="mb-1">
                                <strong>Обновлено:</strong> {formatDate(currentSolution.updated_at)}
                            </h5>
                        )}
                    </div>
                </Card.Header>

                <Card.Body>
                    <Card.Subtitle className="mb-2">
                        <h2>Описание:</h2>
                    </Card.Subtitle>
                    <Markdown options={{ disableParsingRawHTML: true }}>
                        {currentSolution.description}
                    </Markdown>

                    {currentSolution.files && currentSolution.files.length > 0 && (
                        <>
                            <hr />
                            <h4>Файлы:</h4>
                            <ul>
                                {currentSolution.files.map((filePath, index) => {
                                    const fileName = filePath.split('/').pop();
                                    const relativePath = filePath.replace('/static/', '');
                                    return (
                                        <li key={index}>
                                            <Button
                                                variant="link"
                                                className="me-2 p-0"
                                                onClick={() => downloadFileOrZip(`/files/${relativePath}`, fileName)}
                                            >
                                                {fileName}
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ul>
                            <Button variant="success" onClick={handleDownloadArchive}>
                                Скачать всё
                            </Button>
                        </>
                    )}
                </Card.Body>

                <Card.Footer className="d-flex justify-content-between flex-wrap align-items-center gap-2">
                    <div className="d-flex flex-wrap gap-2">
                        {(isOwner || isAdmin) && (
                            <>
                                <Button variant="secondary" size="sm" onClick={handleGoToContest}>
                                    Перейти к конкурсу
                                </Button>
                                <Button variant="primary" size="sm" onClick={handleGoToMySolutions}>
                                    Перейти к моим решениям
                                </Button>
                            </>
                        )}

                        {isEmployer && (
                            <Button variant="secondary" size="sm" onClick={handleGoToSolutions}>
                                Вернуться к списку решений
                            </Button>
                        )}
                    </div>

                    <div className="d-flex flex-wrap gap-2">
                        {(isOwner || isAdmin) && (
                            <>
                                <Button variant="info" size="sm" onClick={handleGoToReviews}>
                                    Просмотреть отзывы
                                </Button>
                                <Button variant="success" size="sm" onClick={handleEditSolution}>
                                    Редактировать решение
                                </Button>
                                <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
                                    Удалить решение
                                </Button>
                                <ConfirmationModal
                                    show={showDeleteModal}
                                    onHide={() => setShowDeleteModal(false)}
                                    onConfirm={handleDelete}
                                    title="Удаление решения"
                                    message="Вы уверены, что хотите удалить решение?"
                                    confirmText="Удалить"
                                    cancelText="Отмена"
                                />
                            </>
                        )}

                        {isEmployer && (
                            <>
                                <Button variant="info" size="sm" onClick={handleGoToReviews}>
                                    Просмотреть отзывы
                                </Button>
                                <Button variant="warning" size="sm" onClick={() => setShowStatusModal(true)}>
                                    Изменить статус
                                </Button>
                                <ChangeSolutionStatusModal
                                    show={showStatusModal}
                                    onHide={() => setShowStatusModal(false)}
                                    currentStatus={solution.currentSolution.status}
                                    onSave={handleStatusChange}
                                />
                                <Button variant="success" size="sm" onClick={handleLeaveReview}>
                                    Оставить отзыв
                                </Button>

                                {/* Кнопка финализации — только владелец конкурса, пока он активен */}
                                {isContestOwner && isContestActive && (
                                    <>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() => setShowWinnerModal(true)}
                                        >
                                            🏆 Выбрать победителем
                                        </Button>
                                        <ConfirmationModal
                                            show={showWinnerModal}
                                            onHide={() => setShowWinnerModal(false)}
                                            onConfirm={handleSelectWinner}
                                            title="Выбор победителя"
                                            message={`Вы уверены, что хотите выбрать это решение победителем? Конкурс завершится, а приз (${currentContest.prizepool} руб.) будет начислен исполнителю. Действие необратимо.`}
                                            confirmText="Выбрать победителем"
                                            cancelText="Отмена"
                                        />
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </Card.Footer>
            </Card>
        </Container>
    );
};

export default observer(SolutionPage);
