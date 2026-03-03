import { useEffect, useContext, useState, useCallback } from 'react';
import { Container, Form, Button, Modal, Card } from 'react-bootstrap';
import { Context } from '../main.jsx';
import { sendData } from '../services/apiService.js';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { observer } from "mobx-react-lite";
import Markdown from 'markdown-to-jsx';

const CreateSolution = () => {
    const { contest, solution, user } = useContext(Context);
    const { number } = useParams();
    const [error, setError] = useState(null);
    const location = useLocation();
    const solutionData = location.state;
    const navigate = useNavigate();

    useEffect(() => {
        const fetch = async () => {
            if (contest.currentContest && contest.currentContest.number == number) {
                contest.setCurrentContest(contest.currentContest);
            } else {
                const fetched = await contest.fetchOneContestByNumber(number);
                if (fetched) {
                    contest.setCurrentContest(fetched);
                } else {
                    setError("Конкурс не найден.");
                }
            }
        };
        fetch();
    }, [number, contest]);

    const contestId = contest.currentContest?.id;

    const [files, setFiles] = useState([]);
    const [imagesMap, setImagesMap] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [mdDescription, setMdDescription] = useState('');
    const [state, setState] = useState(false);
    const [submitURL, setSubmitURL] = useState('/solutions');

    const handleClosePreview = () => setShowPreview(false);
    const handleShowPreview = () => setShowPreview(true);
    const handleCloseHelp = () => setShowHelp(false);
    const handleShowHelp = () => setShowHelp(true);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!solution.validateForm()) {
            return;
        }

        if (!user.isAuth || !user.user?.id) {
            alert('Необходимо авторизоваться, чтобы добавить решение');
            navigate('/login');
            return;
        }

        const formData = new FormData();
        files.forEach(file => {
            formData.append('files[]', file);
        });

        const data = {
            contestId,
            freelancerId: user.user.id,
            title: solution.form.title.value,
            annotation: solution.form.annotation.value,
            description: solution.form.description.value
        };

        formData.append('data', JSON.stringify(data));

        try {
            const res = await sendData(submitURL, formData, true);
            solution.resetForm();
            navigate(-1);
            alert(`Решение успешно ${state ? 'изменёно' : 'отправлено'}!`);
            console.log('Ответ сервера:', res);
        } catch (error) {
            console.error('Ошибка при отправке решения:', error);
            alert(`Ошибка при ${state ? 'редактировании' : 'отправке'} решения`);
        }
    };

    useEffect(() => {
        if (!number) {
            setState(false);
            setSubmitURL('/my-solutions');
            solution.resetForm();
        }
        if (solutionData) {
            console.log(solutionData);
            setState(true);
            setSubmitURL(`/solution/${solutionData.number}/edit`);
            solution.setFormField('title', solutionData.title);
            solution.setFormField('annotation', solutionData.annotation);
            solution.setFormField('description', solutionData.description);
        }
    }, [number, solutionData]);

    const handleFilesChange = useCallback((newFiles) => {
        const allowedTypes = solution.form.files.allowedTypes;
        const validFiles = Array.from(newFiles).filter(file => allowedTypes.includes(file.type));

        if (validFiles.length > solution.form.files.rules.max) {
            solution.form.files.error = solution.formErrors.files;
        } else {
            solution.form.files.error = '';
        }

        const newMap = {};
        validFiles.forEach(file => {
            if (file.type.startsWith('image/')) {
                newMap[file.name] = URL.createObjectURL(file);
            }
        });

        Object.values(imagesMap).forEach(URL.revokeObjectURL);
        setFiles(validFiles);
        setImagesMap(newMap);
    }, [imagesMap, solution]);

    useEffect(() => {
        return () => {
            Object.values(imagesMap).forEach(URL.revokeObjectURL);
        };
    }, [imagesMap]);

    const regex = /(!\[[^\]]*\])\(([^)]+)\)/g;
    useEffect(() => {
        const updatedMarkdown = solution.form.description.value.replace(regex, (match, p1, p2) => {
            return imagesMap[p2] ? `${p1}(${imagesMap[p2]})` : `${p1}(${p2})`;
        });
        setMdDescription(updatedMarkdown);
    }, [solution.form.description.value, imagesMap]);

    useEffect(() => {
        return () => {
            solution.resetForm();
        };
    }, [solution]);

    if (error) return <div>{error}</div>;

    return (
        <Container className="mt-4">
            <h1 className="mb-4">{state ? 'Редактирование решения' : 'Создание решения' }</h1>
            <Form noValidate onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                    <Form.Control
                        placeholder="Название"
                        value={solution.form.title.value}
                        onChange={(e) => solution.setFormField('title', e.target.value)}
                        isInvalid={solution.form.title.error.length > 0}
                        isValid={solution.form.title.error === '' && !!solution.form.title.value}
                    />
                    <Form.Control.Feedback type="invalid">
                        {solution.form.title.error}
                    </Form.Control.Feedback>
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Control
                        placeholder="Аннотация"
                        value={solution.form.annotation.value}
                        onChange={e => solution.setFormField('annotation', e.target.value)}
                        isInvalid={solution.form.annotation.error.length > 0}
                        isValid={solution.form.annotation.error === '' && !!solution.form.annotation.value}
                        required
                    />
                    <Form.Control.Feedback type="invalid">
                        {solution.form.annotation.error}
                    </Form.Control.Feedback>
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Control
                        as="textarea"
                        rows={10}
                        placeholder="Описание"
                        value={solution.form.description.value}
                        onChange={e => solution.setFormField('description', e.target.value)}
                        isInvalid={solution.form.description.error.length > 0}
                        isValid={solution.form.description.error === '' && !!solution.form.description.value}
                        required
                    />
                    <Form.Control.Feedback type="invalid">
                        {solution.form.description.error}
                    </Form.Control.Feedback>
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Control
                        type="file"
                        multiple
                        onChange={e => handleFilesChange(e.target.files)}
                        isInvalid={solution.form.files.error.length > 0}
                    />
                    <Form.Control.Feedback type="invalid">
                        {solution.form.files.error}
                    </Form.Control.Feedback>
                    <Form.Text className="text-muted">
                        Поддерживаемые форматы: .zip, .png, .jpg, .jpeg, .gif. Не более {solution.form.files.rules.max} файлов.
                    </Form.Text>
                </Form.Group>
                <Button className="me-3" type="submit">Отправить</Button>
                <Button className="me-3" onClick={handleShowPreview}>Предпросмотр</Button>
                <Button className="me-3" onClick={handleShowHelp}>Справка</Button>
                {state && 
                    <Button
                        className="me-3"
                        onClick={() => navigate(-1)}
                    >
                        Отменить редактирование
                    </Button>
                }
            </Form>

            <Modal show={showPreview} onHide={handleClosePreview} size="xl" centered scrollable>
                <Modal.Header>
                    <Modal.Title>Предпросмотр решения</Modal.Title>
                </Modal.Header>

                <Modal.Body style={{ overflowY: 'auto' }}>
                    <Card className="mb-4 shadow-sm">
                        <Card.Header className="position-relative">
                            <div className="d-flex justify-content-between align-items-start flex-wrap">
                                <div>
                                    <Card.Title className="mb-2">
                                        <h1>{solution.form.title.value || 'Без названия'}</h1>
                                    </Card.Title>
                                    <h5 className="text-muted mb-2">
                                        Конкурс «{contest.currentContest?.title || 'Неизвестный конкурс'}» от {user.getById(contest.currentContest?.employerId)?.login || 'Неизвестно'}
                                    </h5>
                                    <div className="d-inline-block">
                                        <span
                                            style={{
                                                display: 'inline-block',
                                                fontSize: '1.4rem',
                                                fontWeight: '700',
                                                lineHeight: '1',
                                                color: solution.getStatus(1).textColor,
                                                backgroundColor: solution.getStatus(1).color,
                                                padding: '0.35em 0.65em',
                                                borderRadius: '0.375rem',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {solution.getStatus(1).label}
                                        </span>
                                    </div>
                                </div>

                                <div className="text-end d-flex flex-column justify-content-center align-items-end ms-auto mt-2">
                                    <h5 className="text-muted">
                                        {user.user?.login || "Вы"}
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
                                <h5 className="mb-1"><strong>Создано:</strong> —</h5>
                            </div>
                        </Card.Header>

                        <Card.Body>
                            <Card.Subtitle className="mb-2">
                                <h2>Описание:</h2>
                            </Card.Subtitle>

                            <Markdown options={{ disableParsingRawHTML: true }}>
                                {mdDescription}
                            </Markdown>

                            {files.length > 0 && (
                                <>
                                    <hr />
                                    <h4>Файлы:</h4>
                                    <ul>
                                        {files.map((file, idx) => (
                                            <li key={idx}>
                                                <Button variant="link" className="me-2 p-0">
                                                    {file.name}
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                    <Button variant="success" disabled>
                                        Скачать всё
                                    </Button>
                                </>
                            )}
                        </Card.Body>

                        <Card.Footer className="d-flex justify-content-between flex-wrap align-items-center gap-2">
                            <div className="d-flex flex-wrap gap-2">
                                <Button variant="secondary" size="sm" disabled>
                                    Перейти к конкурсу
                                </Button>
                                <Button variant="primary" size="sm" disabled>
                                    Перейти к моим решениям
                                </Button>
                            </div>

                            <div className="d-flex flex-wrap gap-2">
                                <Button variant="success" size="sm" disabled>
                                    Редактировать решение
                                </Button>
                                <Button variant="danger" size="sm" disabled>
                                    Удалить решение
                                </Button>
                            </div>
                        </Card.Footer>
                    </Card>
                </Modal.Body>

                <Modal.Footer>
                    <Button variant="primary" onClick={handleClosePreview}>
                        Закрыть предпросмотр
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal show={showHelp} onHide={handleCloseHelp} size="lg" centered>
                <Modal.Header>
                    <Modal.Title>Справка по оформлению</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div style={{ whiteSpace: 'pre-line' }}>
                        Название должно содержать от {solution.form.title.rules.min} до {solution.form.title.rules.max} символов.<br />
                        Аннотация должна содержать от {solution.form.annotation.rules.min} до {solution.form.annotation.rules.max} символов.<br />
                        Описание должно содержать от {solution.form.description.rules.min} до {solution.form.description.rules.max} символов.<br />
                        Файлы: zip-архивы и изображения (.zip, .png, .jpg, .jpeg, .gif.), не более {solution.form.files.rules.max} штук.<br />
                        <br />
                        Используйте Markdown для оформления описания.<br />
                        Подробнее:{" "}
                            <a href="https://www.markdownguide.org/cheat-sheet/" target="_blank" rel="noopener noreferrer">
                            https://www.markdownguide.org/cheat-sheet/
                            </a><br />
                        <br />
                        Пример вставки изображения в Markdown-описание:<br />
                        ![alt](image.jpg)<br />
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="primary" onClick={handleCloseHelp}>Закрыть</Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default observer(CreateSolution);
