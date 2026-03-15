import React, { useEffect, useContext, useState, useCallback } from 'react';
import { Context } from '../context';
import { sendData, updateData, deleteData } from '../services/apiService.js';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import Markdown from 'markdown-to-jsx';
import { PAYMENT_CHECKOUT_ROUTE } from '../utils/consts.js';

const CreateContest = () => {
    const { contest, user, payment } = useContext(Context);
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const contestData = location.state;

    const [tzFile, setTzFile] = useState(null);
    const [files, setFiles] = useState([]);
    const [existingFiles, setExistingFiles] = useState([]);
    const [imagesMap, setImagesMap] = useState({});
    const [showPreview, setShowPreview] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [mdDescription, setMdDescription] = useState('');
    const [state, setState] = useState(false);
    const [submitURL, setSubmitURL] = useState('/contests');
    const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

    const regex = /(!\[[^\]]*\])\(([^)]+)\)/g;

    useEffect(() => {
        contest.fetchTypes();
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!contest.validateForm()) return;
        if (!user.isAuth || !user.user?.id) {
            alert('Для создания конкурса необходимо войти в систему');
            navigate('/login');
            return;
        }

        let date = new Date(contest.form.endBy.value);
        date.setUTCHours(23, 59, 59, 999);

        const stages = contest.stages
            .filter(s => s.name.trim())
            .map((s, i) => ({
                name: s.name,
                description: s.description || undefined,
                deadline: s.deadline ? new Date(s.deadline).toISOString() : undefined,
                order: i + 1,
                prize_amount: s.prize_amount || 0,
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
            const res = state ? await updateData(submitURL, data) : await sendData(submitURL, data);
            contest.resetForm();

            // Upload TZ file if provided
            if (res.id && tzFile) {
                try {
                    const formData = new FormData();
                    formData.append('file', tzFile);
                    await sendData(`/contests/${res.id}/tz-file`, formData, true);
                } catch (e) {
                    console.error('TZ file upload failed:', e);
                }
                setTzFile(null);
            }

            // Upload general files if provided
            if (res.id && files.length > 0) {
                try {
                    const formData = new FormData();
                    files.forEach(f => formData.append('files', f));
                    await sendData(`/contests/${res.id}/files`, formData, true);
                } catch (e) {
                    console.error('Files upload failed:', e);
                }
                setFiles([]);
            }

            if (!state && res.id && res.status === 'draft') {
                // New contest created in draft — redirect to payment checkout
                navigate(
                    `${PAYMENT_CHECKOUT_ROUTE}?contest_id=${res.id}&amount=${data.prizepool}`
                );
            } else {
                navigate(-1);
                alert(`Конкурс успешно ${state ? 'изменён' : 'добавлен'}!`);
            }
        } catch (error) {
            console.error('Ошибка при отправке:', error);
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
            setExistingFiles(contestData.files || []);
        }
    }, [id, contestData]);

    const handleDeleteExistingFile = async (fileName) => {
        if (!contestData?.id) return;
        try {
            await deleteData(`/contests/${contestData.id}/files/${fileName}`);
            setExistingFiles(prev => prev.filter(f => f !== fileName));
        } catch (err) {
            alert('Ошибка удаления файла');
        }
    };

    const handleFilesChange = useCallback((newFiles) => {
        const allowedTypes = contest.form.files.allowedTypes;
        const validNew = Array.from(newFiles).filter(file => allowedTypes.includes(file.type));

        setFiles(prev => {
            const merged = [...prev];
            for (const f of validNew) {
                if (!merged.find(e => e.name === f.name)) merged.push(f);
            }
            contest.form.files.error = merged.length > contest.form.files.rules.max
                ? contest.formErrors.files : '';
            return merged;
        });

        setImagesMap(prev => {
            const updated = { ...prev };
            validNew.forEach(file => {
                if (file.type.startsWith('image/') && !prev[file.name]) {
                    updated[file.name] = URL.createObjectURL(file);
                }
            });
            return updated;
        });
    }, [contest]);

    useEffect(() => {
        return () => { Object.values(imagesMap).forEach(URL.revokeObjectURL); };
    }, [imagesMap]);

    useEffect(() => {
        const updatedMarkdown = contest.form.description.value.replace(regex, (match, p1, p2) => {
            return imagesMap[p2] ? `${p1}(${imagesMap[p2]})` : `${p1}(${p2})`;
        });
        setMdDescription(updatedMarkdown);
    }, [contest.form.description.value, imagesMap]);

    useEffect(() => {
        return () => { contest.resetForm(); };
    }, []);

    const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 text-gray-800 dark:text-gray-100 text-sm transition-all duration-200 bg-white dark:bg-gray-700';
    const inputErrCls = 'w-full px-4 py-2.5 rounded-xl border border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300 text-gray-800 dark:text-gray-100 text-sm transition-all duration-200 bg-white dark:bg-gray-700';
    const labelCls = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1';

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-6">
            <div className="max-w-3xl mx-auto px-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                    {state ? 'Редактировать конкурс' : 'Добавить конкурс'}
                </h1>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Type */}
                    <div>
                        <label className={labelCls}>Тип конкурса</label>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setTypeDropdownOpen(o => !o)}
                                className={`${contest.form.type.error ? inputErrCls : inputCls} text-left flex justify-between items-center`}
                            >
                                <span className={contest.form.type.value ? 'text-gray-800' : 'text-gray-400'}>
                                    {contest.form.type.value ? contest.getTypeNameById(contest.form.type.value) : 'Выберите тип'}
                                </span>
                                <span className="text-gray-400">{typeDropdownOpen ? '▲' : '▼'}</span>
                            </button>
                            {typeDropdownOpen && (
                                <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden">
                                    {contest.types.map(t => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => { contest.setFormField('type', t.id); setTypeDropdownOpen(false); }}
                                            className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-700 dark:hover:text-violet-400 transition-colors"
                                        >
                                            {t.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {contest.form.type.error && (
                            <p className="text-red-500 text-xs mt-1">{contest.form.type.error}</p>
                        )}
                    </div>

                    {/* Title */}
                    <div>
                        <label className={labelCls}>Название</label>
                        <input
                            type="text"
                            placeholder="Название конкурса"
                            value={contest.form.title.value}
                            onChange={e => contest.setFormField('title', e.target.value)}
                            className={contest.form.title.error.length > 0 ? inputErrCls : inputCls}
                        />
                        {contest.form.title.error && (
                            <p className="text-red-500 text-xs mt-1">{contest.form.title.error}</p>
                        )}
                    </div>

                    {/* Annotation */}
                    <div>
                        <label className={labelCls}>Краткое описание</label>
                        <input
                            type="text"
                            placeholder="Краткое описание"
                            value={contest.form.annotation.value}
                            onChange={e => contest.setFormField('annotation', e.target.value)}
                            className={contest.form.annotation.error.length > 0 ? inputErrCls : inputCls}
                        />
                        {contest.form.annotation.error && (
                            <p className="text-red-500 text-xs mt-1">{contest.form.annotation.error}</p>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <label className={labelCls}>Полное описание</label>
                        <textarea
                            rows={10}
                            placeholder="Полное описание (поддерживается Markdown)"
                            value={contest.form.description.value}
                            onChange={e => contest.setFormField('description', e.target.value)}
                            className={contest.form.description.error.length > 0 ? inputErrCls : inputCls}
                        />
                        {contest.form.description.error && (
                            <p className="text-red-500 text-xs mt-1">{contest.form.description.error}</p>
                        )}
                    </div>

                    {/* TZ text */}
                    <div>
                        <label className={labelCls}>Техническое задание</label>
                        <textarea
                            rows={6}
                            placeholder="Опишите требования к работе — ИИ использует их для автоматической оценки решений"
                            value={contest.form.tz_text.value}
                            onChange={e => contest.setFormField('tz_text', e.target.value)}
                            className={inputCls}
                        />
                        <div className="mt-2 flex items-center gap-3">
                            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-xs font-medium text-gray-600 dark:text-gray-300 transition-colors">
                                <span>📎</span>
                                <span>{tzFile ? tzFile.name : 'Загрузить ТЗ (PDF / DOCX)'}</span>
                                <input
                                    type="file"
                                    accept=".pdf,.docx"
                                    className="hidden"
                                    onChange={e => setTzFile(e.target.files[0] || null)}
                                />
                            </label>
                            {tzFile && (
                                <button
                                    type="button"
                                    onClick={() => setTzFile(null)}
                                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    ✕ убрать
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Необязательно. Текст или файл — используется для автоматической оценки решений с помощью LLaMA.
                            {tzFile && <span className="text-violet-600 ml-1">Текст из файла заменит введённый текст ТЗ.</span>}
                        </p>
                    </div>

                    {/* Prizepool */}
                    <div>
                        <label className={labelCls}>Призовой фонд (₽)</label>
                        <input
                            type="number"
                            placeholder="Например: 5000"
                            value={contest.form.prizepool.value}
                            onChange={e => contest.setFormField('prizepool', e.target.value)}
                            className={contest.form.prizepool.error.length > 0 ? inputErrCls : inputCls}
                        />
                        {contest.form.prizepool.error && (
                            <p className="text-red-500 text-xs mt-1">{contest.form.prizepool.error}</p>
                        )}
                    </div>

                    {/* End date */}
                    <div>
                        <label className={labelCls}>Дата окончания</label>
                        <input
                            type="date"
                            value={contest.form.endBy.value}
                            onChange={e => contest.setFormField('endBy', e.target.value)}
                            className={contest.form.endBy.error.length > 0 ? inputErrCls : inputCls}
                        />
                        {contest.form.endBy.error && (
                            <p className="text-red-500 text-xs mt-1">{contest.form.endBy.error}</p>
                        )}
                    </div>

                    {/* Stages */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">Этапы конкурса</h3>
                            <button
                                type="button"
                                onClick={() => contest.addStage()}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-violet-200 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-xs font-medium transition-colors"
                            >
                                + Добавить этап
                            </button>
                        </div>
                        {contest.stages.length === 0 && (
                            <p className="text-sm text-gray-400 dark:text-gray-500">Необязательно. Разбейте работу на части с отдельными дедлайнами.</p>
                        )}
                        <div className="space-y-2">
                            {contest.stages.map((stage, index) => (
                                <div key={index} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 border border-gray-100 dark:border-gray-600">
                                    <div className="flex items-start gap-2">
                                        <span className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                                            {stage.order}
                                        </span>
                                        <div className="flex-1 space-y-2">
                                            <input
                                                placeholder="Название этапа *"
                                                value={stage.name}
                                                onChange={e => contest.updateStage(index, 'name', e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                                            />
                                            <input
                                                placeholder="Описание этапа (необязательно)"
                                                value={stage.description}
                                                onChange={e => contest.updateStage(index, 'description', e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                                            />
                                            <input
                                                type="date"
                                                value={stage.deadline}
                                                onChange={e => contest.updateStage(index, 'deadline', e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                                            />
                                            <input
                                                type="number"
                                                placeholder="Выплата за этап (₽), 0 = весь призовой фонд"
                                                value={stage.prize_amount || ''}
                                                onChange={e => contest.updateStage(index, 'prize_amount', parseInt(e.target.value) || 0)}
                                                min={0}
                                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-400 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => contest.removeStage(index)}
                                            className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 text-xs transition-colors flex-shrink-0"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Files */}
                    <div>
                        <label className={labelCls}>Файлы</label>
                        {state && existingFiles.length > 0 && (
                            <ul className="mb-2 space-y-1">
                                {existingFiles.map((f, i) => (
                                    <li key={i} className="flex items-center gap-2 text-sm">
                                        <span className="text-gray-700">{f}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteExistingFile(f)}
                                            className="text-red-400 hover:text-red-600 text-xs transition-colors"
                                        >✕ удалить</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <input
                            type="file"
                            multiple
                            onChange={e => handleFilesChange(e.target.files)}
                            className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
                        />
                        {files.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5">
                                {files.map((f, i) => (
                                    <li key={i} className="flex items-center gap-2 text-xs text-gray-500">
                                        <span>+ {f.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                                            className="text-red-400 hover:text-red-600 transition-colors"
                                        >✕</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {contest.form.files.error && (
                            <p className="text-red-500 text-xs mt-1">{contest.form.files.error}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                            Поддерживаемые форматы: .zip, .png, .jpg, .jpeg, .gif. Не более {contest.form.files.rules.max} файлов.
                        </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3 flex-wrap pt-2">
                        <button
                            type="submit"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-all duration-200 shadow-sm"
                        >
                            Опубликовать
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowPreview(true)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-sm transition-all duration-200"
                        >
                            Предпросмотр
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowHelp(true)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-sm transition-all duration-200"
                        >
                            Справка
                        </button>
                        {state && (
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm transition-all duration-200"
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
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-fade-in border border-transparent dark:border-gray-700" onClick={e => e.stopPropagation()}>
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Предпросмотр</h2>
                                <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">✕</button>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5">
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{contest.form.title.value || 'Без названия'}</h1>
                                <div className="flex gap-2 mb-3">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                        {contest.form.type.value ? contest.getTypeNameById(contest.form.type.value) : 'Тип'}
                                    </span>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                                        Активный
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                                    До: {new Date(contest.form.endBy.value).toLocaleDateString('ru-RU')} &nbsp;|&nbsp;
                                    Приз: {contest.form.prizepool.value} руб.
                                </p>
                                <hr className="my-4 border-gray-200 dark:border-gray-700" />
                                <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-2">Описание проекта</h3>
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    <Markdown options={{ disableParsingRawHTML: true }}>{mdDescription}</Markdown>
                                </div>
                                {contest.form.tz_text.value && (
                                    <>
                                        <hr className="my-4 border-gray-200 dark:border-gray-700" />
                                        <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-2">Техническое задание</h4>
                                        <pre className="whitespace-pre-wrap text-sm bg-white dark:bg-gray-700 dark:text-gray-200 p-3 rounded-xl border border-gray-100 dark:border-gray-600">
                                            {contest.form.tz_text.value}
                                        </pre>
                                    </>
                                )}
                                {contest.stages.length > 0 && (
                                    <>
                                        <hr className="my-4 border-gray-200 dark:border-gray-700" />
                                        <h4 className="font-bold text-gray-800 dark:text-gray-200 mb-2">Этапы</h4>
                                        {contest.stages.map((stage, i) => (
                                            <div key={i} className="flex items-start gap-2 mb-2">
                                                <span className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300 flex items-center justify-center text-xs font-bold flex-shrink-0">{stage.order}</span>
                                                <div>
                                                    <strong className="text-sm dark:text-gray-200">{stage.name || '(без названия)'}</strong>
                                                    {stage.deadline && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">до {new Date(stage.deadline).toLocaleDateString('ru-RU')}</span>}
                                                    {stage.description && <div className="text-xs text-gray-500 dark:text-gray-400">{stage.description}</div>}
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
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
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in border border-transparent dark:border-gray-700" onClick={e => e.stopPropagation()}>
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Справка</h2>
                                <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">✕</button>
                            </div>
                            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-3">
                                <p>Для создания конкурса распишите подробно всю информацию в поле "Полное описание" в формате Markdown.</p>
                                <p>
                                    Справка:{' '}
                                    <a href="https://www.markdownguide.org/cheat-sheet/" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">
                                        markdownguide.org
                                    </a>
                                </p>
                                <p>Чтобы отобразить изображения загруженных файлов, укажите вместо ссылки название файла — <code className="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 px-1 rounded">![Image](image.png)</code></p>
                                <p><strong>Техническое задание</strong> — структурированные требования к работе. ИИ (LLaMA) автоматически оценит каждое решение по этим критериям.</p>
                                <p><strong>Этапы</strong> — разбейте работу на части с отдельными дедлайнами. Необязательно.</p>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                            <button onClick={() => setShowHelp(false)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm transition-colors">
                                Закрыть справку
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default observer(CreateContest);
