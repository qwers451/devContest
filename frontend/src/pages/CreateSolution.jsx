import { useEffect, useContext, useState, useCallback } from 'react';
import { Context } from '../main.jsx';
import { sendData } from '../services/apiService.js';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import Markdown from 'markdown-to-jsx';

const CreateSolution = () => {
    const { contest, solution, user } = useContext(Context);
    const { number } = useParams();
    const [error, setError] = useState(null);
    const location = useLocation();
    const solutionData = location.state;
    const navigate = useNavigate();

    const [files, setFiles] = useState([]);
    const [imagesMap, setImagesMap] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [mdDescription, setMdDescription] = useState('');
    const [state, setState] = useState(false);
    const [submitURL, setSubmitURL] = useState('/submissions');

    const regex = /(!\[[^\]]*\])\(([^)]+)\)/g;

    useEffect(() => {
        const fetch = async () => {
            if (contest.currentContest && contest.currentContest.number == number) {
                contest.setCurrentContest(contest.currentContest);
            } else {
                const fetched = await contest.fetchOneContestByNumber(number);
                if (fetched) {
                    contest.setCurrentContest(fetched);
                } else {
                    setError('Конкурс не найден.');
                }
            }
        };
        fetch();
    }, [number, contest]);

    const contestId = contest.currentContest?.id;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!solution.validateForm()) return;
        if (!user.isAuth || !user.user?.id) {
            alert('Необходимо авторизоваться, чтобы добавить решение');
            navigate('/login');
            return;
        }

        const data = {
            contest_id: contestId,
            title: solution.form.title.value,
            annotation: solution.form.annotation.value,
            description: solution.form.description.value
        };

        try {
            const res = await sendData(submitURL, data);
            if (files.length > 0) {
                const formData = new FormData();
                files.forEach(file => formData.append('files', file));
                await sendData(`/submissions/${res.id}/files`, formData, true);
            }
            solution.resetForm();
            navigate(-1);
            alert(`Решение успешно ${state ? 'изменёно' : 'отправлено'}!`);
        } catch (error) {
            console.error('Ошибка при отправке решения:', error);
            alert(`Ошибка при ${state ? 'редактировании' : 'отправке'} решения`);
        }
    };

    useEffect(() => {
        if (!number) {
            setState(false);
            setSubmitURL('/submissions');
            solution.resetForm();
        }
        if (solutionData) {
            setState(true);
            setSubmitURL(`/submissions/${solutionData.id}`);
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
        return () => { Object.values(imagesMap).forEach(URL.revokeObjectURL); };
    }, [imagesMap]);

    useEffect(() => {
        const updatedMarkdown = solution.form.description.value.replace(regex, (match, p1, p2) => {
            return imagesMap[p2] ? `${p1}(${imagesMap[p2]})` : `${p1}(${p2})`;
        });
        setMdDescription(updatedMarkdown);
    }, [solution.form.description.value, imagesMap]);

    useEffect(() => {
        return () => { solution.resetForm(); };
    }, [solution]);

    if (error) return <div className="max-w-3xl mx-auto px-4 py-10 text-red-500">{error}</div>;

    const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 text-sm transition-all duration-200 bg-white';
    const inputErrCls = 'w-full px-4 py-2.5 rounded-xl border border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300 text-gray-800 text-sm transition-all duration-200 bg-white';
    const labelCls = 'block text-sm font-semibold text-gray-700 mb-1';

    return (
        <div className="min-h-screen bg-gray-50 py-6">
            <div className="max-w-3xl mx-auto px-4">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">
                    {state ? 'Редактирование решения' : 'Создание решения'}
                </h1>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Title */}
                    <div>
                        <label className={labelCls}>Название</label>
                        <input
                            type="text"
                            placeholder="Название решения"
                            value={solution.form.title.value}
                            onChange={e => solution.setFormField('title', e.target.value)}
                            className={solution.form.title.error.length > 0 ? inputErrCls : inputCls}
                        />
                        {solution.form.title.error && <p className="text-red-500 text-xs mt-1">{solution.form.title.error}</p>}
                    </div>

                    {/* Annotation */}
                    <div>
                        <label className={labelCls}>Аннотация</label>
                        <input
                            type="text"
                            placeholder="Краткое описание решения"
                            value={solution.form.annotation.value}
                            onChange={e => solution.setFormField('annotation', e.target.value)}
                            className={solution.form.annotation.error.length > 0 ? inputErrCls : inputCls}
                        />
                        {solution.form.annotation.error && <p className="text-red-500 text-xs mt-1">{solution.form.annotation.error}</p>}
                    </div>

                    {/* Description */}
                    <div>
                        <label className={labelCls}>Описание</label>
                        <textarea
                            rows={10}
                            placeholder="Подробное описание (поддерживается Markdown)"
                            value={solution.form.description.value}
                            onChange={e => solution.setFormField('description', e.target.value)}
                            className={solution.form.description.error.length > 0 ? inputErrCls : inputCls}
                        />
                        {solution.form.description.error && <p className="text-red-500 text-xs mt-1">{solution.form.description.error}</p>}
                    </div>

                    {/* Files */}
                    <div>
                        <label className={labelCls}>Файлы</label>
                        <input
                            type="file"
                            multiple
                            onChange={e => handleFilesChange(e.target.files)}
                            className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
                        />
                        {solution.form.files.error && <p className="text-red-500 text-xs mt-1">{solution.form.files.error}</p>}
                        <p className="text-xs text-gray-400 mt-1">
                            Поддерживаемые форматы: .zip, .png, .jpg, .jpeg, .gif. Не более {solution.form.files.rules.max} файлов.
                        </p>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 flex-wrap pt-2">
                        <button
                            type="submit"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-all duration-200 shadow-sm"
                        >
                            Отправить
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowPreview(true)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-all duration-200"
                        >
                            Предпросмотр
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowHelp(true)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-all duration-200"
                        >
                            Справка
                        </button>
                        {state && (
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 font-semibold text-sm transition-all duration-200"
                            >
                                Отменить редактирование
                            </button>
                        )}
                    </div>
                </form>
            </div>

            {/* Preview Modal */}
            {showPreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowPreview(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-gray-900">Предпросмотр решения</h2>
                                <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-5">
                                <h1 className="text-2xl font-bold text-gray-900 mb-1">{solution.form.title.value || 'Без названия'}</h1>
                                <p className="text-sm text-gray-500 mb-3">
                                    Конкурс «{contest.currentContest?.title || 'Неизвестный конкурс'}» от {user.getById(contest.currentContest?.customer_id)?.login || 'Неизвестно'}
                                </p>
                                <hr className="my-4 border-gray-200" />
                                <h3 className="text-base font-bold text-gray-800 mb-2">Описание</h3>
                                <div className="prose prose-sm max-w-none">
                                    <Markdown options={{ disableParsingRawHTML: true }}>{mdDescription}</Markdown>
                                </div>
                                {files.length > 0 && (
                                    <>
                                        <hr className="my-4 border-gray-200" />
                                        <h4 className="font-bold text-gray-800 mb-2">Файлы</h4>
                                        <ul className="space-y-1">
                                            {files.map((file, idx) => (
                                                <li key={idx} className="text-sm text-violet-600">{file.name}</li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100">
                            <button onClick={() => setShowPreview(false)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors">
                                Закрыть предпросмотр
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Help Modal */}
            {showHelp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowHelp(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in" onClick={e => e.stopPropagation()}>
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-gray-900">Справка по оформлению</h2>
                                <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
                            </div>
                            <div className="text-sm text-gray-700 space-y-2">
                                <p>Название: от {solution.form.title.rules.min} до {solution.form.title.rules.max} символов.</p>
                                <p>Аннотация: от {solution.form.annotation.rules.min} до {solution.form.annotation.rules.max} символов.</p>
                                <p>Описание: от {solution.form.description.rules.min} до {solution.form.description.rules.max} символов.</p>
                                <p>Файлы: zip-архивы и изображения, не более {solution.form.files.rules.max} штук.</p>
                                <p>
                                    Используйте Markdown для оформления.{' '}
                                    <a href="https://www.markdownguide.org/cheat-sheet/" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">
                                        Подробнее
                                    </a>
                                </p>
                                <p>Пример вставки изображения: <code className="bg-gray-100 px-1 rounded">![alt](image.jpg)</code></p>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100">
                            <button onClick={() => setShowHelp(false)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors">
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default observer(CreateSolution);
