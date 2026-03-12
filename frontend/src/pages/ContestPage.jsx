import React, { useEffect, useContext, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Context } from '../main.jsx';
import { Container, Card, Badge, Button, Form, Row, Col } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import Markdown from 'markdown-to-jsx';
import { downloadFileOrZip, deleteData } from '../services/apiService.js';

const ContestPage = () => {
    const { contest, user } = useContext(Context);
    const { number } = useParams();
    const [currentContest, setCurrentContest] = useState(null);
    const [error, setError] = useState(null);
    const [editingStages, setEditingStages] = useState(false);
    const [draftStages, setDraftStages] = useState([]);
    const [savingStages, setSavingStages] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {
        if (contest.currentContest && contest.currentContest.number == number) {
            setCurrentContest(contest.currentContest);
        } else {
            const fetchContest = async () => {
                const fetched = await contest.fetchOneContestByNumber(number);
                if (fetched) {
                    setCurrentContest(fetched);
                    if (fetched.customer_id) user.fetchUserById(fetched.customer_id);
                } else {
                    setError("Конкурс не найден.");
                }
            };
            fetchContest();
        }
    }, [number, contest.currentContest]);

    useEffect(() => {
        if (currentContest?.customer_id) user.fetchUserById(currentContest.customer_id);
    }, [currentContest?.customer_id]);

    useEffect(() => {
        contest.fetchTypes();
    }, []);

    if (error) return <div>{error}</div>;
    if (!currentContest) return <div>Загрузка...</div>;

    const isAdmin = user.user && user.user.role === 'admin';
    const isOwner = user.getCurrentUserId() === currentContest.customer_id;
    const isFreelancer = user.user && user.user.role === 'executor';
    const isFinished = currentContest.status === 'finished';

    const handleDelete = async () => {
        if (!window.confirm('Вы точно хотите удалить этот конкурс?')) return;
        try {
            await deleteData(`/contests/${currentContest.id}`);
            navigate('/');
        } catch (e) {
            console.error(e);
            alert('Не удалось удалить конкурс');
        }
    };

    const sortedStages = [...(currentContest.stages || [])].sort((a, b) => a.order - b.order);

    // Active stage: manual override via current_stage_id, else auto-detect by nearest future deadline
    const activeStageId = currentContest.current_stage_id ?? (() => {
        if (sortedStages.length === 0) return null;
        const now = new Date();
        const upcoming = sortedStages.filter(s => s.deadline && new Date(s.deadline) >= now);
        return upcoming.length > 0 ? upcoming[0].id : sortedStages[sortedStages.length - 1].id;
    })();

    const handleSetCurrentStage = async (stageId) => {
        try {
            // If clicking the manually-set current stage, clear the override (revert to auto)
            const newId = (currentContest.current_stage_id === stageId) ? null : stageId;
            const updated = await contest.setCurrentStage(currentContest.id, newId);
            setCurrentContest(updated);
        } catch (e) {
            console.error(e);
            alert('Не удалось изменить текущий этап');
        }
    };

    const startEditingStages = () => {
        setDraftStages(sortedStages.map(s => ({
            ...s,
            deadline: s.deadline ? s.deadline.slice(0, 10) : '',
        })));
        setEditingStages(true);
    };

    const addDraftStage = () => {
        setDraftStages(prev => [...prev, { name: '', description: '', deadline: '', order: prev.length + 1 }]);
    };

    const removeDraftStage = (idx) => {
        setDraftStages(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
    };

    const updateDraftStage = (idx, field, value) => {
        setDraftStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
    };

    const saveStages = async () => {
        setSavingStages(true);
        try {
            const payload = draftStages
                .filter(s => s.name.trim())
                .map((s, i) => ({
                    name: s.name,
                    description: s.description || undefined,
                    deadline: s.deadline ? new Date(s.deadline).toISOString() : undefined,
                    order: i + 1,
                }));
            const updated = await contest.updateStages(currentContest.id, payload);
            setCurrentContest(updated);
            setEditingStages(false);
        } catch (e) {
            console.error(e);
            alert('Не удалось сохранить этапы');
        } finally {
            setSavingStages(false);
        }
    };

    const statusBg = {
        active: 'success',
        draft: 'secondary',
        finished: 'primary',
        cancelled: 'danger',
    }[currentContest.status] || 'secondary';

    return (
        <Container>
            <Card className="mb-4 shadow-sm">
                <Card.Header>
                    <Card.Title>
                        <h1>{currentContest.title}</h1>
                    </Card.Title>
                    <h2>
                        <Badge bg="secondary">
                            {contest.getTypeNameById(currentContest.type_id)}
                        </Badge>
                        <Badge className="ms-2" bg={statusBg}>
                            {contest.getStatus(currentContest.status)}
                        </Badge>
                    </h2>
                    <h4 className="mb-1">
                        Дата окончания: {(new Date(currentContest.ends_at)).toLocaleDateString('ru-RU')}
                        <span className="ms-3">Приз: {currentContest.prizepool} руб.</span>
                    </h4>
                    <div className="text-muted small">
                        Создатель: {user.getById(currentContest.customer_id)?.login || '...'}
                    </div>
                </Card.Header>

                <Card.Body>

                    {/* Блок победителя */}
                    {isFinished && (
                        <div className="alert alert-success mb-3 d-flex align-items-center gap-2" role="alert">
                            <span style={{ fontSize: '1.5rem' }}>🏆</span>
                            <div>
                                <strong>Конкурс завершён — победитель выбран!</strong>
                                {currentContest.winner && (
                                    <div className="mt-1">
                                        <Button
                                            variant="link"
                                            className="p-0"
                                            onClick={() => navigate(`/solution/${currentContest.winner.submission_id}`)}
                                        >
                                            Перейти к победившему решению
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Описание */}
                    <Card.Subtitle className="mb-1"><h2>Описание проекта</h2></Card.Subtitle>
                    <Markdown options={{ disableParsingRawHTML: true }}>
                        {currentContest.description || ''}
                    </Markdown>

                    {/* Техническое задание */}
                    {currentContest.tz_text && (
                        <>
                            <hr />
                            <h4>Техническое задание</h4>
                            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', background: '#f8f9fa', padding: '1rem', borderRadius: '0.375rem' }}>
                                {currentContest.tz_text}
                            </pre>
                        </>
                    )}

                    {/* Этапы */}
                    {(sortedStages.length > 0 || ((isOwner || isAdmin) && !isFinished)) && (
                        <>
                            <hr />
                            <div className="d-flex justify-content-between align-items-center mb-2">
                                <h4 className="mb-0">Этапы конкурса</h4>
                                {(isOwner || isAdmin) && !isFinished && !editingStages && (
                                    <Button variant="outline-secondary" size="sm" onClick={startEditingStages}>
                                        Редактировать этапы
                                    </Button>
                                )}
                            </div>

                            {editingStages ? (
                                <div className="border rounded p-3 bg-light">
                                    {draftStages.map((stage, idx) => (
                                        <Row key={idx} className="mb-2 align-items-center g-2">
                                            <Col xs="auto" className="text-muted fw-bold">{idx + 1}.</Col>
                                            <Col>
                                                <Form.Control
                                                    size="sm"
                                                    placeholder="Название этапа"
                                                    value={stage.name}
                                                    onChange={e => updateDraftStage(idx, 'name', e.target.value)}
                                                />
                                            </Col>
                                            <Col xs={12} sm={3}>
                                                <Form.Control
                                                    size="sm"
                                                    type="date"
                                                    value={stage.deadline}
                                                    onChange={e => updateDraftStage(idx, 'deadline', e.target.value)}
                                                />
                                            </Col>
                                            <Col xs={12} sm={4}>
                                                <Form.Control
                                                    size="sm"
                                                    placeholder="Описание (необязательно)"
                                                    value={stage.description || ''}
                                                    onChange={e => updateDraftStage(idx, 'description', e.target.value)}
                                                />
                                            </Col>
                                            <Col xs="auto">
                                                <Button variant="outline-danger" size="sm" onClick={() => removeDraftStage(idx)}>✕</Button>
                                            </Col>
                                        </Row>
                                    ))}
                                    <div className="d-flex gap-2 mt-2">
                                        <Button variant="outline-primary" size="sm" onClick={addDraftStage}>+ Добавить этап</Button>
                                        <Button variant="success" size="sm" onClick={saveStages} disabled={savingStages}>
                                            {savingStages ? 'Сохранение...' : 'Сохранить'}
                                        </Button>
                                        <Button variant="secondary" size="sm" onClick={() => setEditingStages(false)}>Отмена</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-2">
                                    {sortedStages.length === 0 && (
                                        <div className="text-muted small">Этапы не добавлены. Нажмите «Редактировать этапы», чтобы добавить.</div>
                                    )}
                                    {sortedStages.map((stage) => {
                                        const isActive = stage.id === activeStageId;
                                        const isManual = currentContest.current_stage_id != null;
                                        return (
                                            <div
                                                key={stage.id}
                                                className={`d-flex align-items-start mb-2 p-2 rounded ${isActive ? 'border border-success bg-success bg-opacity-10' : ''}`}
                                            >
                                                <Badge
                                                    bg={isActive ? 'success' : 'secondary'}
                                                    className="me-3 flex-shrink-0"
                                                    style={{ fontSize: '0.9rem', minWidth: '1.8rem', textAlign: 'center' }}
                                                >
                                                    {stage.order}
                                                </Badge>
                                                <div className="flex-grow-1">
                                                    <strong>{stage.name}</strong>
                                                    {isActive && (
                                                        <Badge bg="success" className="ms-2" style={{ fontSize: '0.75rem' }}>
                                                            Текущий {isManual ? '' : '(авто)'}
                                                        </Badge>
                                                    )}
                                                    {stage.deadline && (
                                                        <span className="ms-2 text-muted small">
                                                            до {new Date(stage.deadline).toLocaleDateString('ru-RU')}
                                                        </span>
                                                    )}
                                                    {stage.description && (
                                                        <div className="text-muted small mt-1">{stage.description}</div>
                                                    )}
                                                </div>
                                                {(isOwner || isAdmin) && !isFinished && (
                                                    <Button
                                                        variant={isActive && isManual ? 'success' : 'outline-secondary'}
                                                        size="sm"
                                                        className="ms-2 flex-shrink-0"
                                                        onClick={() => handleSetCurrentStage(stage.id)}
                                                        title={isActive && isManual ? 'Снять отметку (перейти на авто)' : 'Назначить текущим вручную'}
                                                        style={{ fontSize: '0.75rem' }}
                                                    >
                                                        {isActive && isManual ? '✓ Текущий' : 'Назначить'}
                                                    </Button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {/* Файлы */}
                    {currentContest.files && currentContest.files.length > 0 && (
                        <>
                            <hr />
                            <h4>Файлы:</h4>
                            <ul>
                                {currentContest.files.map((filePath, index) => {
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
                                onClick={() => {
                                    const firstFile = currentContest.files[0];
                                    const relativePath = firstFile.replace('/static/', '');
                                    const folderPath = relativePath.split('/').slice(0, -1).join('/');
                                    downloadFileOrZip(`/download-folder/${folderPath}`, `contest_${currentContest.number}`);
                                }}
                            >
                                Скачать всё
                            </Button>
                        </>
                    )}
                </Card.Body>

                {/* Кнопки исполнителя */}
                {isFreelancer && !isFinished && (
                    <Card.Footer>
                        <Button variant="primary" onClick={() => navigate(`/contest/${currentContest.number}/create-solution`)}>
                            Создать решение
                        </Button>
                    </Card.Footer>
                )}

                {/* Кнопки заказчика/админа */}
                {(isAdmin || isOwner) && (
                    <Card.Footer>
                        <Button variant="primary" onClick={() => navigate(`/contest/${currentContest.number}/solutions`)}>
                            Просмотреть решения
                        </Button>
                        {isOwner && !isFinished && (
                            <Button
                                variant="primary"
                                className="ms-2"
                                onClick={() => navigate(`/contest/edit/${currentContest.number}`, { state: JSON.parse(JSON.stringify(currentContest)) })}
                            >
                                Редактировать конкурс
                            </Button>
                        )}
                        {isAdmin && (
                            <Button variant="danger" className="ms-2" onClick={handleDelete}>
                                Удалить конкурс
                            </Button>
                        )}
                    </Card.Footer>
                )}
            </Card>
        </Container>
    );
};

export default observer(ContestPage);
