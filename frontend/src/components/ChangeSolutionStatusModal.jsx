import React, { useState, useContext } from "react";
import { Modal, Button, Form } from "react-bootstrap";
import { Context } from "../main.jsx";

const ChangeSolutionStatusModal = ({ 
    show,
    onHide,
    currentStatus,
    onSave
}) => {
    const { solution } = useContext(Context);
    const [selectedStatus, setSelectedStatus] = useState(currentStatus);

    const statusOptions = Object.entries(solution.statusMap).map(([value, data]) => ({
        value: parseInt(value),
        label: data.label
    }));

    const handleSave = () => {
        onSave(selectedStatus);
        onHide();
    };

    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>
                <Modal.Title>Статус решения</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form.Group>
                    <Form.Label>Выберите новый статус:</Form.Label>
                    <Form.Select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(parseInt(e.target.value))}
                    >
                        {statusOptions.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </Form.Select>
                </Form.Group>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>
                    Отмена
                </Button>
                <Button variant="primary" onClick={handleSave}>
                    Сохранить
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default ChangeSolutionStatusModal;
