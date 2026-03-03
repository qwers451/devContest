import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Card, Button, Spinner, Alert, Modal, Form } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import { Context } from '../main.jsx';
import { updateData, fetchData, sendData, deleteData } from '../services/apiService.js';

const ReviewPage = () => {
    const { number, reviewNumber } = useParams();
    const navigate = useNavigate();
    const { solution, user } = useContext(Context);

    const [review, setReview]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    // редактирование
    const [showEdit, setShowEdit]         = useState(false);
    const [editScore, setEditScore]       = useState('');
    const [editCommentary, setEditCommentary] = useState('');
    const [saving, setSaving]             = useState(false);
    const [isOwner, setIsOwner] = useState(false);

    useEffect(() => {
        if (error === 'Отзыв не найден') {
            navigate(`/solution/${number}/reviews`, { replace: true });
        }
    }, [error, navigate, number]);

    useEffect(() => {
        (async () => {
            try {
                // 1) Подгрузить решение
                const sol = solution.getSolutionIfExists(number)
                    || await solution.fetchSolutionByNumber(number);
                if (!sol) throw new Error('Решение не найдено');

                // права
                const isOwner    = user.user?.id === sol.freelancerId;
                const isEmployer = user.user?.role === 2;
                if (!user.isAuth || (!isOwner && !isEmployer)) {
                    throw new Error('Доступ запрещён');
                }

                // 2) Подгрузить ревью с сервера
                const list = await fetchData(`/solutions/${sol.id}/reviews`);
                const rv   = list.find(r => String(r.number) === reviewNumber);
                if (!rv) throw new Error('Отзыв не найден');

                // добавляем решение id внутрь для запросов
                rv.solutionId = sol.id;
                setReview(rv);

                const isReviewer = user.user?.id === rv.reviewerId;
                setIsOwner(isReviewer);

                // подготовка формы
                setEditScore(rv.score);
                setEditCommentary(rv.commentary);
            } catch (err) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [number, reviewNumber, user.user, user.isAuth, solution]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = { score: parseFloat(editScore), commentary: editCommentary.trim() };
            const updated = await updateData(
                `/solutions/${review.solutionId}/reviews/${review.number}`, payload
            );
            updated.solutionId = review.solutionId;
            setReview(updated);
            setShowEdit(false);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Ошибка при сохранении');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Удалить этот отзыв?')) return;
        try {
            await deleteData(`/solutions/${review.solutionId}/reviews/${review.number}`);
            navigate(`/solution/${number}/reviews`, { replace: true });
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Ошибка при удалении');
        }
    };

    if (loading) {
        return <Container className="mt-4 text-center"><Spinner animation="border" /><p>Загрузка...</p></Container>;
    }
    if (error) {
        return (
            <Container className="mt-4">
                <Alert variant="danger">{error}</Alert>
                <Button onClick={() => navigate(-1)}>Назад</Button>
            </Container>
        );
    }

    return (
        <Container className="mt-4">
            <Card className="shadow-sm">
                <Card.Header><h3>Ревью #{review.number} к решению №{number}</h3></Card.Header>
                <Card.Body>
                    <p><strong>Оценка:</strong> {review.score}</p>
                    <hr />
                    <p>{review.commentary}</p>
                </Card.Body>
                <Card.Footer className="d-flex justify-content-between">
                    <Button variant="secondary" onClick={() => navigate(-1)}>Назад</Button>
                    {isOwner && (
                        <div>
                            <Button
                                variant="outline-primary"
                                className="me-2"
                                onClick={() => setShowEdit(true)}
                            >
                                Редактировать
                            </Button>
                            <Button variant="outline-danger" onClick={handleDelete}>
                                Удалить
                            </Button>
                        </div>
                    )}
                </Card.Footer>
            </Card>

            <Modal show={showEdit} onHide={() => setShowEdit(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Редактировать отзыв #{review.number}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {error && <Alert variant="danger">{error}</Alert>}
                    <Form>
                        <Form.Group className="mb-3">
                            <Form.Label>Оценка</Form.Label>
                            <Form.Control
                                type="number" step="0.1"
                                value={editScore}
                                onChange={e => setEditScore(e.target.value)}
                            />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Комментарий</Form.Label>
                            <Form.Control
                                as="textarea" rows={4}
                                value={editCommentary}
                                onChange={e => setEditCommentary(e.target.value)}
                            />
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowEdit(false)} disabled={saving}>
                        Отмена
                    </Button>
                    <Button variant="primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Сохранение...' : 'Сохранить'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default observer(ReviewPage);
