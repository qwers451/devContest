import React, {useContext, useEffect, useState} from 'react';
import { Row, Col, Container, Button, Collapse, Card } from "react-bootstrap";
import ContestsList from "./ContestsList.jsx";
import { Context } from "../main.jsx";
import FiltersBar from "./FiltersBar.jsx";
import { BsFilter } from 'react-icons/bs';
import { observer } from 'mobx-react-lite'; // не забудь, чтобы работать с mobx

const ContestListWithFilters = () => {
    const { contest } = useContext(Context);
    const [open, setOpen] = useState(false);

    const handleResetFilters = () => {
        contest.resetFilters();
    };

    return (
        <Container className="py-3">
            <div className="d-flex mb-2 gap-2">
                <Button
                    onClick={() => setOpen(!open)}
                    aria-controls="filters-collapse"
                    aria-expanded={open}
                    style={{
                        backgroundColor: '#543787',
                        borderColor: '#543787',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: '500',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '16px',
                        height: '35px',
                        lineHeight: '1'
                    }}
                    size="sm"
                >
                    <BsFilter size={14} />
                    {open ? 'Скрыть' : 'Фильтры'}
                </Button>

                <Button
                    onClick={handleResetFilters}
                    variant="outline-secondary"
                    size="sm"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: '500',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '14px',
                        height: '35px',
                        lineHeight: '1',
                    }}
                >
                    Сбросить фильтры
                </Button>
            </div>

            <Collapse in={open}>
                <div id="filters-collapse">
                    <Card className="mb-3 shadow-sm border-0">
                        <Card.Body className="py-3 px-3">
                            <FiltersBar />
                        </Card.Body>
                    </Card>
                </div>
            </Collapse>

            <Row>
                <Col>
                    <ContestsList />
                </Col>
            </Row>
        </Container>
    );
};

export default observer(ContestListWithFilters); //