import React, { useContext, useEffect, useState } from 'react';
import { Container, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import { Context } from '../main.jsx';
import { fetchData, updateData } from '../services/apiService.js';
import { PROFILE_ROUTE } from '../utils/consts.js';
import { useNavigate } from 'react-router-dom';

const ProfilePage = () => {
    const { user } = useContext(Context);
    const navigate  = useNavigate();
    const userId    = user.user.id;

    const [loading, setLoading]     = useState(true);
    const [saving, setSaving]       = useState(false);
    const [error, setError]         = useState(null);
    const [form, setForm] = useState({
        email: '',
        login: '',
        password: ''
    });

    useEffect(() => {
        (async () => {
            try {
                const data = await fetchData(`/profile?userId=${userId}`);
                setForm({
                    email: data.email || '',
                    login: data.login || '',
                    password: ''  // пароль не возвращаем, поле остаётся пустым
                });
            } catch (err) {
                setError(err.response?.data?.error || 'Не удалось загрузить профиль');
            } finally {
                setLoading(false);
            }
        })();
    }, [userId]);

    const handleChange = (e) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setSaving(true);

        // подготавливаем payload — не отправляем пустой пароль
        const payload = {
            email: form.email,
            login: form.login,
            ...(form.password ? { password: form.password } : {})
        };

        try {
            const updated = await updateData(`/profile`, { id: userId, ...payload });
            // Обновляем MobX-стор
            user.setUser(updated);
            alert('Профиль сохранён');
        } catch (err) {
            setError(err.response?.data?.error || 'Ошибка при сохранении');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Container className="mt-4 text-center">
                <Spinner animation="border" /><p>Загрузка профиля…</p>
            </Container>
        );
    }

    return (
        <Container style={{ maxWidth: '500px', marginTop: '40px' }}>
            <h2 className="mb-4">Мой профиль</h2>
            {error && <Alert variant="danger">{error}</Alert>}

            <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3" controlId="profileEmail">
                    <Form.Label>Email</Form.Label>
                    <Form.Control
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        required
                    />
                </Form.Group>

                <Form.Group className="mb-3" controlId="profileLogin">
                    <Form.Label>Логин</Form.Label>
                    <Form.Control
                        type="text"
                        name="login"
                        value={form.login}
                        onChange={handleChange}
                        required
                    />
                </Form.Group>

                <Form.Group className="mb-3" controlId="profilePassword">
                    <Form.Label>Новый пароль</Form.Label>
                    <Form.Control
                        type="password"
                        name="password"
                        value={form.password}
                        onChange={handleChange}
                        placeholder="Оставьте пустым, чтобы не менять"
                    />
                </Form.Group>

                <div className="d-flex justify-content-between">
                    <Button variant="secondary" onClick={() => navigate(-1)} disabled={saving}>
                        Отмена
                    </Button>
                    <Button type="submit" variant="primary" disabled={saving}>
                        {saving ? 'Сохранение…' : 'Сохранить'}
                    </Button>
                </div>
            </Form>
        </Container>
    );
};

export default observer(ProfilePage);