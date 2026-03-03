import React, { useState } from 'react';
import { Button } from "react-bootstrap";
import ContestTypeModal from "./ContestTypeModal.jsx";

const AddContestTypePanel = () => {
    const [showModal, setShowModal] = useState(false);

    const handleOpenModal = () => setShowModal(true);
    const handleCloseModal = () => setShowModal(false);

    const handleTypeAdded = () => {
        console.log("Тип конкурса успешно добавлен!");
    };

    return (
        <div className="text-center">
            <h4 className="mb-4">Добавление типа конкурса</h4>

            <Button
                onClick={handleOpenModal}
                style={{
                    backgroundColor: "#543787",
                    borderColor: "#543787",
                    color: "white",
                    padding: "10px 20px",
                }}
            >
                Добавить тип конкурса
            </Button>

            <ContestTypeModal
                show={showModal}
                onHide={handleCloseModal}
                onSuccess={handleTypeAdded}
            />
        </div>
    );
};

export default AddContestTypePanel;
