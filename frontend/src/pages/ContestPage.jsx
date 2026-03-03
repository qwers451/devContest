import React, { useEffect, useContext, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Context } from '../main.jsx';
import { Container, Card, Badge, Button } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import Markdown from 'markdown-to-jsx';
import { downloadFileOrZip, deleteData } from '../services/apiService.js';

const ContestPage = () => {
    const { contest, user } = useContext(Context);
    const { number } = useParams();
    const [ currentContest, setCurrentContest ] = useState(null);
    const [ error, setError ] = useState(null);

    const navigate = useNavigate();

    useEffect(() => {
        if (contest.currentContest && contest.currentContest.number == number) {
            setCurrentContest(contest.currentContest);
        } else {
            const fetchContest = async () => {
                const fetched = await contest.fetchOneContestByNumber(number);
                if (fetched) {
                    setCurrentContest(fetched);
                } else {
                    setError("Конкурс не найден.");
                }
            };
            fetchContest();
        }
    }, [number, contest.currentContest]);

    useEffect(() => {
        contest.fetchTypes();
    }, [])

    if (error) {
        return <div>{error}</div>;
    }

    if (!currentContest) {
        return <div>Загрузка...</div>;
    }

    const isFreelancer = user.user && user.user.role === 1;
    const isAdmin = user.user && user.user.role === 3;

    const handleDelete = async () => {
        if (!window.confirm('Вы точно хотите удалить этот конкурс?')) return;
        try {
            await deleteData(`/contests/${currentContest.id}`, {
                headers: { 'X-User-Role': user.user.role }
            });
            navigate('/');  // после успешного удаления возвращаемся на главную
        } catch (e) {
            console.error(e);
            alert('Не удалось удалить конкурс');
        }
    };

    return (
        <Container>
            <Card className="mb-4 shadow-sm">
                <Card.Header>
                    <Card.Title>
                        <h1>{currentContest.title}</h1>
                    </Card.Title>
                    <h2>
                        <Badge bg="secondary" className="">
                            {contest.getTypeNameById(currentContest.type)}
                        </Badge>
                        <Badge className="ms-2" bg={currentContest.status === 1 ? 'success' : 'danger'}>
                            {contest.getStatus(currentContest.status)}
                        </Badge>
                    </h2>
                    <h4 className="mb-1">Дата окончания: {(new Date(currentContest.endBy)).toLocaleDateString('ru-RU', {})}<span className="ms-3">Приз: {currentContest.prizepool} руб.</span></h4>
                </Card.Header>
                <Card.Body>
                    <Card.Subtitle className="mb-1"><h2>Описание проекта</h2></Card.Subtitle>
                        <Markdown options={{ disableParsingRawHTML: true }}>
                            {currentContest.description}
                        </Markdown>

                        {currentContest.files && currentContest.files.length > 0 && (
                            <>
                                <hr />
                                <h4>Файлы:</h4>
                                <ul>
                                    {currentContest.files.map((filePath, index) => {
                                        const fileName = filePath.split('/').pop();
                                        // получаем относительный путь без "/static/"
                                        const relativePath = filePath.replace('/static/', '');

                                        return (
                                            <li key={index}>
                                                <Button
                                                    variant="link"
                                                    className="me-2 p-0"
                                                    onClick={() =>
                                                        downloadFileOrZip(`/files/${relativePath}`, fileName)
                                                    }
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
                                        downloadFileOrZip(
                                            `/download-folder/${folderPath}`,
                                            `contest_${currentContest.number}`
                                        );
                                    }}
                                >
                                    Скачать всё
                                </Button>
                            </>
                        )}
                </Card.Body>
                {isFreelancer && 
                    <Card.Footer>
                        <Button variant="primary" onClick={() => navigate(`/contest/${currentContest.number}/create-solution`)}>
                            Создать решение
                        </Button>
                    </Card.Footer>
                }
                {(isAdmin || user.getCurrentUserId() === currentContest.employerId) &&
                    <Card.Footer>
                        <Button variant="primary" onClick={() => navigate(`/contest/${currentContest.number}/solutions`)}>
                            Просмотреть решения
                        </Button>
                        {user.getCurrentUserId() === currentContest.employerId &&
                            <Button
                                variant="primary"
                                className="ms-2"
                                onClick={() => navigate(
                                    `/contest/edit/${currentContest.number}`,
                                    { state: JSON.parse(JSON.stringify(currentContest)) })}
                            >
                                Редактировать конкурс
                            </Button>
                        }

                        {isAdmin && (
                            <Button
                                variant="danger"
                                className="ms-auto"
                                onClick={handleDelete}
                            >
                                Удалить конкурс
                            </Button>
                        )}
                    </Card.Footer>
                }
            </Card>
        </Container>
    );
};

export default observer(ContestPage);
