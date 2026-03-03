import React, { useContext, useEffect } from 'react';
import { Row, Col } from "react-bootstrap";
import { observer } from 'mobx-react-lite';
import { Context } from "../main.jsx";
import SearchBar from './solutions-filters/SearchBar.jsx';
import StatusBar from './solutions-filters/StatusBar.jsx';
import AddedBeforeBar from './solutions-filters/AddedBeforeBar.jsx';
import AddedAfterBar from './solutions-filters/AddedAfterBar.jsx';

const SolutionsFiltersBar = ({ isMySolutions }) => {
    const {solution} = useContext(Context);
    useEffect(() => {
        const timeout = setTimeout(() => {
            solution.setPage(1);
            solution.fetchSolutionsFiltered();
        }, 500);

        return () => clearTimeout(timeout);
    }, [
        solution.searchQuery,
        solution.selectedStatuses,
        solution.addedBefore,
        solution.addedAfter,
        solution
    ]);

    return (
        <Row className="g-3">
            <Col md={6}>
                <SearchBar
                    isMySolutions={isMySolutions}
                />
            </Col>
            <Col md={6}>
                <StatusBar />
            </Col>
            <Col md={6}>
                <AddedBeforeBar />
            </Col>
            <Col md={6}>
                <AddedAfterBar />
            </Col>
        </Row>
    );
};

export default observer(SolutionsFiltersBar);
