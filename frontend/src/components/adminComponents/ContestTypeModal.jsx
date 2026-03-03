import React, { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { sendData } from '../../services/apiService.js';
import { observer } from "mobx-react-lite";

const ContestTypeModal = ({ show, onHide, onSuccess }) => {
    const [name, setName] = useState("");

    const handleSubmit = async () => {
        if (!name.trim()) {
            alert("Введите название типа конкурса");
            return;
        }

        try {
            await sendData('/contest-types', { name });
            alert("Тип конкурса добавлен!");
            setName("");
            onSuccess?.();
            onHide();
        } catch (error) {
            alert(`Ошибка при добавлении: ${error.response?.data?.error || error.message}`);
        }
    };

    return (
        <Modal show={show} onHide={onHide} >
            <Modal.Header closeButton>
                <Modal.Title>Добавить тип конкурса</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <Form.Group controlId="contestTypeName">
                        <Form.Label>Название типа</Form.Label>
                        <Form.Control
                            type="text"
                            placeholder="Введите название"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </Form.Group>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>Отменить</Button>
                <Button variant="primary" onClick={handleSubmit}>Добавить</Button>
            </Modal.Footer>
        </Modal>
    );
};

export default observer(ContestTypeModal);