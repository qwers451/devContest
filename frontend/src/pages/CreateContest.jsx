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
    // false - добавление конкурса, true - редактирование
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

        const formData = new FormData();
        files.forEach(file => {
            formData.append('files[]', file);
        })

        let date = new Date(contest.form.endBy.value)
        date.setUTCHours(23, 59, 59, 999);

        const data = {
            employerId: user.user.id,
            title: contest.form.title.value,
            annotation: contest.form.annotation.value,
            prizepool: parseInt(contest.form.prizepool.value),
            description: contest.form.description.value,
            endBy: date.toISOString(),
            type: String(contest.form.type.value), 
            status: 1
        };

        formData.append('data', JSON.stringify(data));

        try {
            const res = await sendData(submitURL, formData, true);
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
            console.log(contestData);
            setState(true);
            setSubmitURL(`/contest/edit/${contestData.number}`);
            contest.setFormField('type', contestData.type);
            contest.setFormField('title', contestData.title);
            contest.setFormField('annotation', contestData.annotation);
            contest.setFormField('description', contestData.description);
            contest.setFormField('prizepool', contestData.prizepool);
            contest.setFormField('endBy', (new Date(contestData.endBy)).toISOString().split('T')[0]);
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
            <h1 className="mb-4">{state ? 'Редактировать конкурс' : 'Добавить конкурс' }</h1>
            <Form noValidate onSubmit={handleSubmit}>
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
                <Form.Group className="mb-3">
                    <Form.Control
                        placeholder="Краткое описание"
                        value={contest.form.annotation.value}
                        onChange={e => contest.setFormField('annotation', e.target.value)}
                        isInvalid={contest.form.annotation.error.length > 0}
                        isValid={contest.form.annotation.error === '' && !!contest.form.annotation.value}
                        required
                    />
                    <Form.Control.Feedback type="invalid">
                        {contest.form.annotation.error}
                    </Form.Control.Feedback>
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Control
                        as="textarea"
                        rows={10}
                        placeholder="Полное описание"
                        value={contest.form.description.value}
                        onChange={e => contest.setFormField('description', e.target.value)}
                        isInvalid={contest.form.description.error.length > 0}
                        isValid={contest.form.description.error === '' && !!contest.form.description.value}
                        required
                    />
                    <Form.Control.Feedback type="invalid">
                        {contest.form.description.error}
                    </Form.Control.Feedback>
                </Form.Group>
                <Form.Group className='mb-3'>
                    <Form.Control
                        placeholder="Приз"
                        type="number"
                        value={contest.form.prizepool.value}
                        onChange={e => contest.setFormField('prizepool', e.target.value)}
                        isInvalid={contest.form.prizepool.error.length > 0}
                        isValid={contest.form.prizepool.error === '' && !!contest.form.prizepool.value}
                        required
                    />
                    <Form.Control.Feedback type="invalid">
                        {contest.form.prizepool.error}
                    </Form.Control.Feedback>
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Control
                        type="date"
                        value={contest.form.endBy.value}
                        onChange={e => contest.setFormField('endBy', e.target.value)}
                        isInvalid={contest.form.endBy.error.length > 0}
                        isValid={contest.form.endBy.error === '' && !!contest.form.endBy.value}
                        required
                    />
                    <Form.Control.Feedback type="invalid">
                        {contest.form.endBy.error}
                    </Form.Control.Feedback>
                </Form.Group>
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
                    <Button
                        className="me-3"
                        onClick={() => navigate(-1)}
                    >
                        Отменить редактирование
                    </Button>
                }
            </Form>

            <Modal show={showPreview} onHide={handleClosePreview} size='xl' centered scrollable>
                <Modal.Body style={{ overflowY: 'auto' }}>
                    <Card className="mb-4 shadow-sm">
                        <Card.Header>
                            <Card.Title>
                                <h1>{contest.form.title.value}</h1>
                            </Card.Title>
                            <h2>
                                <Badge bg="secondary" className="">
                                    {contest.form.type.value ? contest.getTypeNameById(contest.form.type.value) : 'Тип'}
                                </Badge>
                                <Badge className="ms-2" bg={'success'}>
                                    {contest.getStatus(1)}
                                </Badge>
                            </h2>
                            <h4 className="mb-1">Дата окончания: {(new Date(contest.form.endBy.value)).toLocaleDateString('ru-RU', {})}<span className="ms-3">Приз: {contest.form.prizepool.value} руб.</span></h4>
                        </Card.Header>
                        <Card.Body>
                            <Card.Subtitle className="mb-1"><h2>Описание проекта</h2></Card.Subtitle>
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
                        <Card.Footer>
                            <Button variant="primary">
                                Добавить решение
                            </Button>
                        </Card.Footer>
                    </Card>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant='primary' onClick={handleClosePreview}>Закрыть предпросмотр</Button>
                </Modal.Footer>
            </Modal>

            <Modal show={showHelp} onHide={handleCloseHelp} size='lg' centered>
                <Modal.Header>
                    <Modal.Title>Справка</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div style={{ whiteSpace: 'pre-line' }}>
                        Для создания конкурса распишите подробно всю информацию в поле "Полное описание" в формате Markdown.
                        <br /><br />
                        Справка:{" "}
                        <a
                            href="https://www.markdownguide.org/cheat-sheet/"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            https://www.markdownguide.org/cheat-sheet/
                        </a>
                        <br /><br />
                        Чтобы отобразить изображения загруженных файлов, укажите вместо ссылки название файла, как в этом примере - ![Image](image.png)
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