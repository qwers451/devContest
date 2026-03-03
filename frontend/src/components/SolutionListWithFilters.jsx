import {useContext, useState} from 'react';
import { Row, Col, Container, Button, Collapse, Card, Pagination } from "react-bootstrap";
import { BsFilter } from 'react-icons/bs';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { Context } from "../main.jsx";
import SolutionsFiltersBar from './SolutionsFiltersBar.jsx';
import SolutionsList from './SolutionsList.jsx';

const SolutionListWithFilters = ({ title, showContestTitle, showFreelancerLogin, isMySolutions }) => {
    const { contest, solution } = useContext(Context);
    const [open, setOpen] = useState(false);

    const navigate = useNavigate();

    const handleResetFilters = () => {
        solution.resetFilters();
    };

    const handleGoToContest = () => {
        if (solution.contestId) {
            navigate(`/contest/${contest.currentContest.number}`);
        }
    };

    const handlePageChange = (newPage) => {
        solution.setPage(newPage);
        solution.fetchSolutionsFiltered();
    };

    const totalPages = Math.ceil(solution.totalCount / solution.limit);

    return (
        <Container className="py-3">
            {title && (
                <h2 className="mb-3" style={{ fontWeight: '600' }}>{title}</h2>
            )}

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

                {!isMySolutions && (
                    <Button
                        onClick={handleGoToContest}
                        variant="outline-primary"
                        size="sm"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            fontWeight: '500',
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '14px',
                            height: '35px',
                            lineHeight: '1',
                        }}
                    >
                        К конкурсу
                    </Button>
                )}
            </div>

            <Collapse in={open}>
                <div id="filters-collapse">
                    <Card className="mb-3 shadow-sm border-0">
                        <Card.Body className="py-3 px-3">
                            <SolutionsFiltersBar
                                isMySolutions={isMySolutions}
                            />
                        </Card.Body>
                    </Card>
                </div>
            </Collapse>

            <Row>
                <Col>
                    <SolutionsList
                        showContestTitle={showContestTitle}
                        showFreelancerLogin={showFreelancerLogin}
                    />
                    {totalPages > 1 && (
                        <Pagination className="justify-content-center mt-3">
                            <Pagination.First disabled={solution.page === 1} onClick={() => handlePageChange(1)} />
                            <Pagination.Prev disabled={solution.page === 1} onClick={() => handlePageChange(solution.page - 1)} />
                            {[...Array(totalPages)].map((_, index) => {
                                const pageNum = index + 1;
                                return (
                                    <Pagination.Item
                                        key={pageNum}
                                        active={solution.page === pageNum}
                                        onClick={() => handlePageChange(pageNum)}
                                    >
                                        {pageNum}
                                    </Pagination.Item>
                                );
                            })}
                            <Pagination.Next disabled={solution.page === totalPages} onClick={() => handlePageChange(solution.page + 1)} />
                            <Pagination.Last disabled={solution.page === totalPages} onClick={() => handlePageChange(totalPages)} />
                        </Pagination>
                    )}
                </Col>
            </Row>
        </Container>
    );
};

export default observer(SolutionListWithFilters);
