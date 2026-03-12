import React, { useEffect, useContext, useState, useCallback } from 'react';
import { Container, Form, Button, Dropdown, Modal, Card, Badge } from 'react-bootstrap';
import { Context } from '../main.jsx';
import { sendData } from '../services/apiService.js';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { observer } from "mobx-react-lite";
import Markdown from 'markdown-to-jsx'

const CreateContest = () => {
    const { contest, user } = useContext(Context);
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const contestData = location.state;

    const [files, setFiles] = useState([]);
    const [imagesMap, setImagesMap] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [mdDescription, setMdDescription] = useState('');
    const [state, setState] = useState(false);
    const [submitURL, setSubmitURL] = useState('/contests');

    const handleClosePreview = () => setShowPreview(false);
    const handleShowPreview = () => setShowPreview(true);
    const handleCloseHelp = () => setShowHelp(false);
    const handleShowHelp = () => setShowHelp(true);

    useEffect(() => {
        contest.fetchTypes();
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!contest.validateForm()) {
            return;
        }

        if (!user.isAuth || !user.user?.id) {
            alert('Для создания конкурса необходимо войти в систему');
            navigate('/login');
            return;
        }

        let date = new Date(contest.form.endBy.value)
        date.setUTCHours(23, 59, 59, 999);

        const stages = contest.stages
            .filter(s => s.name.trim())
            .map((s, i) => ({
                name: s.name,
                description: s.description || undefined,
                deadline: s.deadline ? new Date(s.deadline).toISOString() : undefined,
                order: i + 1,
            }));

        const data = {
            title: contest.form.title.value,
            annotation: contest.form.annotation.value,
            prizepool: parseInt(contest.form.prizepool.value),
            description: contest.form.description.value,
            ends_at: date.toISOString(),
            type_id: Number(contest.form.type.value),
            tz_text: contest.form.tz_text.value || undefined,
            stages,
        };

        try {
            const res = await sendData(submitURL, data);
            contest.resetForm();
            navigate(-1);
            alert(`Конкурс успешно ${state ? 'изменён' : 'добавлен'}!`);
            console.log('Ответ сервера:', res);
        } catch (error) {
            console.error("Ошибка при отправке:", error);
            alert(`Ошибка при ${state ? 'редактировании' : 'создании'} конкурса`);
        }
    };

    useEffect(() => {
        if (!id) {
            setState(false);
            setSubmitURL('/contests');
            contest.resetForm();
        }
        if (contestData) {
            setState(true);
            setSubmitURL(`/contests/${contestData.id}`);
            contest.setFormField('type', contestData.type_id);
            contest.setFormField('title', contestData.title);
            contest.setFormField('annotation', contestData.annotation);
            contest.setFormField('description', contestData.description);
            contest.setFormField('tz_text', contestData.tz_text || '');
            contest.setFormField('prizepool', contestData.prizepool);
            contest.setFormField('endBy', (new Date(contestData.ends_at)).toISOString().split('T')[0]);
        }
    }, [id, contestData]);

    const handleFilesChange = useCallback((newFiles) => {
        const allowedTypes = contest.form.files.allowedTypes;
        const validFiles = Array.from(newFiles).filter(file => allowedTypes.includes(file.type));

        if (validFiles.length > contest.form.files.rules.max) {
            contest.form.files.error = contest.formErrors.files;
        } else {
            contest.form.files.error = '';
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
    }, [imagesMap, contest]);

    useEffect(() => {
        return () => {
            Object.values(imagesMap).forEach(URL.revokeObjectURL);
        };
    }, [imagesMap]);

    useEffect(() => {
        const updatedMarkdown = contest.form.description.value.replace(regex, (match, p1, p2) => {
            return imagesMap[p2] ? `${p1}(${imagesMap[p2]})` : `${p1}(${p2})`;
        });
        setMdDescription(updatedMarkdown);
    }, [contest.form.description.value, imagesMap]);

    useEffect(() => {
        return () => {
            contest.resetForm();
        };
    }, []);

    const regex = /(!\[[^\]]*\])\(([^)]+)\)/g;

    return (
        <Container className="mt-4">
            <h1 className="mb-4">{state ? 'Редактировать конкурс' : 'Добавить конкурс'}</h1>
            <Form noValidate onSubmit={handleSubmit}>

                {/* Тип конкурса */}
                <Form.Group className="mb-3">
                    <Dropdown>
                        <Dropdown.Toggle
                            variant={contest.form.type.error ? 'danger' : contest.form.type.value ? 'success' : 'primary'}
                        >
                            {contest.form.type.value ? contest.getTypeNameById(contest.form.type.value) : "Выберите тип"}
                        </Dropdown.Toggle>
                        <Dropdown.Menu>
                            {contest.types.map((t) => (
                                <Dropdown.Item key={t.id} onClick={() => contest.setFormField('type', t.id)}>
                                    {t.name}
                                </Dropdown.Item>
                            ))}
                        </Dropdown.Menu>
                    </Dropdown>
                    {contest.form.type.error && (
                        <Form.Control.Feedback type="invalid" style={{ display: 'block' }}>
                            {contest.form.type.error}
                        </Form.Control.Feedback>
                    )}
                </Form.Group>

                {/* Название */}
                <Form.Group className="mb-3">
                    <Form.Control
                        placeholder="Название"
                        value={contest.form.title.value}
                        onChange={(e) => contest.setFormField('title', e.target.value)}
                        isInvalid={contest.form.title.error.length > 0}
                        isValid={contest.form.title.error === '' && !!contest.form.title.value}
                    />
                    <Form.Control.Feedback type="invalid">
                        {contest.form.title.error}
                    </Form.Control.Feedback>
                </Form.Group>

                {/* Краткое описание */}
                <Form.Group className="mb-3">
                    <Form.Control
                        placeholder="Краткое описание"
                        value={contest.form.annotation.value}
                        onChange={e => contest.setFormField('annotation', e.target.value)}
                        isInvalid={contest.form.annotation.error.length > 0}
                        isValid={contest.form.annotation.error === '' && !!contest.form.annotation.value}
                    />
                    <Form.Control.Feedback type="invalid">
                        {contest.form.annotation.error}
                    </Form.Control.Feedback>
                </Form.Group>

                {/* Полное описание */}
                <Form.Group className="mb-3">
                    <Form.Control
                        as="textarea"
                        rows={10}
                        placeholder="Полное описание"
                        value={contest.form.description.value}
                        onChange={e => contest.setFormField('description', e.target.value)}
                        isInvalid={contest.form.description.error.length > 0}
                        isValid={contest.form.description.error === '' && !!contest.form.description.value}
                    />
                    <Form.Control.Feedback type="invalid">
                        {contest.form.description.error}
                    </Form.Control.Feedback>
                </Form.Group>

                {/* Техническое задание */}
                <Form.Group className="mb-3">
                    <Form.Label className="fw-semibold">Техническое задание</Form.Label>
                    <Form.Control
                        as="textarea"
                        rows={6}
                        placeholder="Опишите требования к работе — ИИ использует их для автоматической оценки решений"
                        value={contest.form.tz_text.value}
                        onChange={e => contest.setFormField('tz_text', e.target.value)}
                    />
                    <Form.Text className="text-muted">
                        Необязательно. Используется для автоматической оценки решений с помощью LLaMA.
                    </Form.Text>
                </Form.Group>

                {/* Приз */}
                <Form.Group className='mb-3'>
                    <Form.Control
                        placeholder="Приз"
                        type="number"
                        value={contest.form.prizepool.value}
                        onChange={e => contest.setFormField('prizepool', e.target.value)}
                        isInvalid={contest.form.prizepool.error.length > 0}
                        isValid={contest.form.prizepool.error === '' && !!contest.form.prizepool.value}
                    />
                    <Form.Control.Feedback type="invalid">
                        {contest.form.prizepool.error}
                    </Form.Control.Feedback>
                </Form.Group>

                {/* Дата окончания */}
                <Form.Group className="mb-3">
                    <Form.Control
                        type="date"
                        value={contest.form.endBy.value}
                        onChange={e => contest.setFormField('endBy', e.target.value)}
                        isInvalid={contest.form.endBy.error.length > 0}
                        isValid={contest.form.endBy.error === '' && !!contest.form.endBy.value}
                    />
                    <Form.Control.Feedback type="invalid">
                        {contest.form.endBy.error}
                    </Form.Control.Feedback>
                </Form.Group>

                {/* Этапы конкурса */}
                <div className="mb-4">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                        <h5 className="mb-0">Этапы конкурса</h5>
                        <Button variant="outline-primary" size="sm" onClick={() => contest.addStage()}>
                            + Добавить этап
                        </Button>
                    </div>
                    {contest.stages.length === 0 && (
                        <p className="text-muted small mb-0">Необязательно. Разбейте работу на части с отдельными дедлайнами.</p>
                    )}
                    {contest.stages.map((stage, index) => (
                        <Card key={index} className="mb-2">
                            <Card.Body className="p-2">
                                <div className="d-flex gap-2 align-items-start">
                                    <Badge bg="secondary" className="mt-2 flex-shrink-0">{stage.order}</Badge>
                                    <div className="flex-grow-1">
                                        <Form.Control
                                            className="mb-1"
                                            placeholder="Название этапа *"
                                            value={stage.name}
                                            onChange={e => contest.updateStage(index, 'name', e.target.value)}
                                        />
                                        <Form.Control
                                            className="mb-1"
                                            placeholder="Описание этапа (необязательно)"
                                            value={stage.description}
                                            onChange={e => contest.updateStage(index, 'description', e.target.value)}
                                        />
                                        <Form.Control
                                            type="date"
                                            value={stage.deadline}
                                            onChange={e => contest.updateStage(index, 'deadline', e.target.value)}
                                        />
                                    </div>
                                    <Button
                                        variant="outline-danger"
                                        size="sm"
                                        className="flex-shrink-0"
                                        onClick={() => contest.removeStage(index)}
                                    >
                                        ✕
                                    </Button>
                                </div>
                            </Card.Body>
                        </Card>
                    ))}
                </div>

                {/* Файлы */}
                <Form.Group className="mb-3">
                    <Form.Control
                        type="file"
                        multiple
                        onChange={e => handleFilesChange(e.target.files)}
                        isInvalid={contest.form.files.error.length > 0}
                    />
                    <Form.Control.Feedback type="invalid">
                        {contest.form.files.error}
                    </Form.Control.Feedback>
                    <Form.Text className="text-muted">
                        Поддерживаемые форматы: .zip, .png, .jpg, .jpeg, .gif. Не более {contest.form.files.rules.max} файлов.
                    </Form.Text>
                </Form.Group>

                <Button className="me-3" type="submit">Опубликовать</Button>
                <Button className="me-3" onClick={handleShowPreview}>Предпросмотр</Button>
                <Button className="me-3" onClick={handleShowHelp}>Справка</Button>
                {state &&
                    <Button className="me-3" onClick={() => navigate(-1)}>
                        Отменить редактирование
                    </Button>
                }
            </Form>

            {/* Preview modal */}
            <Modal show={showPreview} onHide={handleClosePreview} size='xl' centered scrollable>
                <Modal.Body style={{ overflowY: 'auto' }}>
                    <Card className="mb-4 shadow-sm">
                        <Card.Header>
                            <Card.Title>
                                <h1>{contest.form.title.value}</h1>
                            </Card.Title>
                            <h2>
                                <Badge bg="secondary">
                                    {contest.form.type.value ? contest.getTypeNameById(contest.form.type.value) : 'Тип'}
                                </Badge>
                                <Badge className="ms-2" bg={'success'}>
                                    {contest.getStatus('active')}
                                </Badge>
                            </h2>
                            <h4 className="mb-1">
                                Дата окончания: {(new Date(contest.form.endBy.value)).toLocaleDateString('ru-RU', {})}
                                <span className="ms-3">Приз: {contest.form.prizepool.value} руб.</span>
                            </h4>
                        </Card.Header>
                        <Card.Body>
                            <Card.Subtitle className="mb-1"><h2>Описание проекта</h2></Card.Subtitle>
                            <Markdown options={{ disableParsingRawHTML: true }}>
                                {mdDescription}
                            </Markdown>

                            {contest.form.tz_text.value && (
                                <>
                                    <hr />
                                    <h4>Техническое задание</h4>
                                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                                        {contest.form.tz_text.value}
                                    </pre>
                                </>
                            )}

                            {contest.stages.length > 0 && (
                                <>
                                    <hr />
                                    <h4>Этапы</h4>
                                    {contest.stages.map((stage, i) => (
                                        <div key={i} className="d-flex align-items-start mb-2">
                                            <Badge bg="secondary" className="me-2 flex-shrink-0">{stage.order}</Badge>
                                            <div>
                                                <strong>{stage.name || '(без названия)'}</strong>
                                                {stage.deadline && (
                                                    <span className="ms-2 text-muted small">
                                                        до {new Date(stage.deadline).toLocaleDateString('ru-RU')}
                                                    </span>
                                                )}
                                                {stage.description && <div className="text-muted small">{stage.description}</div>}
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}

                            {files.length > 0 && (
                                <>
                                    <hr />
                                    <h4>Файлы:</h4>
                                    <ul>
                                        {files.map((file, idx) => (
                                            <li key={idx}>
                                                <Button variant="link" className="me-2 p-0">{file.name}</Button>
                                            </li>
                                        ))}
                                    </ul>
                                    <Button variant="success" disabled>Скачать всё</Button>
                                </>
                            )}
                        </Card.Body>
                        <Card.Footer>
                            <Button variant="primary">Добавить решение</Button>
                        </Card.Footer>
                    </Card>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant='primary' onClick={handleClosePreview}>Закрыть предпросмотр</Button>
                </Modal.Footer>
            </Modal>

            {/* Help modal */}
            <Modal show={showHelp} onHide={handleCloseHelp} size='lg' centered>
                <Modal.Header>
                    <Modal.Title>Справка</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div style={{ whiteSpace: 'pre-line' }}>
                        Для создания конкурса распишите подробно всю информацию в поле "Полное описание" в формате Markdown.
                        <br /><br />
                        Справка:{" "}
                        <a href="https://www.markdownguide.org/cheat-sheet/" target="_blank" rel="noopener noreferrer">
                            https://www.markdownguide.org/cheat-sheet/
                        </a>
                        <br /><br />
                        Чтобы отобразить изображения загруженных файлов, укажите вместо ссылки название файла — ![Image](image.png)
                        <br /><br />
                        <strong>Техническое задание</strong> — структурированные требования к работе. ИИ (LLaMA) автоматически оценит каждое решение по этим критериям.
                        <br /><br />
                        <strong>Этапы</strong> — разбейте работу на части с отдельными дедлайнами. Необязательно.
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant='primary' onClick={handleCloseHelp}>Закрыть справку</Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default observer(CreateContest);
