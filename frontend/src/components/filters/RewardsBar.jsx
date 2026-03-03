import React, { useContext, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Context } from '../../main.jsx';
import { Form } from 'react-bootstrap';
import {BsTrophy} from 'react-icons/bs';

const RewardsBar = () => {
    const { contest } = useContext(Context);

    const [minReward, setMinReward] = useState(contest.minReward);
    const [maxReward, setMaxReward] = useState(contest.maxReward);

    useEffect(() => {
        setMinReward(contest.minReward);
        setMaxReward(contest.maxReward);
    }, [contest.minReward, contest.maxReward]);

    useEffect(() => {
        const min = minReward === '' ? 0 : Number(minReward);
        const max = maxReward === '' ? 999999 : Number(maxReward);
        contest.setReward({ min, max });
    }, [minReward, maxReward, contest]);

    const handleMinRewardChange = (e) => {
        setMinReward(e.target.value);
    };

    const handleMaxRewardChange = (e) => {
        setMaxReward(e.target.value);
    };

    return (
        <div style={{ width: '100%' }} className="mt-2">
            <div className="mt-2 mb-2">
                <BsTrophy color="#543787" />
                <span color="#543787" className="mx-1">Приз</span>
            </div>
            <Form>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Form.Group controlId="minReward" style={{ flex: 1 }}>
                        <Form.Control
                            type="number"
                            value={minReward}
                            onChange={handleMinRewardChange}
                            min="0"
                            placeholder="от 200"
                            style={{
                                fontSize: '0.8rem',
                            }}
                        />
                    </Form.Group>

                    <Form.Group controlId="maxReward" style={{ flex: 1 }}>
                        <Form.Control
                            type="number"
                            value={maxReward}
                            onChange={handleMaxRewardChange}
                            min="0"
                            placeholder="До 999999"
                            style={{
                                fontSize: '0.8rem',
                            }}
                        />
                    </Form.Group>
                </div>
            </Form>
        </div>
    );
};

export default observer(RewardsBar);