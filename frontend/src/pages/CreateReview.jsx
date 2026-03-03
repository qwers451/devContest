import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import { Context } from '../main.jsx';
import { fetchData, sendData } from '../services/apiService.js';

const CreateReview = () => {
    const { number } = useParams();           // solution number в маршруте
    const navigate = useNavigate();
    const { solution, user } = useContext(Context);

    const [currentSolution, setCurrentSolution] = useState(null);
    const [loadingSolution, setLoadingSolution] = useState(true);
    const [loadError, setLoadError] = useState(null);

    const [score, setScore] = useState('');
    const [commentary, setCommentary] = useState('');
    const [submitError, setSubmitError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // 1. Загрузка решения по его номеру, чтобы получить _id
    useEffect(() => {
        (async () => {
            try {
                // Попробуем взять из store
                let sol = solution.getSolutionIfExists(number);
                if (!sol) {
                    sol = await solution.fetchSolutionByNumber(number);
                }
                if (!sol) throw new Error('Решение не найдено');
                setCurrentSolution(sol);
            } catch (err) {
                setLoadError(err.message);
            } finally {
                setLoadingSolution(false);
            }
        })();
    }, [number]);

    // 2. Проверка прав (только организатор может добавлять отзыв)
    useEffect(() => {
        if (!loadingSolution && !loadError) {
            if (!user.isAuth || user.user.role !== 2) {
                // нет доступа — возвращаем на страницу решения
                navigate(`/solution/${number}`, { replace: true });
            }
        }
    }, [loadingSolution, loadError, user.isAuth, user.user, navigate, number]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitError(null);

        if (!score || !commentary) {
            setSubmitError('Заполните все поля');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                score: parseFloat(score),
                commentary: commentary.trim(),
                reviewerId: user.user.id
            };
            // POST /api/solutions/{id}/reviews
            await sendData(`/solutions/${currentSolution.id}/reviews`, payload);
            // Возврат на страницу решения
            navigate(`/solution/${number}`);
        } catch (err) {
            setSubmitError(err.response?.data?.error || 'Не удалось отправить отзыв');
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingSolution) {
        return (
            <Container className="mt-4 text-center">
                <Spinner animation="border" role="status" /><br/>
                Загрузка решения...
            </Container>
        );
    }

    if (loadError) {
        return (
            <Container className="mt-4">
                <Alert variant="danger">Ошибка: {loadError}</Alert>
            </Container>
        );
    }

    return (
        <Container style={{ maxWidth:  '600px', marginTop: '40px' }}>
            <h2 className="mb-4">Добавить отзыв к решению №{number}</h2>

            {submitError && <Alert variant="danger">{submitError}</Alert>}

            <Form onSubmit={handleSubmit}>
                <Form.Group controlId="reviewScore" className="mb-3">
                    <Form.Label>Оценка</Form.Label>
                    <Form.Control
                        type="number"
                        step="0.1"
                        min="0"
                        max="10"
                        value={score}
                        onChange={e => setScore(e.target.value)}
                        placeholder="Например, 8.5"
                        required
                    />
                </Form.Group>

                <Form.Group controlId="reviewCommentary" className="mb-3">
                    <Form.Label>Комментарий</Form.Label>
                    <Form.Control
                        as="textarea"
                        rows={5}
                        value={commentary}
                        onChange={e => setCommentary(e.target.value)}
                        placeholder="Ваши замечания и рекомендации"
                        required
                    />
                </Form.Group>

                <div className="d-flex justify-content-between">
                    <Button
                        variant="secondary"
                        onClick={() => navigate(`/solution/${number}`)}
                        disabled={submitting}
                    >
                        Отмена
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={submitting}
                    >
                        {submitting ? 'Отправка...' : 'Добавить отзыв'}
                    </Button>
                </div>
            </Form>
        </Container>
    );
};

export default observer(CreateReview);
