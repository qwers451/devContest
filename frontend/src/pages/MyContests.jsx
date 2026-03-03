import React, { useContext, useState, useEffect } from 'react';
import { Context } from "../main.jsx";
import ContestListWithFilters from "../components/ContestListWithFilters.jsx";

const MyContests = () => {
    const { contest, user } = useContext(Context);

    useEffect(() => {
        if (user.user.id) {
            contest.setEmployerId(user.user.id);
            // contest.setLoading(true);
        }
    }, [user]);

    return (
        <>
            <ContestListWithFilters />
        </>
    );
};

export default MyContests;
