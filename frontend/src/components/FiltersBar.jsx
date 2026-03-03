import React, {useContext, useEffect} from 'react';
import { Row, Col } from "react-bootstrap";
import SearchBar from "./filters/SearchBar.jsx";
import TypeBar from "./filters/TypeBar.jsx";
import RewardBar from "./filters/RewardsBar.jsx";
import EndByBar from "./filters/EndByBar.jsx";
import EndAfterBar from "./filters/EndAfterBar.jsx";
import StatusBar from "./filters/StatusBar.jsx";
import { observer } from 'mobx-react-lite';
import {Context} from "../main.jsx";

const FiltersBar = () => {
    const {contest} = useContext(Context);
    useEffect(() => {
        const timeout = setTimeout(() => {
            contest.fetchContestsFiltered();
        }, 500);

        return () => clearTimeout(timeout);
    }, [
        contest.endAfter,
        contest.searchQuery,
        contest.selectedTypes,
        contest.minReward,
        contest.maxReward,
        contest.selectedStatuses,
        contest.endBy,
        contest
    ]);

    return (
        <Row className="g-3">
            <Col md={6}>
                <SearchBar />
            </Col>
            <Col md={6}>
                <TypeBar />
            </Col>
            <Col md={6}>
                <RewardBar />
            </Col>
            <Col md={6}>
            <StatusBar />
            </Col>
            <Col md={6}>
                <EndByBar />
            </Col>
            <Col md={6}>
                <EndAfterBar />
            </Col>
        </Row>
    );
};

export default observer(FiltersBar);