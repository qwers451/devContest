import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {Container, Card, Row, Col, Spinner, Alert, Button} from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import { Context } from '../main.jsx';
import { fetchData } from '../services/apiService.js';

const SolutionReviews = () => {
    const { number } = useParams();
    const navigate    = useNavigate();
    const { solution, user } = useContext(Context);

    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    useEffect(() => {
        (async () => {
            setError(null);
            setLoading(true);
            try {
                // только владелец может смотреть отзывы
                const sol = solution.getSolutionIfExists(number)
                    || await solution.fetchSolutionByNumber(number);
                if (!sol) throw new Error('Решение не найдено');

                const isOwner    = user.user?.id === sol.freelancerId;
                const isEmployer = user.user?.role === 2;
                if (!user.isAuth || (!isOwner && !isEmployer)) {
                    throw new Error('Доступ запрещён');
                }

                const data = await fetchData(`/solutions/${sol.id}/reviews`);
                setReviews(data);
            } catch (err) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [number]);

    if (loading) {
        return (
            <Container className="mt-4 text-center">
                <Spinner animation="border" /><p>Загрузка отзывов...</p>
            </Container>
        );
    }
    if (error) {
        return (
            <Container className="mt-4">
                <Alert variant="danger">{error}</Alert>
            </Container>
        );
    }

    return (
        <Container className="mt-4">
            <h2>Отзывы к решению №{number}</h2>
            {reviews.length === 0 ? (
                <p>Ещё нет отзывов.</p>
            ) : (
                <Row xs={1} md={2} className="g-4">
                    {reviews.map(r => (
                        <Col key={r.number}>
                            <Card
                                className="h-100 shadow-sm"
                                onClick={() => navigate(`/solution/${number}/review/${r.number}`)}
                                style={{ cursor: 'pointer' }}
                            >
                                <Card.Body>
                                    <Card.Title>Ревью #{r.number}</Card.Title>
                                    <Card.Text>
                                        {r.commentary.length > 100
                                            ? r.commentary.slice(0, 100) + '…'
                                            : r.commentary
                                        }
                                    </Card.Text>
                                </Card.Body>
                                <Card.Footer>
                                    <small className="text-muted">Оценка: {r.score}</small>
                                </Card.Footer>
                            </Card>
                        </Col>
                    ))}
                </Row>
            )}
            {/* Кнопка «Назад» к странице решения */}
            <div className="mt-4">
                 <Button variant="secondary" onClick={() => navigate(`/solution/${number}`)}>
                      Назад к решению
                 </Button>
            </div>
        </Container>
    );
};

export default observer(SolutionReviews);
