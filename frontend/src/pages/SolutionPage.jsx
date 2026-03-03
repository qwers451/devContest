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

                const fetchedContest = await contest.fetchOneContestById(sol.contestId);
                setCurrentContest(fetchedContest);

                await user.fetchUserById(sol.freelancerId);
                setFreelancer(user.getById(sol.freelancerId));
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

    const isAdmin = user.user?.role === 3;
    const isOwner = user.user?.id === currentSolution.freelancerId;
    const isEmployer = user.user?.role === 2;
    const isCreated = currentSolution.createdAt === currentSolution.updatedAt;

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
            if (solution.currentSolution.status === newStatus) {
                console.log('Статус не изменился:', newStatus);
                return;
            }

            const updatedSolution = await solution.updateSolutionStatus(currentSolution.id, newStatus);
            setCurrentSolution(updatedSolution); 
        } catch (error) {
            console.error('Ошибка изменения статуса:', error);
        }
    };

    const handleGoToContest = () => {
        if (currentContest?.number) {
            navigate(`/contest/${currentContest.number}`);
        }
    };
    
    const handleGoToMySolutions = () => {
        navigate(`/my-solutions`);
    };

    const handleGoToSolutions = () => {
        navigate(`/contest/${currentContest.number}/solutions`);
    };

    const handleEditSolution = () => {
        navigate(`/solution/${currentSolution.number}/edit`, { state: JSON.parse(JSON.stringify(currentSolution)) })
    };

    const handleDownloadArchive = () => {
        const firstFile = currentSolution.files[0];
        const relativePath = firstFile.replace('/static/', '');
        const folderPath = relativePath.split('/').slice(0, -1).join('/');
        downloadFileOrZip(`/download-folder/${folderPath}`, `solution_${currentSolution.number}`);
    };

    const handleGoToReviews = () => {
        navigate(`/solution/${currentSolution.number}/reviews`);
    };

    const handleLeaveReview = () => {
        navigate(`/solution/${currentSolution.number}/create-review`);
    };

    return (
        <Container>
            <Card className="mb-4 shadow-sm">
                <Card.Header className="position-relative">
                    <div className="d-flex justify-content-between align-items-start flex-wrap">
                        {/* Левая часть: Заголовок, конкурс и статус */}
                        <div>
                            <Card.Title className="mb-2">
                                <h1>{currentSolution.title || "Без названия"}</h1>
                            </Card.Title>
                            <h5 className="text-muted mb-2">
                                Конкурс «{currentContest.title}»
                                от {user.getById(currentContest.employerId)?.login || "Неизвестно"}
                            </h5>
                            <div className="d-inline-block">
                                <span
                                    style={{
                                        display: 'inline-block',
                                        fontSize: '1.4rem',
                                        fontWeight: '700',
                                        lineHeight: '1',
                                        color: solution.getStatus(solution.currentSolution.status).textColor, // Заменяем currentSolution.status на solution.currentSolution.status
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

                        {/* Правая часть: Фрилансер */}
                        <div
                            className="text-end d-flex flex-column justify-content-center align-items-end ms-auto mt-2">
                            <h5 className="text-muted">
                                {freelancer?.login || "Неизвестный фрилансер"}
                            </h5>
                        </div>
                    </div>

                    {/* Даты в правом нижнем углу */}
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '0.5rem',
                            right: '1rem',
                            textAlign: 'right'
                        }}
                    >
                        <h5 className="mb-1">
                            <strong>Создано:</strong> {formatDate(currentSolution.createdAt)}
                        </h5>
                        {!isCreated && (
                            <h5 className="mb-1">
                                <strong>Обновлено:</strong> {formatDate(currentSolution.updatedAt)}
                            </h5>
                        )}
                    </div>
                </Card.Header>

                <Card.Body>
                    {/* Описание */}
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
                            <Button
                                variant="success"
                                onClick={handleDownloadArchive}
                            >
                                Скачать всё
                            </Button>
                        </>
                    )}
                </Card.Body>

                <Card.Footer className="d-flex justify-content-between flex-wrap align-items-center gap-2">
                    <div className="d-flex flex-wrap gap-2">
                        {(isOwner || isAdmin) && (
                            <>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleGoToContest}
                                >
                                    Перейти к конкурсу
                                </Button>

                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleGoToMySolutions}
                                >
                                    Перейти к моим решениям
                                </Button>
                            </>
                        )}

                        {isEmployer && (
                            <>
                                <Button 
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleGoToSolutions}
                                >
                                    Вернуться к списку решений
                                </Button>
                            </>
                        )}
                    </div>

                    <div className="d-flex flex-wrap gap-2">
                        {(isOwner || isAdmin) && (
                            <>
                                <Button
                                    variant="info"
                                    className="sm"
                                    onClick={handleGoToReviews}
                                >
                                    Просмотреть отзывы
                                </Button>
                                <Button
                                    variant="success"
                                    className="sm"
                                    onClick={handleEditSolution}
                                >
                                    Редактировать решение
                                </Button>
                                <Button
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setShowDeleteModal(true)}
                                >
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
                                <Button
                                    variant="info"
                                    className="sm"
                                    onClick={handleGoToReviews}
                                >
                                    Просмотреть отзывы
                                </Button>
                                <Button
                                    variant="warning"
                                    size="sm"
                                    onClick={() => setShowStatusModal(true)}
                                >
                                    Изменить статус
                                </Button>

                                <ChangeSolutionStatusModal
                                    show={showStatusModal}
                                    onHide={() => setShowStatusModal(false)}
                                    currentStatus={solution.currentSolution.status}
                                    onSave={handleStatusChange}
                                />

                                <Button 
                                    variant="success"
                                    size="sm"
                                    onClick={handleLeaveReview}
                                >
                                    Оставить отзыв
                                </Button>
                            </>
                        )}
                    </div>
                </Card.Footer>
            </Card>
        </Container>
    );
};

export default observer(SolutionPage);
